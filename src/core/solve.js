// 解題流程：呼叫模型 → 解析 JSON → 驗證 → 格式錯就自動重試一次
import { generate } from './gemini.js';
import { buildSystemPrompt, buildUserParts, buildRetryText } from './prompt.js';
import { createValidator, parseModelJson } from './schema.js';

export const MAX_ATTEMPTS = 2; // 第一次 + 自動重試一次

/** 檢查一段模型原始輸出，回傳 { ok, data, errors } */
export function checkRaw(raw, validate) {
  const parsed = parseModelJson(raw);
  if (!parsed.ok) return { ok: false, errors: [parsed.error] };
  const v = validate(parsed.value);
  return { ok: v.ok, data: parsed.value, errors: v.errors };
}

/**
 * @returns {Promise<{ ok: boolean, data?: object, attempts: {raw: string, errors: string[]}[] }>}
 * 網路或金鑰錯誤會丟出 GeminiError。
 */
export async function solveProblem({ apiKey, model, concepts, text, image, fetchImpl }) {
  const validate = createValidator(concepts);
  const system = buildSystemPrompt(concepts);
  const contents = [{ role: 'user', parts: buildUserParts({ text, image }) }];
  const attempts = [];

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const raw = await generate({ apiKey, model, system, contents, fetchImpl });
    const r = checkRaw(raw, validate);
    attempts.push({ raw, errors: r.errors });
    if (r.ok) return { ok: true, data: r.data, attempts };
    // 把上次的輸出與錯誤告訴模型，再試一次
    contents.push({ role: 'model', parts: [{ text: raw }] });
    contents.push({ role: 'user', parts: [{ text: buildRetryText(r.errors) }] });
  }
  return { ok: false, attempts };
}
