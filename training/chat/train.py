# 第二階段訓練：有溫度、會用工具的對話模型（Qwen2.5-1.5B-Instruct + LoRA）
#
# 在 Colab 或 Kaggle（GPU）上：
#   python training/chat/train.py                 完整流程：考試 → 微調(SFT) → 偏好訓練(DPO) → 再考試 → 上傳
#   python training/chat/train.py --step sft      只做某一步（斷線後接著跑）：exam_before / sft / dpo / exam_after / upload
# 在這裡（CPU）測試流程：
#   python training/chat/train.py --smoke         用 0.5B 模型、少量資料、幾步，只確認程式能跑完
#
# 每一步做完都會把結果存到 OUT 資料夾；有 HF_TOKEN 時也會上傳到 Hugging Face（私人），斷線不怕從頭來。
# 資料全部自創，見 training/chat/README.md
import argparse, json, os, re, random, time
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')

p = argparse.ArgumentParser()
p.add_argument('--smoke', action='store_true', help='CPU 小測試')
p.add_argument('--step', default='all', choices=['all', 'exam_before', 'sft', 'dpo', 'exam_after', 'upload'])
p.add_argument('--out', default=os.environ.get('OUT', os.path.join(HERE, 'out')))
p.add_argument('--hub', default=os.environ.get('HUB_REPO', 'HauHau2010/math-tutor-qwen2.5-1.5b'))
args = p.parse_args()

BASE = 'Qwen/Qwen2.5-0.5B-Instruct' if args.smoke else 'Qwen/Qwen2.5-1.5B-Instruct'
OUT = args.out
os.makedirs(OUT, exist_ok=True)
GPU = torch.cuda.is_available()
# 顯示卡等級：8 以上（A100、L4…）才真正支援 bf16；T4、P100 比較舊（is_bf16_supported() 在新版 torch 會誤報）
NEW_GPU = GPU and torch.cuda.get_device_capability(0)[0] >= 8
DTYPE = torch.bfloat16 if NEW_GPU else (torch.float16 if GPU else torch.float32)  # 考試（推論）用
# 訓練：新卡用 bf16；舊卡用 fp32 權重＋fp16 混合精度（較穩，不會溢位）
TRAIN_DTYPE = torch.bfloat16 if NEW_GPU else torch.float32
MIXED = {'bf16': NEW_GPU, 'fp16': GPU and not NEW_GPU}  # 兩個都要明寫，TRL 預設會開 bf16
if GPU and not NEW_GPU:
    # TRL 有一段「半精度相乘、輸出 fp32」的加速只支援新卡，舊卡改走一般算法
    try:
        import trl.kernels.chunked_logprob as _ck  # 只有新版 TRL 才有
        _ck._MM_OUT_DTYPE = False
    except ImportError:
        pass
SYSTEM = open(os.path.join(DATA, 'system.txt'), encoding='utf-8').read()
random.seed(0)
torch.manual_seed(0)


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def jsonl(name):
    path = os.path.join(DATA, name)
    return [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()]


# ---------- 資料 ----------

def sft_examples():
    """每一個老師回應各做成一筆「前文 → 老師這一句」，只訓練老師說的話"""
    out = []
    for o in jsonl('chat.jsonl') + jsonl('tools.jsonl'):
        msgs = [{'role': 'system', 'content': SYSTEM}] + o['messages']
        for i, m in enumerate(msgs):
            if m['role'] == 'assistant':
                out.append({'prompt': msgs[:i], 'completion': [m]})
    random.shuffle(out)
    return out


def dpo_examples():
    out = []
    for o in jsonl('pairs.jsonl'):
        prompt = [{'role': 'system', 'content': SYSTEM}] + o['prompt']
        out.append({'prompt': prompt, 'chosen': [{'role': 'assistant', 'content': o['chosen']}], 'rejected': [{'role': 'assistant', 'content': o['rejected']}]})
    random.shuffle(out)
    return out


# ---------- 模型 ----------

