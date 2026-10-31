// 用手機 CPU 跑模型（wllama = llama.cpp 的網頁版）：不碰 GPU，iPhone Safari 的 WebGPU 會把 GPU 收回，這條路不會。
// 包成和 WebLLM 一樣的 engine.chat.completions.create()，llm.js 的其他地方不用改。
import wasmUrl from '@wllama/wllama/esm/wasm/wllama.wasm?url';

let wllama = null;

async function lib() {
  const { Wllama, LoggerWithoutDebug } = await import('@wllama/wllama');
  return { Wllama, LoggerWithoutDebug };
}

/** 下載（第一次）並載入；回傳 WebLLM 形狀的 engine */
export async function createCpuEngine(url, onProgress = () => {}) {
  const { Wllama, LoggerWithoutDebug } = await lib();
  if (wllama) {
    try {
      await wllama.exit();
    } catch {
      /* 忽略 */
    }
  }
  wllama = new Wllama({ default: wasmUrl }, { logger: LoggerWithoutDebug, allowOffline: true });
  await wllama.loadModelFromUrl(url, {
    n_ctx: 4096,
    n_batch: 512,
    n_gpu_layers: 0, // 只用 CPU
    progressCallback: ({ loaded, total }) => onProgress({ progress: total ? loaded / total : 0, text: `下載中 ${(loaded / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB` }),
  });
  onProgress({ progress: 1, text: '載入完成' });
  const w = wllama;
  return {
    chat: {
      completions: {
        create: async ({ messages, temperature = 0.2, max_tokens = 700 }) => w.createChatCompletion({ messages, temperature, max_tokens, cache_prompt: true }),
      },
    },
    unload: () => w.exit(),
    resetChat: async () => {},
  };
}

async function cache() {
  const mod = await import('@wllama/wllama');
  return new mod.CacheManager();
}

export async function isCpuDownloaded(url) {
  try {
    const c = await cache();
    return (await c.open(url)) !== null;
  } catch {
    return false;
  }
}

export async function deleteCpuModel(url) {
  try {
    await wllama?.exit();
  } catch {
    /* 忽略 */
  }
  wllama = null;
  const c = await cache();
  await c.delete(url);
}
