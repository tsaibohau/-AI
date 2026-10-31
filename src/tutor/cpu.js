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
  // 記下錯誤：iPhone 上 worker 出錯時 wllama 只寫 console，網頁會一直卡著
  const errors = [];
  const logger = {
    ...LoggerWithoutDebug,
    error: (...a) => {
      errors.push(a.map((x) => x?.message || String(x)).join(' ').slice(0, 160));
      console.error(...a);
    },
  };
  wllama = new Wllama({ default: wasmUrl }, { logger, allowOffline: true });
  let downloaded = false;
  const load = wllama.loadModelFromUrl(url, {
    n_ctx: 4096,
    n_batch: 512,
    n_gpu_layers: 0, // 只用 CPU
    progressCallback: ({ loaded, total }) => {
      if (total && loaded >= total) {
        downloaded = true;
        onProgress({ progress: 1, text: '下載完成，載入中（約半分鐘）…' });
      } else onProgress({ progress: total ? loaded / total : 0, text: `下載中 ${(loaded / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB` });
    },
  });
  // 看門狗：下載完 3 分鐘還沒載入好，就不要讓畫面永遠卡著
  let timer;
  const watchdog = new Promise((_, reject) => {
    const tick = () => {
      if (!downloaded) return (timer = setTimeout(tick, 5000));
      timer = setTimeout(() => reject(new Error(`載入太久沒有回應${errors.length ? `（${errors.slice(-2).join('；')}）` : ''}。請把網頁完全關掉再打開，再按一次（已下載的不用重新下載）。`)), 180000);
    };
    tick();
  });
  try {
    await Promise.race([load, watchdog]);
  } finally {
    clearTimeout(timer);
  }
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
