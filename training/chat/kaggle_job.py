# Kaggle／Colab 的總開關：讀 job.json，自動決定要做什麼（使用者只要按 Run All）
#   有 GPU：裝訓練套件 → 訓練（train.py）→ 印訓練前後對照 → 轉手機版並上傳（to_mlc.py）
#   沒有 GPU：只轉手機版（從 Hugging Face 抓已上傳的私人模型）
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
job = json.load(open(os.path.join(HERE, 'job.json'), encoding='utf-8'))
SIZE = job.get('size', '0.5b')
BASE = '/kaggle/working' if os.path.exists('/kaggle/working') else '/content'
OUT = f'{BASE}/out-{SIZE}'
os.makedirs(OUT, exist_ok=True)
env = {**os.environ, 'OUT': OUT, 'SIZE': SIZE}


def sh(*cmd):
    print('$', ' '.join(cmd), flush=True)
    subprocess.run(cmd, check=True, env=env)


def gpu():
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False


print(f'模型大小：{SIZE}；', '有 GPU：訓練＋轉手機版' if gpu() else '沒有 GPU：只轉手機版', flush=True)
if not os.environ.get('HF_TOKEN'):
    print('⚠ 沒有讀到 HF_TOKEN（Add-ons → Secrets），做完也不會上傳', flush=True)

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
        print('\n' + '=' * 30 + '\n訓練失敗，請把下面這段截圖給 Claude：\n' + '=' * 30)
        print('\n'.join(tail))
        sys.exit(1)
    b = json.load(open(f'{OUT}/exam_before.json'))
    a = json.load(open(f'{OUT}/exam_after.json'))
    print('\n' + '=' * 30 + '\n請把這段貼給 Claude\n' + '=' * 30)
    print(f"自動檢查通過：訓練前 {b['ok']}/{b['total']} → 訓練後 {a['ok']}/{a['total']}\n")
    for rb, ra in zip(b['rows'], a['rows']):
        print('學生：', rb['user'])
        print('  前：', rb['reply'][:120].replace('\n', ' '), '' if not rb['problems'] else '⚠' + '、'.join(rb['problems']))
        print('  後：', ra['reply'][:120].replace('\n', ' '), '' if not ra['problems'] else '⚠' + '、'.join(ra['problems']))
        print()
else:
    sh(sys.executable, '-m', 'pip', 'install', '-q', '-U', 'huggingface_hub', 'safetensors')

sh(sys.executable, os.path.join(HERE, 'to_mlc.py'), '--out', OUT, '--size', SIZE)
print('\n全部完成 ✅', flush=True)
