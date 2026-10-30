# 把訓練好的模型轉成網頁（WebLLM）能用的手機版（q4f16_1），並上傳到 Hugging Face（公開，網站才下載得到）
#
#   python training/chat/to_mlc.py --out OUT資料夾            轉 OUT/final，上傳到 HauHau2010/…-MLC
#   python training/chat/to_mlc.py --verify <HF 模型資料夾> --official mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC
#                                                             和官方手機版逐位元比對（確認轉法正確）
#
# 為什麼自己轉：mlc_llm 的轉檔工具在新版 Python／numpy 上會當掉，而 q4f16_1 格式很單純：
#   - 線性層的權重每 32 個一組（全部用 fp16 算），scale = 組內最大絕對值 × fp16(1/7)，數值 = round(w ÷ scale + 7)（0～14），
#     8 個 4 bit 塞進一個 uint32（第 i 個放在第 4i 位元）；scale 存 fp16。
#   - q、k、v 合併成 c_attn；gate、up 合併成 gate_up_proj；embedding 也量化（lm_head 和它共用）。
#   - 其他（layernorm、bias）存 fp16。
# 設定檔 mlc-chat-config.json 沿用 mlc-ai 官方同架構版本，網站就能用官方編譯好的網頁執行檔。
# 使用者已同意手機版公開（原始模型仍是私人）。
import argparse, hashlib, json, os, shutil, sys, urllib.request

import numpy as np
import torch
from safetensors import safe_open

p = argparse.ArgumentParser()
p.add_argument('--out', default=os.environ.get('OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')))
p.add_argument('--src', default=None, help='要轉的模型資料夾（預設 OUT/final）')
p.add_argument('--size', default=os.environ.get('SIZE', '1.5b'), choices=['1.5b', '0.5b'])
p.add_argument('--official', default=None, help='沿用設定檔的官方手機版（預設依 --size）')
p.add_argument('--hub', default=os.environ.get('HUB_MLC_REPO'))
p.add_argument('--verify', default=None, help='驗證模式：轉這個 HF 模型資料夾，和 --official 逐位元比對')
args = p.parse_args()
args.official = args.official or f'mlc-ai/Qwen2.5-{args.size.upper()}-Instruct-q4f16_1-MLC'
args.hub = args.hub or f'HauHau2010/math-tutor-qwen2.5-{args.size}-q4f16_1-MLC'
SRC_REPO = f'HauHau2010/math-tutor-qwen2.5-{args.size}'

GROUP = 32
MAX_INT = 7
SHARD_BYTES = 32 * 1024 * 1024


def hf(path):
    return f'https://huggingface.co/{args.official}/resolve/main/{path}'


def load_tensors(src):
    out = {}
    for f in sorted(os.listdir(src)):
        if f.endswith('.safetensors'):
            with safe_open(os.path.join(src, f), framework='pt') as st:
                for k in st.keys():
                    out[k] = st.get_tensor(k)
    return out