def load(path, dtype=DTYPE):
    from transformers import AutoTokenizer, AutoModelForCausalLM
    tok = AutoTokenizer.from_pretrained(path)
    # 只用第一張卡（Kaggle 給兩張 T4 時，把模型拆兩半反而慢）
    model = AutoModelForCausalLM.from_pretrained(path, dtype=dtype, device_map={'': 0} if GPU else None)
    return tok, model


def lora():
    from peft import LoraConfig
    return LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, target_modules='all-linear', task_type='CAUSAL_LM')


# ---------- 考試 ----------

TOOL_RE = re.compile(r'<tool>\s*(\{.*?\})\s*</tool>', re.S)
BAD = [(re.compile(r'\\[a-z]+|\\[()\[\]]|\$'), 'LaTeX'), (re.compile(r'[们这说来对时会还没为么吗该样处问题学习过请让]'), '簡體字'), (re.compile(r'^#|\*\*|```', re.M), 'Markdown'), (re.compile(r'tool>|"name"\s*:'), '工具亂碼')]


def grade(case, reply):
    """自動檢查：工具格式、亂碼、有沒有編數字（不含工具的題目）。語氣由擁有者評分"""
    notes = []
    calls = TOOL_RE.findall(reply)
    text = TOOL_RE.sub('', reply)
    for c in calls:
        try:
            json.loads(c)
        except Exception:
            notes.append('工具格式壞掉')
    if case['tools'] and not calls:
        notes.append('該用工具卻沒用')
    for re_, why in BAD:
        if re_.search(text):
            notes.append(why)
    if not case['tools']:
        extra = [n for n in re.findall(r'\d+', text) if n not in re.findall(r'\d+', case['user'])]
        if extra:
            notes.append('出現題目沒有的數字 ' + '、'.join(extra[:3]))
    return notes


