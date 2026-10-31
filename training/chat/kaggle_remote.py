# 在 GitHub Actions 上執行：把 kaggle.ipynb 推到使用者的 Kaggle 開跑、等它跑完、把結果印出來
# 需要 GitHub Secrets：KAGGLE_USERNAME，以及 KAGGLE_API_TOKEN（新版金鑰）或 KAGGLE_KEY（舊版 kaggle.json 裡的 key）
# Hugging Face 金鑰不經過這裡：它綁在 Kaggle 筆記本的 Secrets（第一次要使用者在 Kaggle 勾一次 HF_TOKEN）
import json, os, re, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
job = json.load(open(os.path.join(HERE, 'job.json'), encoding='utf-8'))
user = os.environ.get('KAGGLE_USERNAME')
if not user or not (os.environ.get('KAGGLE_API_TOKEN') or os.environ.get('KAGGLE_KEY')):
    sys.exit('GitHub Secrets 缺 KAGGLE_USERNAME 或 KAGGLE_API_TOKEN／KAGGLE_KEY')
SLUG = f'{user}/math-tutor-auto'


def kaggle(*args, check=True):
    r = subprocess.run(['kaggle', *args], capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip()
    if check and r.returncode:
        sys.exit(f'kaggle {" ".join(args)} 失敗：{out}')
    return out


if '--status' in sys.argv:
    # 只查狀態：列出每本筆記本最新一次執行的狀態
    refs = [l.split(',')[0] for l in kaggle('kernels', 'list', '--mine', '--csv', '--page-size', '100', check=False).splitlines()[1:]]
    refs = [r for r in refs if '/' in r]
    for extra in ['notebookcb7bb615e4', 'math-tutor-auto']:
        if f'{user}/{extra}' not in refs:
            refs.append(f'{user}/{extra}')
    for ref in refs:
        print(ref.split('/')[1], '→', kaggle('kernels', 'status', ref, check=False).splitlines()[-1].split('status')[-1], flush=True)
    # 自動那本最近一次的報告（跑完才有）
    out = os.path.join(os.environ.get('RUNNER_TEMP', '/tmp'), 'kernel-out')
    kaggle('kernels', 'output', SLUG, '-p', out, '--file-pattern', r'report\.txt$', check=False)
    for root, _, files in os.walk(out):
        for f in files:
            print(f'\n===== {f} =====\n' + open(os.path.join(root, f), encoding='utf-8', errors='replace').read(), flush=True)
    sys.exit(0)
work = os.path.join(os.environ.get('RUNNER_TEMP', '/tmp'), 'kernel')
shutil.rmtree(work, ignore_errors=True)
os.makedirs(work)
shutil.copy(os.path.join(HERE, 'kaggle.ipynb'), work)
meta = {
    'id': SLUG, 'title': 'math-tutor-auto', 'code_file': 'kaggle.ipynb', 'language': 'python', 'kernel_type': 'notebook',
    'is_private': True, 'enable_gpu': bool(job.get('gpu')), 'enable_internet': True,
    'dataset_sources': [], 'competition_sources': [], 'kernel_sources': [], 'model_sources': [],
}
if job.get('gpu'):
    meta['machine_shape'] = 'NvidiaTeslaT4'
json.dump(meta, open(os.path.join(work, 'kernel-metadata.json'), 'w'))




print('推到 Kaggle：', SLUG, '（GPU）' if job.get('gpu') else '（不用 GPU）', flush=True)
pushed = kaggle('kernels', 'push', '-p', work)
print(pushed, flush=True)
if 'session count' in pushed.lower():
    # 列出 Kaggle 認為還在跑的筆記本，方便查原因
    print('--- 你的筆記本狀態 ---', flush=True)
    for line in kaggle('kernels', 'list', '--mine', '--csv', check=False).splitlines()[1:]:
        ref = line.split(',')[0]
        if '/' in ref:
            print(ref, '→', kaggle('kernels', 'status', ref, check=False).splitlines()[-1], flush=True)
    if 'machine_shape' in meta:
        print('改用預設 GPU 再試一次', flush=True)
        del meta['machine_shape']
        json.dump(meta, open(os.path.join(work, 'kernel-metadata.json'), 'w'))
        pushed = kaggle('kernels', 'push', '-p', work)
        print(pushed, flush=True)
if 'error' in pushed.lower():
    if 'session count' in pushed.lower():
        sys.exit('Kaggle 說同時跑的 GPU 工作已滿 2 個：請到 Kaggle「View Active Events」把還在跑的停掉，再重跑')
    sys.exit('推到 Kaggle 失敗（看上一行）')
time.sleep(60)
start = time.time()
while True:
    s = kaggle('kernels', 'status', SLUG, check=False)
    state = (re.search(r'status "([^"]+)"', s) or [None, s])[1].lower()
    print(f'{int((time.time() - start) / 60)} 分：{state}', flush=True)
    if any(w in state for w in ['complete', 'error', 'cancel']):
        break
    if time.time() - start > 5.5 * 3600:
        sys.exit('等太久（超過 5.5 小時），請到 Kaggle 看')
    time.sleep(120)

out = os.path.join(os.environ.get('RUNNER_TEMP', '/tmp'), 'kernel-out')
shutil.rmtree(out, ignore_errors=True)
# 只抓小檔：報告與記錄（模型檔在 Kaggle 已經刪掉、已上傳 Hugging Face）
kaggle('kernels', 'output', SLUG, '-p', out, '--file-pattern', r'(report\.txt|train\.log|.*\.log)$', check=False)
report = ''
for root, _, files in os.walk(out):
    for f in sorted(files):
        p = os.path.join(root, f)
        text = open(p, encoding='utf-8', errors='replace').read()
        if f == 'report.txt':
            report = text
        print(f'\n===== {os.path.relpath(p, out)}（最後 80 行）=====')
        print('\n'.join(text.splitlines()[-80:]))
summary = os.environ.get('GITHUB_STEP_SUMMARY')
if summary:
    open(summary, 'a', encoding='utf-8').write(f'## Kaggle：{state}\n\n```\n{report or "（沒有報告，看上面的記錄）"}\n```\n')
if 'complete' not in state or 'FAILED' in report:
    sys.exit(f'Kaggle 沒有成功：{state}')
