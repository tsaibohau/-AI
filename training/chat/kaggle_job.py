# Kaggle／Colab 的總開關：讀 job.json，自動決定要做什麼（使用者只要按 Run All）
#   有 GPU：裝訓練套件 → 訓練（train.py）→ 印訓練前後對照 → 轉手機版並上傳（to_mlc.py）
#   沒有 GPU：只轉手機版（從 Hugging Face 抓已上傳的私人模型）
import json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
job = json.load(open(os.path.join(HERE, 'job.json'), encoding='utf-8'))
SIZE = job.get('size', '0.5b')
BASE = '/kaggle/working' if os.path.exists('/kaggle/working') else '/content'
OUT = f'{BASE}/out-{SIZE}'
os.makedirs(OUT, exist_ok=True)
env = {**os.environ, 'OUT': OUT, 'SIZE': SIZE}
REPORT = f'{BASE}/report.txt'
open(REPORT, 'w').close()


def report(*lines):
    text = '\n'.join(lines)
    print(text, flush=True)
    open(REPORT, 'a', encoding='utf-8').write(text + '\n')


def sh(*cmd):
    print('$', ' '.join(cmd), flush=True)
    subprocess.run(cmd, check=True, env=env)


def gpu():
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False


report(f'模型大小：{SIZE}；' + ('有 GPU：訓練＋轉檔' if gpu() else '沒有 GPU：只轉檔'))
if not os.environ.get('HF_TOKEN'):
    # 不浪費 GPU 時間：沒有金鑰就不能上傳，直接停
    report('FAILED：沒有讀到 HF_TOKEN。請到 Kaggle 打開這本筆記本 → Add-ons → Secrets → 勾選 HF_TOKEN')
    sys.exit(1)

if gpu():
    # 舊版 torchao 會讓 LoRA 出錯；用比較穩的版本（T4 也能跑）
    sh(sys.executable, '-m', 'pip', 'uninstall', '-y', '-q', 'torchao')
    sh(sys.executable, '-m', 'pip', 'install', '-q', 'transformers==4.56.2', 'trl==0.23.1', 'peft==0.17.1', 'datasets', 'accelerate', 'huggingface_hub')
    log = f'{OUT}/train.log'
    with open(log, 'a', encoding='utf-8') as f:
        proc = subprocess.Popen([sys.executable, os.path.join(HERE, 'train.py'), '--out', OUT, '--size', SIZE], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in proc.stdout:
            f.write(line)
            f.flush()
            if line[:2].isdigit() and line[2:3] == ':' or "'loss'" in line:
                print(line.strip()[:300], flush=True)
    if proc.wait() != 0:
        tail = open(log, encoding='utf-8').read().splitlines()[-40:]
        report('FAILED：訓練失敗，請把下面這段截圖給 Claude：', *tail)
        sys.exit(1)
    b = json.load(open(f'{OUT}/exam_before.json'))
    a = json.load(open(f'{OUT}/exam_after.json'))
    report(f"自動檢查通過：訓練前 {b['ok']}/{b['total']} → 訓練後 {a['ok']}/{a['total']}", '')
    for rb, ra in zip(b['rows'], a['rows']):
        report('學生：' + rb['user'],
               '  前：' + rb['reply'][:120].replace('\n', ' ') + ('' if not rb['problems'] else ' ⚠' + '、'.join(rb['problems'])),
               '  後：' + ra['reply'][:160].replace('\n', ' ') + ('' if not ra['problems'] else ' ⚠' + '、'.join(ra['problems'])), '')
else:
    sh(sys.executable, '-m', 'pip', 'install', '-q', '-U', 'huggingface_hub', 'safetensors')

# formats：mlc＝電腦 GPU 版（WebLLM）；gguf＝手機 CPU 版（wllama，iPhone 用）
formats = job.get('formats', ['mlc', 'gguf'])
if 'mlc' in formats:
    try:
        sh(sys.executable, os.path.join(HERE, 'to_mlc.py'), '--out', OUT, '--size', SIZE)
    except subprocess.CalledProcessError:
        report('FAILED：轉 GPU 版失敗（錯誤在記錄最後面）')
        raise
    report(f'GPU 版已上傳：https://huggingface.co/HauHau2010/math-tutor-qwen2.5-{SIZE}-q4f16_1-MLC')
if 'gguf' in formats:
    try:
        sh(sys.executable, os.path.join(HERE, 'to_gguf.py'), '--out', OUT, '--size', SIZE)
    except subprocess.CalledProcessError:
        report('FAILED：轉手機 CPU 版失敗（錯誤在記錄最後面）')
        raise
    report(f'手機 CPU 版已上傳：https://huggingface.co/HauHau2010/math-tutor-qwen2.5-{SIZE}-GGUF')
# 模型都已上傳 Hugging Face：刪掉大檔，Kaggle 的輸出只留報告與記錄（GitHub 只下載小檔）
for name in ['final', 'mlc', 'sft', 'dpo', 'sft_ckpt', 'dpo_ckpt', 'verify', 'gguf', 'llama.cpp']:
    shutil.rmtree(os.path.join(OUT, name), ignore_errors=True)
report('全部完成 ✅')
