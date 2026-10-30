# 伺服器版：把訓練好的模型轉成 GGUF（q8_0），放到 Hugging Face（公開），並建立／更新免費 Gradio Space 跑 llama.cpp 伺服器（Docker 要付費，所以用 Gradio）
#
#   python training/chat/to_server.py --out OUT資料夾
#
# 網站預設用這台伺服器（學生不用下載 1 GB）；本機下載版保留給想離線的人。
# 使用者已同意公開。轉檔用 llama.cpp 官方的 convert_hf_to_gguf.py。
import argparse, os, subprocess, sys

p = argparse.ArgumentParser()
p.add_argument('--out', default=os.environ.get('OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')))
p.add_argument('--gguf-repo', default='HauHau2010/math-tutor-qwen2.5-1.5b-GGUF')
p.add_argument('--space', default='HauHau2010/math-tutor')
p.add_argument('--space-only', action='store_true', help='模型已上傳，只建立／更新伺服器')
args = p.parse_args()

HERE = os.path.dirname(os.path.abspath(__file__))
token = os.environ.get('HF_TOKEN')
if not token:
    sys.exit('沒有 HF_TOKEN，無法上傳與建立伺服器')
from huggingface_hub import HfApi
api = HfApi(token=token)

if not args.space_only:
    src = os.path.join(args.out, 'final')
    if not os.path.exists(os.path.join(src, 'config.json')):
        # 這次沒有訓練（例如只想重新轉檔）：從 Hugging Face 抓已上傳的私人模型
        from huggingface_hub import snapshot_download
        print('找不到剛訓練的模型，從 Hugging Face 下載 HauHau2010/math-tutor-qwen2.5-1.5b …', flush=True)
        snapshot_download('HauHau2010/math-tutor-qwen2.5-1.5b', local_dir=src, token=os.environ.get('HF_TOKEN'), allow_patterns=['*.json', '*.safetensors', '*.txt', '*.jinja'])
    gdir = os.path.join(args.out, 'gguf')
    os.makedirs(gdir, exist_ok=True)
    gguf = os.path.join(gdir, 'math-tutor-q8_0.gguf')

    def run(*cmd, **kw):
        print('$', ' '.join(cmd), flush=True)
        subprocess.run(cmd, check=True, **kw)

    lcpp = os.path.join(args.out, 'llama.cpp')
    if not os.path.exists(lcpp):
        run('git', 'clone', '-q', '--depth', '1', 'https://github.com/ggml-org/llama.cpp', lcpp)
    run(sys.executable, '-m', 'pip', 'install', '-q', 'gguf', 'sentencepiece')
    run(sys.executable, os.path.join(lcpp, 'convert_hf_to_gguf.py'), src, '--outtype', 'q8_0', '--outfile', gguf)
    print(f'GGUF 完成：{os.path.getsize(gguf) / 1e9:.2f} GB', flush=True)

    api.create_repo(args.gguf_repo, private=False, exist_ok=True)
    info = api.upload_file(path_or_fileobj=gguf, path_in_repo='math-tutor-q8_0.gguf', repo_id=args.gguf_repo, commit_message='數學解惑：GGUF q8_0')
    print('GGUF 已上傳（公開）：https://huggingface.co/' + args.gguf_repo, flush=True)

space_dir = os.path.join(HERE, 'space')
api.create_repo(args.space, repo_type='space', space_sdk='gradio', private=False, exist_ok=True)
for f in ['app.py', 'requirements.txt', 'README.md']:
    api.upload_file(path_or_fileobj=os.path.join(space_dir, f), path_in_repo=f, repo_id=args.space, repo_type='space', commit_message='數學解惑老師伺服器')
# 伺服器啟動時才下載模型；重新啟動就會抓最新的 GGUF
try:
    api.restart_space(args.space)
except Exception as e:  # 剛建立的 Space 會自己啟動，重啟失敗沒關係
    print('（略過重啟：', e, '）')
host = args.space.lower().replace('/', '-').replace('_', '-').replace('.', '-')
print(f'伺服器建置中（約 5～10 分鐘）：https://huggingface.co/spaces/{args.space}', flush=True)
print(f'網址：https://{host}.hf.space', flush=True)
