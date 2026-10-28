# 把 train.py 訓練好的模型轉成網頁用的 ONNX（int8 壓縮，約 23 MB），輸出到 public/models/nlu/
# 用法：pip install torch transformers onnx onnxruntime onnxscript，然後 python training/nlu/export.py
import torch, os, shutil, json
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from onnxruntime.quantization import quantize_dynamic, QuantType
import os as _o
R=_o.path.dirname(_o.path.abspath(__file__))
SRC=R+'/model'; OUT=R+'/../../public/models/nlu'
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT+'/onnx')
tok=AutoTokenizer.from_pretrained(SRC); m=AutoModelForSequenceClassification.from_pretrained(SRC).eval()
m.config.return_dict=False
x=tok(['測試'],['測試一下'],return_tensors='pt')
torch.onnx.export(m,(x['input_ids'],x['attention_mask'],x['token_type_ids']),OUT+'/onnx/model.onnx',
  input_names=['input_ids','attention_mask','token_type_ids'],output_names=['logits'],
  dynamic_axes={k:{0:'batch',1:'seq'} for k in ['input_ids','attention_mask','token_type_ids']}|{'logits':{0:'batch'}},opset_version=17,dynamo=False)
quantize_dynamic(OUT+'/onnx/model.onnx',OUT+'/onnx/model_quantized.onnx',weight_type=QuantType.QInt8)
os.remove(OUT+'/onnx/model.onnx')
tok.save_pretrained(OUT); m.config.save_pretrained(OUT)
for f in os.listdir(OUT): print(f)
print(os.path.getsize(OUT+'/onnx/model_quantized.onnx')//1024//1024,'MB')