def exam(path, tag):
    tok, model = load(path)
    model.eval()
    cases = json.load(open(os.path.join(HERE, 'exam.json'), encoding='utf-8'))['cases']
    if args.smoke:
        cases = cases[:3]
    rows = []
    for c in cases:
        msgs = [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': c['user']}]
        enc = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors='pt', return_dict=True).to(model.device)
        with torch.no_grad():
            out = model.generate(**enc, max_new_tokens=40 if args.smoke else 200, do_sample=False)
        reply = tok.decode(out[0][enc['input_ids'].shape[1]:], skip_special_tokens=True).strip()
        notes = grade(c, reply)
        rows.append({'id': c['id'], 'user': c['user'], 'expect': c['expect'], 'reply': reply, 'problems': notes})
        log(f'[{tag}] {c["id"]}：{"OK" if not notes else "、".join(notes)}')
        log('   學生：', c['user'])
        log('   老師：', reply.replace('\n', ' ')[:200])
    ok = sum(1 for r in rows if not r['problems'])
    json.dump({'tag': tag, 'ok': ok, 'total': len(rows), 'rows': rows}, open(os.path.join(OUT, f'exam_{tag}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    log(f'[{tag}] 自動檢查通過 {ok} / {len(rows)}')
    del model
    return ok


# ---------- 訓練 ----------

def sft():
    from datasets import Dataset
    from trl import SFTConfig, SFTTrainer
    data = sft_examples()
    if args.smoke:
        data = data[:24]
    log(f'微調資料 {len(data)} 筆')
    tok, model = load(BASE, TRAIN_DTYPE)
    cfg = SFTConfig(
        output_dir=os.path.join(OUT, 'sft_ckpt'),
        num_train_epochs=1 if args.smoke else 3,
        max_steps=6 if args.smoke else -1,
        per_device_train_batch_size=1 if args.smoke else 2,
        gradient_accumulation_steps=1 if args.smoke else 8,
        gradient_checkpointing=True,  # 省記憶體：系統提示詞很長
        learning_rate=2e-4,
        lr_scheduler_type='cosine',
        warmup_steps=0 if args.smoke else 20,
        logging_steps=1 if args.smoke else 10,
        save_strategy='no',
        **MIXED,
        max_length=2560,  # 系統提示詞約 1800 token＋對話，太短會把老師的話截掉
        completion_only_loss=True,
        report_to=[],
    )
    trainer = SFTTrainer(model=model, args=cfg, train_dataset=Dataset.from_list(data), processing_class=tok, peft_config=lora())
    trainer.train()
    merged = trainer.model.merge_and_unload().to(DTYPE)
    path = os.path.join(OUT, 'sft')
    merged.save_pretrained(path)
    tok.save_pretrained(path)
    log('微調完成，存在', path)


def dpo():
    from datasets import Dataset
    from trl import DPOConfig, DPOTrainer
    data = dpo_examples()
    if args.smoke:
        data = data[:8]
    log(f'好壞對照 {len(data)} 組')
    tok, model = load(os.path.join(OUT, 'sft'), TRAIN_DTYPE)
    cfg = DPOConfig(
        output_dir=os.path.join(OUT, 'dpo_ckpt'),
        num_train_epochs=1,
        max_steps=3 if args.smoke else -1,
        per_device_train_batch_size=1 if args.smoke else 2,
        gradient_accumulation_steps=1 if args.smoke else 8,
        gradient_checkpointing=True,
        learning_rate=5e-6 if not args.smoke else 1e-5,
        beta=0.1,
        logging_steps=1 if args.smoke else 10,
        save_strategy='no',
        **MIXED,
        max_length=2560,  # 系統提示詞約 1800 token＋對話，太短會把老師的話截掉
        report_to=[],
    )
    trainer = DPOTrainer(model=model, args=cfg, train_dataset=Dataset.from_list(data), processing_class=tok, peft_config=lora())
    trainer.train()
    merged = trainer.model.merge_and_unload().to(DTYPE)
    path = os.path.join(OUT, 'final')
    merged.save_pretrained(path)
    tok.save_pretrained(path)
    log('偏好訓練完成，存在', path)


def upload():
    token = os.environ.get('HF_TOKEN')
    if not token:
        log('沒有 HF_TOKEN，略過上傳（模型在', os.path.join(OUT, 'final'), '）')
        return
    from huggingface_hub import HfApi
    api = HfApi(token=token)
    api.create_repo(args.hub, private=True, exist_ok=True)
    api.upload_folder(folder_path=os.path.join(OUT, 'final'), repo_id=args.hub, commit_message='第二階段：SFT + DPO')
    for f in ['exam_before.json', 'exam_after.json']:
        if os.path.exists(os.path.join(OUT, f)):
            api.upload_file(path_or_fileobj=os.path.join(OUT, f), path_in_repo=f, repo_id=args.hub)
    log('已上傳到 https://huggingface.co/' + args.hub, '（私人）')


steps = ['exam_before', 'sft', 'dpo', 'exam_after', 'upload'] if args.step == 'all' else [args.step]
log('裝置：', 'GPU ' + torch.cuda.get_device_name(0) if GPU else 'CPU', '；模型：', BASE)
log('訓練格式：', TRAIN_DTYPE, MIXED, '（T4 應該是 float32 + fp16）')
done = lambda d: os.path.exists(os.path.join(OUT, d, 'config.json'))
for s in steps:
    # 完整流程時，已經做完的步驟就跳過（斷線後重跑會從上次的地方接著做）
    if args.step == 'all' and ((s == 'sft' and done('sft')) or (s == 'dpo' and done('final')) or (s.startswith('exam') and os.path.exists(os.path.join(OUT, f'exam_{s[5:]}.json')))):
        log('已經做過，跳過', s)
        continue
    log('==========', s, '==========')
    if s == 'exam_before':
        exam(BASE, 'before')
    elif s == 'sft':
        sft()
    elif s == 'dpo':
        dpo()
    elif s == 'exam_after':
        exam(os.path.join(OUT, 'final'), 'after')
    elif s == 'upload':
        upload()
log('全部完成')