def quantize(w):
    """w: (N, K) → q_weight (N, K/8) uint32、q_scale (N, K/32) fp16
    算法和 mlc_llm 完全一致（已用官方檔案逐位元比對）：全部用 fp16 計算，
    scale = 最大絕對值 × fp16(1/7)；q = round(fp16(w ÷ scale) + 7)（四捨六入五成雙）"""
    w = w.to(torch.float16).numpy()
    n, k = w.shape
    g = w.reshape(n, k // GROUP, GROUP)
    scale = (np.abs(g).max(axis=2) * np.float16(1 / MAX_INT)).astype(np.float16)
    s = scale[:, :, None]
    with np.errstate(divide='ignore', invalid='ignore'):
        d = (g / s).astype(np.float16)
        q = np.round((d + np.float16(MAX_INT)).astype(np.float16))
    q = np.where(s > 0, q, MAX_INT)
    q = np.clip(q, 0, 2 * MAX_INT).astype(np.uint32).reshape(n, k // 8, 8)
    packed = np.zeros((n, k // 8), dtype=np.uint32)
    for i in range(8):
        packed |= q[:, :, i] << np.uint32(4 * i)
    return packed, scale


def convert(src):
    t = load_tensors(src)
    cfg = json.load(open(os.path.join(src, 'config.json')))
    params = {}

    def fp16(name, x):
        params[name] = x.to(torch.float16).numpy()

    def qlinear(name, w):
        params[name + '.q_weight'], params[name + '.q_scale'] = quantize(w)

    qlinear('model.embed_tokens', t['model.embed_tokens.weight'])
    for i in range(cfg['num_hidden_layers']):
        a = f'model.layers.{i}'
        fp16(f'{a}.input_layernorm.weight', t[f'{a}.input_layernorm.weight'])
        fp16(f'{a}.post_attention_layernorm.weight', t[f'{a}.post_attention_layernorm.weight'])
        qlinear(f'{a}.self_attn.c_attn', torch.cat([t[f'{a}.self_attn.{x}_proj.weight'] for x in 'qkv'], 0))
        fp16(f'{a}.self_attn.c_attn.bias', torch.cat([t[f'{a}.self_attn.{x}_proj.bias'] for x in 'qkv'], 0))
        qlinear(f'{a}.self_attn.o_proj', t[f'{a}.self_attn.o_proj.weight'])
        qlinear(f'{a}.mlp.gate_up_proj', torch.cat([t[f'{a}.mlp.gate_proj.weight'], t[f'{a}.mlp.up_proj.weight']], 0))
        qlinear(f'{a}.mlp.down_proj', t[f'{a}.mlp.down_proj.weight'])
    fp16('model.norm.weight', t['model.norm.weight'])
    if not cfg.get('tie_word_embeddings', False):
        qlinear('lm_head', t['lm_head.weight'])
    return params


def write_cache(params, dst, order):
    os.makedirs(dst, exist_ok=True)
    records, shard, recs, off = [], bytearray(), [], 0

    def flush():
        nonlocal shard, recs, off
        if not recs:
            return
        name = f'params_shard_{len(records)}.bin'
        open(os.path.join(dst, name), 'wb').write(shard)
        records.append({'dataPath': name, 'format': 'raw-shard', 'nbytes': len(shard), 'records': recs, 'md5sum': hashlib.md5(shard).hexdigest()})
        shard, recs, off = bytearray(), [], 0

    total = 0
    for name in order:
        a = np.ascontiguousarray(params[name])
        b = a.tobytes()
        if off and off + len(b) > SHARD_BYTES:
            flush()
        recs.append({'name': name, 'shape': list(a.shape), 'dtype': str(a.dtype), 'format': 'f32-to-bf16', 'nbytes': len(b), 'byteOffset': off})
        shard += b
        off += len(b)
        total += a.size
    flush()
    nbytes = sum(r['nbytes'] for r in records)
    cache = {'metadata': {'ParamSize': len(order), 'ParamBytes': float(nbytes), 'BitsPerParam': 0.0}, 'records': records}
    # 新版 WebLLM 讀 tensor-cache.json、舊版讀 ndarray-cache.json，內容一樣，兩個都放（官方也是）
    for name in ['tensor-cache.json', 'ndarray-cache.json']:
        json.dump(cache, open(os.path.join(dst, name), 'w'), indent=2)


def official_order():
    cache = json.load(urllib.request.urlopen(hf('ndarray-cache.json')))
    return cache, [r['name'] for shard in cache['records'] for r in shard['records']]


if args.verify:
    # 和官方手機版逐位元比對
    params = convert(args.verify)
    cache, order = official_order()
    assert set(order) == set(params), f'參數名稱不同：多了 {set(params) - set(order)}，少了 {set(order) - set(params)}'
    tmp = os.path.join(args.out, 'verify')
    os.makedirs(tmp, exist_ok=True)
    bad = 0
    for shard in cache['records']:
        path = os.path.join(tmp, shard['dataPath'])
        if not os.path.exists(path):
            urllib.request.urlretrieve(hf(shard['dataPath']), path)
        data = open(path, 'rb').read()
        for r in shard['records']:
            mine = np.ascontiguousarray(params[r['name']])
            theirs = np.frombuffer(data[r['byteOffset']:r['byteOffset'] + r['nbytes']], dtype=r['dtype']).reshape(r['shape'])
            if mine.dtype != theirs.dtype or mine.shape != theirs.shape:
                print('形狀不同', r['name'], mine.shape, theirs.shape, mine.dtype, theirs.dtype)
                bad += 1
            elif not np.array_equal(mine, theirs):
                diff = np.mean(mine != theirs)
                print(f'不同 {r["name"]}：{diff:.4%} 的位置不一樣')
                bad += 1
    print('比對完成：', '全部一樣' if not bad else f'{bad} 個參數不同')
    sys.exit(1 if bad else 0)

src = args.src or os.path.join(args.out, 'final')
if not os.path.exists(os.path.join(src, 'config.json')):
    # 這次沒有訓練（例如只想重新轉檔）：從 Hugging Face 抓已上傳的私人模型
    from huggingface_hub import snapshot_download
    print(f'找不到剛訓練的模型，從 Hugging Face 下載 {SRC_REPO} …', flush=True)
    snapshot_download(SRC_REPO, local_dir=src, token=os.environ.get('HF_TOKEN'), allow_patterns=['*.json', '*.safetensors', '*.txt', '*.jinja'])
dst = os.path.join(args.out, 'mlc')
params = convert(src)
cache, order = official_order()
assert set(order) == set(params), '參數名稱和官方不同，不能沿用官方設定'
write_cache(params, dst, order)

official = json.load(urllib.request.urlopen(hf('mlc-chat-config.json')))
ours = json.load(open(os.path.join(src, 'config.json')))
for k in ['hidden_size', 'num_hidden_layers', 'vocab_size', 'num_key_value_heads']:
    if ours[k] != official['model_config'][k]:
        sys.exit(f'架構不同（{k}：{ours[k]} ≠ {official["model_config"][k]}），不能沿用官方設定')
json.dump(official, open(os.path.join(dst, 'mlc-chat-config.json'), 'w'), indent=2)
for f in official['tokenizer_files']:
    shutil.copy(os.path.join(src, f), dst)
size = sum(os.path.getsize(os.path.join(dst, f)) for f in os.listdir(dst))
print(f'手機版完成：{dst}（{size / 1e9:.2f} GB）', flush=True)

token = os.environ.get('HF_TOKEN')
if not token:
    print('沒有 HF_TOKEN，略過上傳')
    sys.exit(0)
from huggingface_hub import HfApi
api = HfApi(token=token)
api.create_repo(args.hub, private=False, exist_ok=True)
api.update_repo_settings(args.hub, private=False)
api.upload_folder(folder_path=dst, repo_id=args.hub, commit_message='數學解惑：手機版（q4f16_1）')
print('已上傳到 https://huggingface.co/' + args.hub, '（公開）')
