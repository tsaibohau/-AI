# 訓練「聽懂學生的話」模型（CPU 約 3 分鐘；Colab GPU 更快）
# 用法：pip install torch transformers，然後 python training/nlu/train.py
# 配對分類：輸入「選項文字 + 學生的話」，輸出是不是這個意思；預測時取分數最高的選項（含「無關」）
import json, random, torch, time
from transformers import AutoTokenizer, AutoModelForSequenceClassification
torch.manual_seed(0); random.seed(0)
import os
R=os.path.dirname(os.path.abspath(__file__))+'/'
train=[json.loads(l) for l in open(R+'data/train.jsonl',encoding='utf-8')]
test=json.load(open(R+'test.json',encoding='utf-8'))
nodes={n['id']:n for n in json.load(open(R+'nodes.json',encoding='utf-8'))}
NONE='和題目無關、看不懂'
def opts(node): return [NONE]+nodes[node]['options']
def pairs(r):
    return [(o, r['reply'], 1.0 if i==r['option'] else 0.0) for i,o in enumerate(opts(r['node']))]
name="BAAI/bge-small-zh-v1.5"
tok=AutoTokenizer.from_pretrained(name)
model=AutoModelForSequenceClassification.from_pretrained(name,num_labels=1)
data=[p for r in train for p in pairs(r)]
opt=torch.optim.AdamW(model.parameters(),lr=3e-5)
lossf=torch.nn.BCEWithLogitsLoss()
def predict(node,reply):
    model.eval(); os=opts(node)
    with torch.no_grad():
        x=tok(os,[reply]*len(os),padding=True,truncation=True,max_length=64,return_tensors='pt')
        s=model(**x).logits[:,0]
    return int(s.argmax())
def evaluate():
    return sum(predict(t['node'],t['reply'])==t['option'] for t in test)
t0=time.time()
for ep in range(4):
    model.train(); random.shuffle(data)
    for i in range(0,len(data),32):
        b=data[i:i+32]
        x=tok([a for a,_,_ in b],[c for _,c,_ in b],padding=True,truncation=True,max_length=64,return_tensors='pt')
        loss=lossf(model(**x).logits[:,0],torch.tensor([y for *_,y in b]))
        loss.backward(); opt.step(); opt.zero_grad()
    print(f'第 {ep+1} 輪：測試 {evaluate()}/{len(test)}（{time.time()-t0:.0f} 秒）',flush=True)
for t in test:
    p=predict(t['node'],t['reply'])
    if p!=t['option']:
        o=opts(t['node']); print(f"  ✗「{t['reply']}」預期 {o[t['option']]}，得到 {o[p]}")
model.save_pretrained(R+'model'); tok.save_pretrained(R+'model')  # 模型檔不放進儲存庫
