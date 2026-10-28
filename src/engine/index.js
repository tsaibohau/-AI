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
import { isCircumcenterApp, solveCircumcenterApp } from './types/application.js';
import { compareAnswer } from '../core/answer.js';

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
// 應用問題直接讀題目文字（不經過算式分析）
export const APP_TYPES = [{ id: 'app.circumcenter', unit: '應用問題', label: '到三點等距（外心）', detect: isCircumcenterApp, solve: solveCircumcenterApp }];
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

// 每種題型最後答案的格式（依序嘗試）
const FINAL_TYPES = {
  'quad.extreme': ['number'],
  'quad.vertex': ['point', 'number'],
  'quad.range_extreme': ['number'],
  'quad.roots': ['set', 'number'],
  'qineq.solve': ['interval'],
  'qineq.always': ['interval'],
  'exp.equation': ['set'],
  'exp.inequality': ['interval'],
  'log.equation': ['set'],
  'log.inequality': ['interval'],
  'log.evaluate': ['number'],
  general: ['set', 'interval', 'number'],
};

/** 學生最後作答要比對的答案；答案是文字敘述（例如同時問最大最小值）時回傳 null */
export function finalAsk(type, data) {
  for (const t of FINAL_TYPES[type] || []) {
    try {
      if (compareAnswer({ type: t, value: data.answer }, data.answer).ok) return { q: '你的最後答案是？', type: t, value: data.answer };
    } catch {
      /* 這個格式解析不了，試下一個 */
    }
  }
  return null;
}

// 題目要求的類型（給「審題」選擇題用）
export const GOALS = ['求最大值或最小值', '求頂點或對稱軸', '解方程式（找出所有解）', '解不等式（找出範圍）', '求參數的範圍', '求一個式子的值', '求點的坐標或直線方程式'];

export function goalOf(type, data) {
  const map = {
    'quad.extreme': 0, 'quad.range_extreme': 0, 'quad.vertex': 1, 'quad.roots': 2, 'exp.equation': 2, 'log.equation': 2,
    'qineq.solve': 3, 'exp.inequality': 3, 'log.inequality': 3, 'qineq.always': 4, 'log.evaluate': 5,
  };
  if (type in map) return GOALS[map[type]];
  const p = data.problem;
  if (/^解方程式|^求使/.test(p)) return GOALS[2];
  if (/^找出所有使/.test(p)) return GOALS[3];
  if (/最大值|最小值/.test(p)) return GOALS[0];
  return GOALS[5];
}

/** 題目有範圍限制但解法沒用到時提醒學生 */
function checkRange(an, res) {
  if (res.ok && an.range && !an.usedRange) {
    res.data.uncertain.push(`題目中的條件「${rangeText(an.range)}」沒有用在這個解法裡，請確認答案是否要再和它取交集`);
  }
  if (res.ok) {
    res.final = finalAsk(res.type, res.data);
    res.goal = goalOf(res.type, res.data);
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
  const app = APP_TYPES.find((t) => (type ? t.id === type : t.detect(text)));
  if (app) {
    try {
      const { data, goal, final } = app.solve(text);
      return { ok: true, type: app.id, data, goal, final };
    } catch (e) {
      if (!(e instanceof EngineError)) throw e;
      return failure(text, null, `「${app.label}」的解法不適用（${e.message}）`);
    }
  }
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
