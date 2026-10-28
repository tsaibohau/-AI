// Gemini（免費額度）：使用者自己的金鑰，只存在這台裝置。程式碼裡沒有任何金鑰。
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class ProviderError extends Error {}

function explain(status, detail) {
  if (status === 400 && /api key/i.test(detail)) return '金鑰無效，請到設定重新貼上';
  if (status === 401 || status === 403) return '金鑰沒有權限或已失效，請到設定檢查';
  if (status === 404) return '找不到這個模型，請到設定改選其他模型';
  if (status === 429) return '免費額度暫時用完了（每分鐘或每天有次數上限），請稍後再試';
  if (status >= 500) return 'Gemini 服務暫時有問題，請稍後再試';
  return `呼叫失敗（${status}）：${detail}`;
}

async function request(url, apiKey, init, fetchImpl) {
  if (!apiKey) throw new ProviderError('還沒有 Gemini 金鑰，請到設定貼上');
  let res;
  try {
    // 金鑰放在標頭，不放在網址
    res = await fetchImpl(url, { ...init, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey } });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ProviderError(`網路連線失敗：${e.message}`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProviderError(explain(res.status, body?.error?.message || res.statusText || ''));
  return body;
}

/** 通用訊息 → Gemini contents（純函式，可測試） */
export function toContents(messages) {
  return messages.map((m) => {
    if (m.role === 'user') {
      const parts = (m.images || []).map((im) => ({ inlineData: { mimeType: im.mimeType, data: im.base64 } }));
      if (m.text) parts.push({ text: m.text });
      return { role: 'user', parts };
    }
    if (m.role === 'assistant') {
      // 原樣送回模型自己的 parts（含 thoughtSignature），工具呼叫才能接續
      if (m.raw?.length) return { role: 'model', parts: m.raw };
      const parts = [];
      if (m.text) parts.push({ text: m.text });
      for (const c of m.toolCalls || []) parts.push({ functionCall: { name: c.name, args: c.args } });
      return { role: 'model', parts };
    }
    return { role: 'user', parts: m.results.map((r) => ({ functionResponse: { name: r.name, response: { result: r.result } } })) };
  });
}

/** Gemini 回應 → { text, toolCalls, raw }（純函式，可測試） */
export function fromResponse(body) {
  const cand = body?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
  const toolCalls = parts.filter((p) => p.functionCall).map((p, i) => ({ id: `${p.functionCall.name}-${i}`, name: p.functionCall.name, args: p.functionCall.args || {} }));
  if (!parts.length) {
    const why = cand?.finishReason || body?.promptFeedback?.blockReason || '未知原因';
    throw new ProviderError(`模型沒有回傳內容（${why}）`);
  }
  return { text, toolCalls, raw: parts };
}

export function geminiProvider({ apiKey, model = DEFAULT_GEMINI_MODEL, fetchImpl = (...a) => fetch(...a) }) {
  return {
    name: 'gemini',
    label: `Gemini（${model}）`,
    vision: true,
    async complete({ system, messages, tools, signal }) {
      const body = await request(
        `${BASE}/models/${encodeURIComponent(model)}:generateContent`,
        apiKey,
        {
          method: 'POST',
          signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: toContents(messages),
            tools: [{ functionDeclarations: tools }],
            generationConfig: { temperature: 0.2 },
          }),
        },
        fetchImpl,
      );
      return fromResponse(body);
    },
  };
}

/** 列出這把金鑰可用的模型 */
export async function listGeminiModels(apiKey, fetchImpl = (...a) => fetch(...a)) {
  const body = await request(`${BASE}/models?pageSize=200`, apiKey, { method: 'GET' }, fetchImpl);
  return (body.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }));
}
