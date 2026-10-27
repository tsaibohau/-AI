// 呼叫 Gemini API（瀏覽器與 node 共用，只用 fetch）
// 金鑰由呼叫者傳入，本檔案不保存任何金鑰。

export const DEFAULT_MODEL = 'gemini-flash-latest';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.code = code;
  }
}

function explainStatus(status, detail) {
  if (status === 400 && /api key/i.test(detail)) return '金鑰無效，請到設定頁重新貼上';
  if (status === 400) return `請求格式有誤：${detail}`;
  if (status === 401 || status === 403) return '金鑰沒有權限或已失效，請到設定頁檢查';
  if (status === 404) return '找不到這個模型，請到設定頁改選其他模型';
  if (status === 429) return '免費額度暫時用完了，請稍後再試';
  if (status >= 500) return 'Gemini 服務暫時有問題，請稍後再試';
  return `呼叫失敗（${status}）：${detail}`;
}

async function request(url, { apiKey, fetchImpl, init = {} }) {
  if (!apiKey) throw new GeminiError('尚未設定金鑰，請到設定頁貼上 Gemini API 金鑰', { code: 'NO_KEY' });
  let res;
  try {
    // 金鑰放在標頭，不放在網址，避免出現在紀錄裡
    res = await fetchImpl(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey, ...(init.headers || {}) },
    });
  } catch (e) {
    throw new GeminiError(`網路連線失敗：${e.message}`, { code: 'NETWORK' });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.error?.message || res.statusText || '';
    throw new GeminiError(explainStatus(res.status, detail), { status: res.status });
  }
  return body;
}

/**
 * 產生內容，回傳模型輸出的文字。
 * contents: [{ role: 'user' | 'model', parts: [...] }]
 */
export async function generate({ apiKey, model = DEFAULT_MODEL, system, contents, fetchImpl = fetch, temperature = 0.2 }) {
  const body = await request(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    apiKey,
    fetchImpl,
    init: {
      method: 'POST',
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { responseMimeType: 'application/json', temperature },
      }),
    },
  });
  const cand = body?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) {
    const reason = cand?.finishReason || body?.promptFeedback?.blockReason || '未知原因';
    throw new GeminiError(`模型沒有回傳內容（${reason}）`, { code: 'EMPTY' });
  }
  return text;
}

/** 列出這把金鑰可用、且支援 generateContent 的模型 */
export async function listModels({ apiKey, fetchImpl = fetch }) {
  const body = await request(`${BASE}/models?pageSize=200`, { apiKey, fetchImpl });
  return (body.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }));
}
