# 數學解惑老師伺服器（免費 Gradio Space，CPU）
# 用 llama.cpp 跑我們訓練的模型，提供和 OpenAI 一樣的 /v1/chat/completions，網站直接呼叫。
# 數字一律由網站的解題引擎計算，這裡只負責對話；不記錄任何對話內容。
import threading, time, uuid

import gradio as gr
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from huggingface_hub import hf_hub_download
from llama_cpp import Llama

REPO = 'HauHau2010/math-tutor-qwen2.5-1.5b-GGUF'
FILE = 'math-tutor-q8_0.gguf'
state = {'llm': None, 'error': None}
lock = threading.Lock()


def load():
    try:
        path = hf_hub_download(REPO, FILE)
        state['llm'] = Llama(model_path=path, n_ctx=4096, n_threads=2, n_batch=512, verbose=False)
    except Exception as e:  # 讓 /health 看得到原因
        state['error'] = repr(e)


threading.Thread(target=load, daemon=True).start()

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])


@app.get('/health')
def health():
    if state['llm']:
        return {'status': 'ok'}
    return JSONResponse({'status': 'loading', 'error': state['error']}, status_code=503)


@app.post('/v1/chat/completions')
async def chat(req: Request):
    if not state['llm']:
        return JSONResponse({'error': state['error'] or '模型載入中'}, status_code=503)
    body = await req.json()
    messages = [{'role': m['role'], 'content': str(m.get('content', ''))} for m in body.get('messages', [])][-40:]
    max_tokens = min(int(body.get('max_tokens') or 500), 800)
    temperature = float(body.get('temperature', 0.2))
    # 一次一個人（免費主機只有 2 顆 CPU）；同一段系統提示詞會自動重用，不用每次重算
    with lock:
        out = await run_in_thread(lambda: state['llm'].create_chat_completion(messages=messages, max_tokens=max_tokens, temperature=temperature))
    out['id'] = 'chatcmpl-' + uuid.uuid4().hex[:12]
    out['created'] = int(time.time())
    return out


async def run_in_thread(fn):
    import anyio
    return await anyio.to_thread.run_sync(fn)


def ui(msg):
    if not state['llm']:
        return '模型載入中，等一分鐘再試。'
    with lock:
        r = state['llm'].create_chat_completion(messages=[{'role': 'user', 'content': msg}], max_tokens=200, temperature=0.2)
    return r['choices'][0]['message']['content']


demo = gr.Interface(fn=ui, inputs=gr.Textbox(label='問老師'), outputs=gr.Textbox(label='回答'), title='數學解惑老師（測試頁）',
                    description='網站用的 AI 老師伺服器。請不要輸入個人資料。')
app = gr.mount_gradio_app(app, demo, path='/')

if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=7860)
