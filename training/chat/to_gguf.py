# 手機 CPU 版：把訓練好的模型轉成 GGUF（q8_0），公開上傳到 Hugging Face，網站用 wllama（llama.cpp 網頁版）在 CPU 上跑。
#
#   python training/chat/to_gguf.py --out OUT資料夾 --size 0.5b
#
# iPhone Safari 的 WebGPU 會把 GPU 收回，所以手機改用 CPU。轉檔用 llama.cpp 官方的 convert_hf_to_gguf.py（不用編譯）。
import argparse, os, subprocess, sys

p = argparse.ArgumentParser()
p.add_argument('--out', default=os.environ.get('OUT', 'out'))
p.add_argument('--size', default=os.environ.get('SIZE', '0.5b'))
args = p.parse_args()

SRC_REPO = f'HauHau2010/math-tutor-qwen2.5-{args.size}'
REPO = f'{SRC_REPO}-GGUF'
# iPhone Safari 一次吃 500 MB 大檔會卡住：改 Q4_K_M（約 0.4 GB）、切成 64 MB 小塊
STEM = f'math-tutor-{args.size}-q4_k_m'
BIN = os.environ.get('LLAMA_BIN', '')  # llama.cpp 官方編好的 llama-quantize、llama-gguf-split 所在資料夾

token = os.environ.get('HF_TOKEN')
if not token:
    sys.exit('沒有 HF_TOKEN，無法上傳')
from huggingface_hub import HfApi, snapshot_download

api = HfApi(token=token)


def run(*cmd):
    print('$', ' '.join(cmd), flush=True)
    subprocess.run(cmd, check=True)


src = os.path.join(args.out, 'final')
if not os.path.exists(os.path.join(src, 'config.json')):
    # 這次沒有訓練：從 Hugging Face 抓已上傳的私人模型
    print(f'找不到剛訓練的模型，從 Hugging Face 下載 {SRC_REPO} …', flush=True)
    snapshot_download(SRC_REPO, local_dir=src, token=token, allow_patterns=['*.json', '*.safetensors', '*.txt', '*.jinja'])

lcpp = os.path.join(args.out, 'llama.cpp')
if not os.path.exists(lcpp):
    run('git', 'clone', '-q', '--depth', '1', 'https://github.com/ggml-org/llama.cpp', lcpp)
# 只裝轉檔要的 gguf（用 llama.cpp 自帶的版本，和轉檔程式同步）；不要裝它的 requirements，會重裝 torch
run(sys.executable, '-m', 'pip', 'install', '-q', os.path.join(lcpp, 'gguf-py'), 'sentencepiece')
gdir = os.path.join(args.out, 'gguf')
os.makedirs(gdir, exist_ok=True)
f16 = os.path.join(gdir, 'f16.gguf')
run(sys.executable, os.path.join(lcpp, 'convert_hf_to_gguf.py'), src, '--outtype', 'f16', '--outfile', f16)
q4 = os.path.join(gdir, 'q4.gguf')
run(os.path.join(BIN, 'llama-quantize'), f16, q4, 'Q4_K_M')
print(f'Q4_K_M：{os.path.getsize(q4) / 1e6:.0f} MB', flush=True)
parts = os.path.join(gdir, 'parts')
os.makedirs(parts, exist_ok=True)
run(os.path.join(BIN, 'llama-gguf-split'), '--split', '--split-max-size', '64M', q4, os.path.join(parts, STEM))
files = sorted(os.listdir(parts))
print('切成：', files, flush=True)

api.create_repo(REPO, private=False, exist_ok=True)
api.upload_folder(folder_path=parts, repo_id=REPO, commit_message='數學解惑：手機 CPU 版（Q4_K_M，64 MB 小塊）')
print(f'手機 CPU 版已上傳（公開）：https://huggingface.co/{REPO}/resolve/main/{files[0]}', flush=True)
