// 四階段輸出的 JSON schema 與驗證（瀏覽器與 node 共用）
import Ajv from 'ajv';

export const FORBIDDEN_WORDS = ['顯然'];

const str = { type: 'string' };
const strArr = { type: 'array', items: str };

export function buildOutputSchema(conceptIds) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['problem', 'knowns', 'concepts', 'extension', 'diagram', 'answer', 'check', 'uncertain'],
    properties: {
      problem: { type: 'string', minLength: 1 },
      knowns: {
        type: 'object',
        additionalProperties: false,
        required: ['explicit', 'implicit'],
        properties: { explicit: strArr, implicit: strArr },
      },
      concepts: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'why'],
          properties: { id: { enum: conceptIds }, why: str },
        },
      },
      extension: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['step', 'reason', 'expr'],
          properties: { step: { type: 'string', minLength: 1 }, reason: str, expr: str },
        },
      },
      // 圖解規格的細部驗證由渲染器負責；不合法時退回純文字，不影響整份輸出
      diagram: { anyOf: [{ type: 'object' }, { type: 'null' }] },
      answer: { type: 'string', minLength: 1 },
      check: str,
      uncertain: strArr,
    },
  };
}

function collectStrings(value, path, out) {
  if (typeof value === 'string') out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collectStrings(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

function formatAjvError(e) {
  const where = e.instancePath || '(根)';
  if (e.keyword === 'required') return `${where} 缺少欄位 ${e.params.missingProperty}`;
  if (e.keyword === 'additionalProperties') return `${where} 有不允許的欄位 ${e.params.additionalProperty}`;
  if (e.keyword === 'enum') return `${where} 不在概念清單中，請改用清單裡的 id`;
  if (e.keyword === 'type') return `${where} 型別應為 ${e.params.type}`;
  if (e.keyword === 'minItems') return `${where} 至少要有 ${e.params.limit} 項`;
  if (e.keyword === 'minLength') return `${where} 不可為空字串`;
  return `${where} ${e.message}`;
}

/** 建立驗證器。回傳 validate(obj) → { ok, errors: string[] } */
export function createValidator(concepts) {
  const ids = concepts.concepts.map((c) => c.id);
  const ajv = new Ajv({ allErrors: true });
  const check = ajv.compile(buildOutputSchema(ids));
  return function validate(obj) {
    const errors = [];
    if (!check(obj)) {
      const seen = new Set();
      for (const e of check.errors) {
        // anyOf 會多出子錯誤，只保留可讀的訊息
        if (e.keyword === 'anyOf') continue;
        const msg = formatAjvError(e);
        if (!seen.has(msg)) errors.push(msg), seen.add(msg);
      }
    }
    for (const [path, s] of collectStrings(obj, '', [])) {
      for (const w of FORBIDDEN_WORDS) {
        if (s.includes(w)) errors.push(`${path} 使用了禁用詞「${w}」，請寫出理由`);
      }
    }
    return { ok: errors.length === 0, errors };
  };
}

/** 從模型文字取出 JSON（容忍 ```json 圍欄與前後雜訊） */
export function parseModelJson(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: '模型沒有輸出內容' };
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) return { ok: false, error: '找不到 JSON 物件' };
  try {
    return { ok: true, value: JSON.parse(t.slice(start, end + 1)) };
  } catch (e) {
    return { ok: false, error: `JSON 解析失敗：${e.message}` };
  }
}
