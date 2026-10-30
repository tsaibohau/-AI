// 伺服器版 AI 老師：我們訓練的模型放在免費的 Hugging Face Space（llama.cpp，OpenAI 相容 API）。
// 學生不用下載模型；工具協定和本機 AI 一樣（<tool>…</tool>），數字一律由網站的解題引擎計算。
import { toChat, parseToolCalls, stripPromptEcho, toolGuide } from './local.js';

export const SERVER_URL = 'https://hauhau2010-math-tutor.hf.space';

/** 伺服器醒著嗎？免費主機兩天沒人用會休眠，第一次叫醒要等大約一分鐘 */
export async function serverStatus(url = SERVER_URL, fetchFn = fetch) {
  try {
    const r = await fetchFn(`${url}/health`, { cache: 'no-store' });
    if (r.ok) return { ok: true };
    return { ok: false, waking: true };
  } catch {
    return { ok: false, waking: true };
  }
}

export function serverProvider({ url = SERVER_URL, fetchFn = (...a) => fetch(...a) } = {}) {
  return {
    name: 'server',
    label: '數學解惑老師（伺服器）',
    vision: false,
    ready: () => true,
    async complete({ system, messages, tools, signal }) {
      let lastErr;
      // 休眠中的主機剛醒來會回 503，等一下再試
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const r = await fetchFn(`${url}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: toChat(system, tools, messages), temperature: 0.2, max_tokens: 500, cache_prompt: true }),
            signal,
          });
          if (r.status === 503 || r.status === 502) throw Object.assign(new Error('伺服器正在醒來'), { retry: true });
          if (!r.ok) throw new Error(`伺服器回應錯誤（${r.status}）`);
          const data = await r.json();
          const raw = data.choices?.[0]?.message?.content || '';
          const { text, toolCalls } = parseToolCalls(raw);
          return { text: stripPromptEcho(text, `${system}\n${toolGuide(tools)}`), toolCalls, raw };
        } catch (e) {
          if (signal?.aborted) throw e;
          lastErr = e;
          // 網路錯誤（休眠中的主機常見）或 503：等 10 秒再試
          if (!(e.retry || e instanceof TypeError)) throw e;
          await new Promise((res) => setTimeout(res, attempt ? 10000 : 3000));
        }
      }
      throw new Error(`連不上 AI 老師伺服器（${lastErr?.message || '沒有回應'}）。它可能在休眠，過一分鐘再試，或改用本機 AI。`);
    },
  };
}
