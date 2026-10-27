// 解題引擎入口：題型清單、自動判斷題型、解題
import { analyze } from './parse.js';
import { EngineError } from './poly.js';
import { solveExtreme, solveVertex, solveRangeExtreme, solveRoots } from './types/quadratic.js';
import { solveQuadIneq, solveAlwaysTrue } from './types/qineq.js';

export const TYPES = [
  { id: 'quad.extreme', unit: '二次函數', label: '求最大值或最小值', solve: solveExtreme },
  { id: 'quad.vertex', unit: '二次函數', label: '求頂點與對稱軸', solve: solveVertex },
  { id: 'quad.range_extreme', unit: '二次函數', label: '限定範圍內的最大或最小值', solve: solveRangeExtreme },
  { id: 'quad.roots', unit: '二次函數', label: '根、與 x 軸交點、判別式', solve: solveRoots },
  { id: 'qineq.solve', unit: '二次不等式', label: '解二次不等式', solve: solveQuadIneq },
  { id: 'qineq.always', unit: '二次不等式', label: '恆成立，求參數範圍', solve: solveAlwaysTrue },
  { id: 'exp.equation', unit: '指數', label: '指數方程式', solve: null },
  { id: 'exp.inequality', unit: '指數', label: '指數不等式', solve: null },
  { id: 'log.equation', unit: '對數', label: '對數方程式', solve: null },
  { id: 'log.inequality', unit: '對數', label: '對數不等式', solve: null },
  { id: 'log.evaluate', unit: '對數', label: '對數求值', solve: null },
];
const BY_ID = new Map(TYPES.map((t) => [t.id, t]));

/** 依關鍵字與算式形式判斷題型；判斷不出來回傳 null */
export function detectType(an) {
  const { keys, main, param, range } = an;
  const ineq = main.kind === 'rel' && ['<', '<=', '>', '>='].includes(main.op);
  const eq = main.kind === 'rel' && main.op === '=';
  if (/log|ln/.test(an.norm)) return eq ? 'log.equation' : ineq ? 'log.inequality' : 'log.evaluate';
  // 變數出現在指數上 → 指數題型
  if (/\^([a-zA-Z]|\([^)]*[a-zA-Z])/.test(main.expr || `${main.lhs}${main.rhs}`)) return ineq ? 'exp.inequality' : 'exp.equation';
  if (param && keys.always && ineq) return 'qineq.always';
  if (ineq && !param) return 'qineq.solve';
  if (keys.vertex || keys.axis) return 'quad.vertex';
  if ((keys.min || keys.max || keys.extreme) && range) return 'quad.range_extreme';
  if (keys.min || keys.max || keys.extreme) return 'quad.extreme';
  if ((main.kind === 'rel' && main.op === '=') || keys.intersect || keys.root || keys.count || keys.discriminant) return 'quad.roots';
  return null;
}

/**
 * 解題。
 * @returns {{ ok: true, type: string, data: object } | { ok: false, reason: string, needType?: boolean, uncertain?: string[] }}
 */
export function solve(text, { type } = {}) {
  let an;
  try {
    an = analyze(text);
  } catch (e) {
    if (e instanceof EngineError) return { ok: false, reason: e.message };
    throw e;
  }
  const id = type || detectType(an);
  if (!id) {
    return {
      ok: false,
      needType: true,
      reason: '無法自動判斷題型，請選擇這題屬於哪一種',
      uncertain: an.uncertain,
    };
  }
  const t = BY_ID.get(id);
  if (!t) return { ok: false, reason: `未知的題型 ${id}` };
  if (!t.solve) return { ok: false, reason: `「${t.label}」題型還在開發中`, type: id };
  try {
    return { ok: true, type: id, data: t.solve(an) };
  } catch (e) {
    if (e instanceof EngineError) return { ok: false, reason: e.message, type: id, needType: !type };
    throw e;
  }
}
