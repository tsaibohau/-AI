// 解題引擎入口：題型模板 → 通用解題核心 → 引導思考模式
import concepts from '../../data/concepts.json' with { type: 'json' };
import { analyze, rangeText } from './parse.js';
import { EngineError } from './poly.js';
import { solveExtreme, solveVertex, solveRangeExtreme, solveRoots } from './types/quadratic.js';
import { solveQuadIneq, solveAlwaysTrue } from './types/qineq.js';
import { solveExpEquation, solveExpInequality } from './types/exponential.js';
import { solveLogEquation, solveLogInequality, solveLogEvaluate } from './types/logarithm.js';
import { solveGeneral } from './general/solve.js';
import { buildGuided } from './guided.js';

export const TYPES = [
  { id: 'quad.extreme', unit: '二次函數', label: '求最大值或最小值', solve: solveExtreme },
  { id: 'quad.vertex', unit: '二次函數', label: '求頂點與對稱軸', solve: solveVertex },
  { id: 'quad.range_extreme', unit: '二次函數', label: '限定範圍內的最大或最小值', solve: solveRangeExtreme },
  { id: 'quad.roots', unit: '二次函數', label: '根、與 x 軸交點、判別式', solve: solveRoots },
  { id: 'qineq.solve', unit: '二次不等式', label: '解二次不等式', solve: solveQuadIneq },
  { id: 'qineq.always', unit: '二次不等式', label: '恆成立，求參數範圍', solve: solveAlwaysTrue },
  { id: 'exp.equation', unit: '指數', label: '指數方程式', solve: solveExpEquation },
  { id: 'exp.inequality', unit: '指數', label: '指數不等式', solve: solveExpInequality },
  { id: 'log.equation', unit: '對數', label: '對數方程式', solve: solveLogEquation },
  { id: 'log.inequality', unit: '對數', label: '對數不等式', solve: solveLogInequality },
  { id: 'log.evaluate', unit: '對數', label: '對數求值', solve: solveLogEvaluate },
];
export const GENERAL = { id: 'general', unit: '通用', label: '通用解法' };
const BY_ID = new Map(TYPES.map((t) => [t.id, t]));
const CONCEPT_NAME = new Map(concepts.concepts.map((c) => [c.id, c.name]));

/** 依關鍵字與算式形式判斷題型；判斷不出來回傳 null */
export function detectType(an) {
  const { keys, main, param, range } = an;
  const ineq = main.kind === 'rel' && ['<', '<=', '>', '>='].includes(main.op);
  const eq = main.kind === 'rel' && main.op === '=';
  const body = main.expr || `${main.lhs}${main.rhs}`;
  if (/log|ln/.test(body)) return !an.x ? 'log.evaluate' : eq ? 'log.equation' : ineq ? 'log.inequality' : null;
  if (an.x && /\^([a-zA-Z]|\([^)]*[a-zA-Z])/.test(body)) return ineq ? 'exp.inequality' : eq ? 'exp.equation' : null;
  if (!an.x) return null;
  if (param && keys.always && ineq) return 'qineq.always';
  if (ineq && !param) return 'qineq.solve';
  if (keys.vertex || keys.axis) return 'quad.vertex';
  if ((keys.min || keys.max || keys.extreme) && range) return 'quad.range_extreme';
  if (keys.min || keys.max || keys.extreme) return 'quad.extreme';
  if (eq || keys.intersect || keys.root || keys.count || keys.discriminant) return 'quad.roots';
  return null;
}

/** 題目有範圍限制但解法沒用到時提醒學生 */
function checkRange(an, res) {
  if (res.ok && an.range && !an.usedRange) {
    res.data.uncertain.push(`題目中的條件「${rangeText(an.range)}」沒有用在這個解法裡，請確認答案是否要再和它取交集`);
  }
  return res;
}

function failure(text, an, reason, extra = {}) {
  return { ok: false, reason, guided: buildGuided(text, an, (id) => CONCEPT_NAME.get(id)), uncertain: an?.uncertain || [], ...extra };
}

/**
 * 解題。
 * 成功：{ ok: true, type, data, note? }
 * 失敗：{ ok: false, reason, guided, needType?, uncertain }
 */
export function solve(text, { type } = {}) {
  let an;
  try {
    an = analyze(text);
  } catch (e) {
    if (!(e instanceof EngineError)) throw e;
    return failure(text, null, e.message);
  }
  const id = type || detectType(an);
  let why = null;
  if (id && id !== 'general') {
    const t = BY_ID.get(id);
    if (!t) return failure(text, an, `未知的題型 ${id}`);
    try {
      return checkRange(an, { ok: true, type: id, data: t.solve(an) });
    } catch (e) {
      if (!(e instanceof EngineError)) throw e;
      why = `「${t.label}」的專用解法不適用（${e.message}）`;
    }
  }
  try {
    const data = solveGeneral(an);
    return checkRange(an, { ok: true, type: 'general', data, note: why ? `${why}，改用通用解法` : null });
  } catch (e) {
    if (!(e instanceof EngineError)) throw e;
    return failure(text, an, why ? `${why}；通用解法也無法處理（${e.message}）` : e.message, { needType: !type });
  }
}
