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


def kaggle(*args, check=True):
    r = subprocess.run(['kaggle', *args], capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip()
    if check and r.returncode:
        sys.exit(f'kaggle {" ".join(args)} 失敗：{out}')
    return out


print('推到 Kaggle：', SLUG, '（GPU）' if job.get('gpu') else '（不用 GPU）', flush=True)
print(kaggle('kernels', 'push', '-p', work), flush=True)
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
