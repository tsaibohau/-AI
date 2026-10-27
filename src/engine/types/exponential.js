// 指數題型：令 t = bˣ 化成 t 的一次或二次式（例如 4ˣ − 6·2ˣ + 8 = 0）
import { Q, NEG_INF, POS_INF } from '../num.js';
import { EngineError, deg, mathPoly, prettyPoly, trim } from '../poly.js';
import { iv, intersect, formatSet, describeSet, normalizeSet } from '../interval.js';
import { REL_PRETTY, ask, buildResult, rootSteps, solveIneq } from '../common.js';
import { compile, containsVar, pretty, toMath } from '../general/ast.js';
import { sides } from '../general/solve.js';
import { logOf } from '../general/identify.js';
import { parseText } from '../poly.js';

const INEQ = ['<', '<=', '>', '>='];

function rationalCoef(v) {
  for (let d = 1; d <= 1000; d++) {
    const n = Math.round(v * d);
    if (Math.abs(v * d - n) < 1e-7 * Math.max(1, Math.abs(v * d))) return new Q(BigInt(n), BigInt(d));
  }
  return null;
}

/** 用插值檢查 F(log_b t)·t^m 是否為 t 的多項式（最多二次） */
function fitPoly(F, x, b, m) {
  const f = compile(F);
  const h = (t) => f({ [x]: Math.log(t) / Math.log(b) }) * t ** m;
  const ts = [1, 2, 3];
  const ys = ts.map(h);
  if (!ys.every(Number.isFinite)) return null;
  // 二次插值 c0 + c1 t + c2 t²
  const [y1, y2, y3] = ys;
  const c2 = (y3 - 2 * y2 + y1) / 2;
  const c1 = y2 - y1 - 3 * c2;
  const c0 = y1 - c1 - c2;
  for (const t of [0.5, 1.5, 4, 7, 10]) {
    const y = h(t);
    const p = c0 + c1 * t + c2 * t * t;
    if (!Number.isFinite(y) || Math.abs(y - p) > 1e-8 * Math.max(1, Math.abs(y))) return null;
  }
  const qs = [c0, c1, c2].map(rationalCoef);
  if (qs.some((q) => !q)) return null;
  const P = trim(qs);
  return deg(P) >= 1 ? P : null;
}

function candidateBases(F, x) {
  const bases = new Set();
  F.traverse((n) => {
    if (n.type === 'OperatorNode' && n.fn === 'pow' && containsVar(n.args[1], x) && !containsVar(n.args[0], x)) {
      const b = compile(n.args[0])({});
      if (b > 0 && b !== 1) bases.add(b);
    }
  });
  if (!bases.size) throw new EngineError('找不到以變數為指數的項');
  const cands = new Set();
  for (const b0 of bases) {
    const b = b0 < 1 ? 1 / b0 : b0;
    for (let k = 6; k >= 1; k--) {
      const r = b ** (1 / k);
      if (Math.abs(r - Math.round(r)) < 1e-9 && Math.round(r) > 1) cands.add(Math.round(r));
    }
    cands.add(b);
  }
  return [...cands].sort((a, b) => a - b);
}

function setup(an) {
  if (an.param) throw new EngineError('含參數的指數題目還不支援');
  const s = sides(an);
  const F = parseText(`(${s.lhs.toString()})-(${s.rhs.toString()})`);
  for (const b of candidateBases(F, an.x)) {
    for (const m of [0, 1, 2]) {
      const P = fitPoly(F, an.x, b, m);
      if (P) return { ...s, F, b, m, P };
    }
  }
  throw new EngineError('無法化成 t = bˣ 的多項式');
}

function rewriteStep(an, { F, b, m, P, op }) {
  const x = an.x;
  const tPow = `(${b}^${x})`;
  const rhsMath = mathPoly(P, 't').replace(/t/g, tPow);
  const rel = op ? REL_PRETTY[op] : '=';
  return {
    step: `令 t = ${b}^${x}（t > 0）。式中的指數都能寫成 ${b} 的次方，${m ? `兩邊同乘以 t${m > 1 ? '²' : ''}（t > 0，不改變${op && op !== '=' ? '不等號方向' : '等式'}）後，` : ''}原式變成 ${prettyPoly(P, 't')} ${rel} 0`,
    reason: `例如 ${b * b}^${x} = (${b}^${x})² = t²；換元後就是熟悉的 t 的${deg(P) === 2 ? '二次' : '一次'}式`,
    expr: `(${toMath(F)})*${tPow}^${m} = ${rhsMath}`,
    concept: 'base.substitution',
    detail: `把每一個指數項都寫成 (${b}^${x}) 的次方，例如 ${b * b}^${x} = (${b}²)^${x} = (${b}^${x})²、${b}^(${x}+1) = ${b}·${b}^${x}，再把 ${b}^${x} 換成 t`,
    ask: ask(`令 t = ${b}^${x}，原式會變成 t 的哪個式子？（寫出「… = 0」的左邊）`, 'expr_prop', mathPoly(P, 't'), { var: 't' }),
  };
}

function checkText(an, s, xs) {
  const L = compile(s.lhs);
  const R = compile(s.rhs);
  const r = (v) => Math.round(v * 1e6) / 1e6;
  return xs
    .map((xv) => `代回 ${an.x} = ${xv.pretty()}：左邊 ≈ ${r(L({ [an.x]: xv.value() }))}，右邊 ≈ ${r(R({ [an.x]: xv.value() }))}`)
    .join('；');
}

const curve = (F) => ({ kind: 'curve', expr: toMath(F), label: `y = ${pretty(F)}`, stage: 2 });

/** 題型 7：指數方程式 */
export function solveExpEquation(an) {
  if (an.main.kind !== 'rel' || an.main.op !== '=') throw new EngineError('找不到等號');
  const s = setup(an);
  const { b, P } = s;
  const x = an.x;
  const steps = [rewriteStep(an, s)];
  const concepts = [
    ['exp.rules', `把各項化成以 ${b} 為底`],
    ['base.substitution', `令 t = ${b}^${x}，化成多項式`],
    ['exp.equation', '同底時比較指數'],
  ];
  let ts;
  if (deg(P) === 2) {
    const rs = rootSteps(P, 't');
    steps.push(...rs.steps);
    rs.concepts.forEach((why, id) => concepts.push([id, why]));
    ts = rs.roots;
  } else {
    const t0 = P[0].neg().div(P[1]);
    steps.push({ step: `解一次方程式：t = ${t0.pretty()}`, reason: '移項後除以 t 的係數', expr: `${P[1].toMath()}*${t0.toMath()} + ${P[0].toMath()} = 0` });
    ts = [t0];
  }
  const good = ts.filter((t) => t.value() > 0);
  const bad = ts.filter((t) => t.value() <= 0);
  if (bad.length) steps.push({ step: `t = ${b}^${x} 一定大於 0，所以 t = ${bad.map((t) => t.pretty()).join('、')} 不合`, reason: '指數函數的值永遠是正的', expr: '' });
  const xs = [];
  for (const t of good) {
    const xv = logOf(b, t);
    xs.push(xv);
    steps.push({
      step: `${b}^${x} = ${t.pretty()}，所以 ${x} = ${xv.pretty()}`,
      reason: xv instanceof Q ? `${t.pretty()} 是 ${b} 的 ${xv.pretty()} 次方，同底比較指數` : '不是整數次方，用對數表示',
      expr: `${b}^${xv.toMath()} = ${t.toMath()}`,
      concept: 'exp.equation',
      ask: ask(`${b}^${x} = ${t.pretty()}，${x} 是多少？`, 'number', xv.plain()),
    });
  }
  xs.sort((u, v) => u.value() - v.value());
  return buildResult({
    problem: `解方程式 ${pretty(s.lhs)} = ${pretty(s.rhs)}`,
    explicit: [`${pretty(s.lhs)} = ${pretty(s.rhs)}`],
    implicit: [`${x} 是實數`, `${b}^${x} 一定大於 0`],
    concepts,
    steps,
    diagram: {
      type: 'function_graph',
      x: [Math.floor(Math.min(-2, ...xs.map((v) => v.value())) - 1), Math.ceil(Math.max(2, ...xs.map((v) => v.value())) + 1)],
      y: [-6, 6],
      elements: [curve(s.F), ...xs.map((v) => ({ kind: 'point', x: v.value(), y: 0, role: 'root', label: v.pretty(), stage: 4 }))],
    },
    answer: xs.length ? `{${xs.map((v) => v.pretty()).join(', ')}}` : '無實數解',
    check: xs.length ? checkText(an, s, xs) : `t 的解都不是正數，所以 ${b}^${x} 不可能等於它們，無實數解`,
    uncertain: an.uncertain,
  });
}

/** 題型 8：指數不等式 */
export function solveExpInequality(an) {
  if (an.main.kind !== 'rel' || !INEQ.includes(an.main.op)) throw new EngineError('找不到不等號');
  const s = setup(an);
  const { b, P, op } = s;
  const x = an.x;
  const steps = [rewriteStep(an, s)];
  const sol = solveIneq(P, op, 't');
  steps.push(...sol.steps);
  const tPos = intersect(sol.set, [iv(new Q(0n), POS_INF)]);
  steps.push({ step: `再加上 t > 0：${describeSet(tPos, 't')}`, reason: `t = ${b}^${x} 一定是正的`, expr: '' });
  const toX = (e) => (e.inf ? e : e.value() <= 0 ? NEG_INF : logOf(b, e));
  const xSet = normalizeSet(tPos.map((r) => iv(toX(r.lo), toX(r.hi), r.loC && r.lo.value() > 0, r.hiC)));
  steps.push({
    step: `底數 ${b} > 1，y = ${b}^${x} 是遞增函數，t 的範圍直接換回 ${x}：${describeSet(xSet, x)}`,
    reason: `${b}^${x} 越大，${x} 就越大，不等號方向不變`,
    expr: '',
    concept: 'exp.function_graph',
    ask: ask(`${x} 的範圍是什麼？`, 'interval', formatSet(xSet, x)),
  });
  const concepts = [
    ['exp.rules', `把各項化成以 ${b} 為底`],
    ['base.substitution', `令 t = ${b}^${x}`],
    ['exp.function_graph', '底數大於 1 時指數函數遞增'],
    ['exp.inequality', '指數不等式'],
    ...sol.concepts,
  ];
  return buildResult({
    problem: `找出所有使 ${pretty(s.lhs)} ${REL_PRETTY[op]} ${pretty(s.rhs)} 成立的實數 ${x}`,
    explicit: [`不等式 ${pretty(s.lhs)} ${REL_PRETTY[op]} ${pretty(s.rhs)}`],
    implicit: [`${x} 是實數`, `${b}^${x} 一定大於 0`],
    concepts,
    steps,
    diagram: { type: 'function_graph', x: [-4, 4], y: [-6, 6], elements: [curve(s.F), { kind: 'shade', expr: toMath(s.F), sign: `${op}0`, stage: 4 }] },
    answer: formatSet(xSet, x),
    check: '在範圍內外各取一個 x 代回原不等式，前者成立、後者不成立',
    uncertain: an.uncertain,
  });
}
