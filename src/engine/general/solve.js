// 通用解題核心：沒有專用模板的題目，也能求出正確答案並給出通用的四階段講解
import { parseText, EngineError } from '../poly.js';
import { Q, NEG_INF, POS_INF } from '../num.js';
import { formatSet, describeSet, iv, normalizeSet } from '../interval.js';
import { ask, buildResult, REL_PRETTY } from '../common.js';
import { compile, containsVar, domainConditions, features, logInfo, pretty, toMath } from './ast.js';
import { domainRuns, extrema, findRoots, signSolve } from './numeric.js';
import { identify, Approx } from './identify.js';
import { rangeText as rangeTextOf } from '../parse.js';

export const num = (v) => (v === Infinity ? POS_INF : v === -Infinity ? NEG_INF : identify(v) || new Approx(v));
const show = (v) => num(v).pretty();

/** 把主算式拆成左右兩邊的語法樹 */
export function sides(an) {
  const m = an.main;
  if (m.kind === 'rel') return { lhs: parseText(m.lhs), rhs: parseText(m.rhs), op: m.op };
  if (m.kind === 'def') return { lhs: parseText(m.expr), rhs: parseText('0'), op: null, def: true };
  return { lhs: parseText(m.expr), rhs: parseText('0'), op: null };
}

const isZero = (n) => n.type === 'ConstantNode' && Number(n.value) === 0;

function domainSet(runs) {
  return normalizeSet(runs.map((r) => iv(num(r.lo), num(r.hi), r.loDef, r.hiDef)));
}

function conceptList(feat, kind, hasDomain) {
  const c = [];
  if (hasDomain) c.push(['base.domain', '先確定式子有意義的範圍，解才算數']);
  if (feat.logVar) {
    c.push(['log.domain', '真數必須大於 0']);
    if (feat.logCount >= 2) c.push(['log.rules', '可以用對數律合併或拆開']);
    c.push(kind === 'inequality' ? ['log.inequality', '對數不等式'] : ['log.equation', '對數方程式']);
  }
  if (feat.expVar) {
    c.push(['exp.rules', '觀察能否化成同底']);
    c.push(kind === 'inequality' ? ['exp.inequality', '指數不等式'] : ['exp.equation', '指數方程式']);
  }
  if (feat.sqrtVar) c.push(['exp.rational', '根號可以看成 1/2 次方']);
  if (kind === 'inequality') {
    c.push(['base.sign_analysis', '用根與斷點把數線切段，逐段判斷正負']);
    c.push(['base.interval_notation', '把解寫成區間']);
  }
  c.push(['base.function_graph', kind === 'extreme' ? '從圖形的最高點、最低點與兩端判斷最值' : '方程式的解就是函數圖形與 x 軸的交點']);
  return c;
}

function niceTest(a, b) {
  const lo = Number.isFinite(a) ? a : (Number.isFinite(b) ? b : 0) - 10;
  const hi = Number.isFinite(b) ? b : lo + 10;
  for (let k = Math.ceil(lo + 1e-9); k < hi - 1e-9; k++) if (k > lo + 1e-9) return k;
  return (lo + hi) / 2;
}

function graph(F, x, roots, extra = []) {
  const pts = [...roots, ...extra].filter(Number.isFinite);
  const lo = Math.floor(Math.min(-1, ...pts) - 2);
  const hi = Math.ceil(Math.max(1, ...pts) + 2);
  const f = compile(F);
  const ys = [];
  for (let i = 0; i <= 60; i++) {
    const v = f({ [x]: lo + ((hi - lo) * i) / 60 });
    if (Number.isFinite(v)) ys.push(v);
  }
  const sorted = ys.sort((a, b) => a - b);
  // 去掉極端值，避免斷點附近把圖拉得太扁
  const ylo = Math.min(0, sorted[Math.floor(sorted.length * 0.05)] ?? -5);
  const yhi = Math.max(0, sorted[Math.floor(sorted.length * 0.95)] ?? 5);
  const pad = Math.max(1, (yhi - ylo) * 0.15);
  return { x: [lo, hi], y: [Math.round((ylo - pad) * 100) / 100, Math.round((yhi + pad) * 100) / 100] };
}

function exprCheck(lhs, rhs, x, v) {
  return `${toMath(lhs, { [x]: v.plain() })} = ${toMath(rhs, { [x]: v.plain() })}`;
}

/** 方程式 lhs = rhs，或求零點 */
function equation(an, { lhs, rhs }) {
  const x = an.x;
  const F = isZero(rhs) ? lhs : parseText(`(${lhs.toString()})-(${rhs.toString()})`);
  const f = compile(F);
  const g = (t) => f({ [x]: t });
  const conds = domainConditions(F, x);
  const runs = domainRuns(g);
  const { roots } = findRoots(g);
  const rs = roots.map(num);
  const feat = features(F, x);
  const eqText = `${pretty(lhs)} = ${pretty(rhs)}`;
  const steps = [];
  if (conds.length) {
    steps.push({
      step: `先確定定義域：${conds.map((c) => c.text).join('、')}，所以 ${describeSet(domainSet(runs), x)}`,
      reason: '式子要有意義，求出的解也必須落在定義域內',
      expr: '',
      concept: 'base.domain',
      ask: ask(`定義域（${x} 的範圍）是什麼？`, 'interval', formatSet(domainSet(runs), x)),
    });
  }
  if (!isZero(rhs)) {
    steps.push({
      step: `移項：令 F(${x}) = ${pretty(F)}，問題變成找 F(${x}) = 0 的 ${x}`,
      reason: `方程式的解，就是 y = F(${x}) 的圖形與 ${x} 軸的交點`,
      expr: '',
    });
  }
  if (rs.length) {
    steps.push({
      step: `觀察 F(${x}) 的正負變化，找出等於 0 的位置：${x} = ${rs.map((r) => r.pretty()).join('、')}`,
      reason: '這題沒有固定公式可套，找出函數值由正變負或碰到 0 的地方，再化成精確值',
      expr: '',
      concept: 'base.function_graph',
      detail: '可以先代幾個整數看看函數值的正負，變號的地方中間就有根；整數試不出來時再用公式或因式分解',
      ...(rs.every((r) => !r.approx) ? { ask: ask(`使方程式成立的 ${x} 是哪些？`, 'set', `{${rs.map((r) => r.plain()).join(', ')}}`, conds.length ? { domain: formatSet(domainSet(runs), x) } : {}) } : {}),
    });
    for (const r of rs) {
      steps.push({
        step: `驗證 ${x} = ${r.pretty()}：左邊 = ${show(compile(lhs)({ [x]: r.value() }))}，右邊 = ${show(compile(rhs)({ [x]: r.value() }))}，相等${conds.length ? '，且在定義域內' : ''}`,
        reason: '代回原式確認',
        expr: exprCheck(lhs, rhs, x, r),
      });
    }
  } else {
    steps.push({ step: `在定義域內 F(${x}) 都不等於 0，所以沒有實數解`, reason: '圖形和 x 軸沒有交點', expr: '' });
  }
  const approx = rs.some((r) => r.approx);
  return buildResult({
    problem: an.main.kind === 'rel' ? `解方程式 ${eqText}` : `求使 ${pretty(lhs)} = 0 的 ${x}`,
    explicit: [an.main.kind === 'rel' ? eqText : `${pretty(lhs)} = 0`],
    implicit: [`${x} 是實數`, ...conds.map((c) => c.text)],
    concepts: conceptList(feat, 'equation', conds.length > 0),
    steps,
    diagram: {
      type: 'function_graph',
      ...graph(F, x, roots),
      elements: [
        { kind: 'curve', expr: toMath(F).replaceAll(x, 'x'), label: `y = ${pretty(F)}`, stage: 2 },
        ...roots.map((r) => ({ kind: 'point', x: r, y: 0, role: 'root', label: show(r), stage: 4 })),
      ],
    },
    answer: rs.length ? (approx ? rs.map((r) => `${x} ${r.pretty()}`).join('、') : `{${rs.map((r) => r.pretty()).join(', ')}}`) : '無實數解',
    check: rs.length ? '把每個解代回原式，左右兩邊相等' + (conds.length ? '，並確認都符合定義域' : '') : '再看一次圖形，確認 F(x) 沒有碰到 x 軸',
    uncertain: [...an.uncertain, ...(approx ? ['有解無法化成簡單的精確值，以近似值表示'] : [])],
  });
}

/** 不等式 lhs rel rhs */
function inequality(an, { lhs, rhs, op }) {
  const x = an.x;
  const F = isZero(rhs) ? lhs : parseText(`(${lhs.toString()})-(${rhs.toString()})`);
  const f = compile(F);
  const g = (t) => f({ [x]: t });
  const conds = domainConditions(F, x);
  const sol = signSolve(g, op);
  const feat = features(F, x);
  const set = normalizeSet(sol.pieces.map((p) => iv(num(p.lo), num(p.hi), p.loC, p.hiC)));
  const text = `${pretty(lhs)} ${REL_PRETTY[op]} ${pretty(rhs)}`;
  const steps = [];
  if (conds.length) {
    steps.push({
      step: `先確定定義域：${conds.map((c) => c.text).join('、')}，所以 ${describeSet(domainSet(sol.runs), x)}`,
      reason: '只能在定義域內找解',
      expr: '',
      concept: 'base.domain',
      ask: ask(`定義域（${x} 的範圍）是什麼？`, 'interval', formatSet(domainSet(sol.runs), x)),
    });
  }
  if (!isZero(rhs)) steps.push({ step: `移項：令 F(${x}) = ${pretty(F)}，判斷 F(${x}) ${REL_PRETTY[op]} 0`, reason: '和 0 比較最容易判斷', expr: '' });
  const cuts = [...sol.roots.map((r) => `${show(r)}（F = 0）`), ...sol.poles.map((p) => `${show(p)}（斷點）`)];
  steps.push({
    step: cuts.length ? `找出分界點：${cuts.join('、')}` : `F(${x}) 在定義域內沒有等於 0 的點`,
    reason: 'F 只有在這些點可能改變正負',
    expr: '',
  });
  for (const r of sol.roots) {
    const v = num(r);
    steps.push({ step: `${x} = ${v.pretty()} 時 F = 0`, reason: '驗算分界點', expr: exprCheck(lhs, rhs, x, v) });
  }
  const tests = sol.tests.map((t) => {
    const at = niceTest(t.lo, t.hi);
    const v = g(at);
    return `${show(t.lo).replace('−∞', '−∞')} 到 ${show(t.hi)} 之間取 ${x} = ${show(at)}：F ${v > 0 ? '> 0' : v < 0 ? '< 0' : '= 0'}`;
  });
  steps.push({ step: `逐段判斷正負：${tests.join('；')}`, reason: '每一段內正負不變，取一點代表整段', expr: '', concept: 'base.sign_analysis' });
  steps.push({
    step: `取符合「${REL_PRETTY[op]} 0」的部分：${describeSet(set, x)}`,
    reason: '把成立的區段合併寫出',
    expr: '',
    concept: 'base.interval_notation',
    ...(set.every((s) => !s.lo.approx && !s.hi.approx) ? { ask: ask(`${x} 的範圍是什麼？`, 'interval', formatSet(set, x), conds.length ? { domain: formatSet(domainSet(sol.runs), x) } : {}) } : {}),
  });
  return buildResult({
    problem: `找出所有使 ${text} 成立的實數 ${x}`,
    explicit: [`不等式 ${text}`],
    implicit: [`${x} 是實數`, ...conds.map((c) => c.text)],
    concepts: conceptList(feat, 'inequality', conds.length > 0),
    steps,
    diagram: {
      type: 'function_graph',
      ...graph(F, x, sol.roots, sol.poles),
      elements: [
        { kind: 'curve', expr: toMath(F), label: `y = ${pretty(F)}`, stage: 2 },
        ...sol.roots.map((r) => ({ kind: 'point', x: r, y: 0, role: 'root', label: show(r), stage: 3 })),
        { kind: 'shade', expr: toMath(F), sign: `${op}0`, stage: 4 },
      ],
    },
    answer: formatSet(set, x),
    check: '在解的範圍內與範圍外各取一點代回原不等式，前者成立、後者不成立',
    uncertain: [...an.uncertain, ...(set.some((s) => s.lo.approx || s.hi.approx) ? ['端點無法化成簡單的精確值，以近似值表示'] : [])],
  });
}

/** 最大值、最小值（可含範圍限制） */
function extreme(an, { lhs }) {
  const x = an.x;
  const r = an.range;
  const f = compile(lhs);
  const g = (t) => f({ [x]: t });
  const opt = r ? { lo: r.lo ? r.lo.value() : -Infinity, hi: r.hi ? r.hi.value() : Infinity, loC: r.loC, hiC: r.hiC } : {};
  if (r) an.usedRange = true;
  const res = extrema(g, opt);
  const conds = domainConditions(lhs, x);
  const k = an.keys;
  const want = k.extreme || (k.min && k.max) || (!k.min && !k.max) ? 'both' : k.max ? 'max' : 'min';
  const name = an.main.kind === 'def' ? (an.main.name === 'y' ? 'y' : `${an.main.name}(${x})`) : `f(${x})`;
  const rangeText = r ? rangeTextOf(r) : null;
  const desc = (e, label) => (e && e.attained ? `${label}為 ${show(e.value)}（在 ${x} = ${show(e.at)}）` : `沒有${label}`);
  const steps = [];
  if (conds.length) steps.push({ step: `先確定定義域：${conds.map((c) => c.text).join('、')}`, reason: '只在有意義的範圍內找最值', expr: '' });
  steps.push({
    step: `觀察 y = ${pretty(lhs)} 的圖形${rangeText ? `在 ${rangeText} 的部分` : ''}：找出最高點、最低點，並看兩端的走向`,
    reason: '最值只會出現在圖形轉折的地方或範圍的端點；若往兩端無限變大或變小就沒有最值',
    expr: '',
  });
  for (const e of [res.min, res.max]) {
    if (e && e.attained) {
      const at = num(e.at);
      steps.push({ step: `${x} = ${at.pretty()} 時，${name} = ${show(e.value)}`, reason: '候選點的函數值', expr: `${toMath(lhs, { [x]: at.plain() })} = ${num(e.value).plain()}` });
    }
  }
  steps.push({ step: `${desc(res.max, '最大值')}；${desc(res.min, '最小值')}`, reason: '比較所有候選值與兩端的走向', expr: '' });
  const one = (e, label) => (e && e.attained ? show(e.value) : `沒有${label}`);
  const answer = want === 'both' ? `最大值 ${one(res.max, '最大值')}，最小值 ${one(res.min, '最小值')}` : want === 'max' ? one(res.max, '最大值') : one(res.min, '最小值');
  const pts = [res.min, res.max].filter((e) => e && e.attained);
  return buildResult({
    problem: `${rangeText ? `在 ${rangeText} 時，` : ''}求 ${name} = ${pretty(lhs)} 的${want === 'both' ? '最大值與最小值' : want === 'max' ? '最大值' : '最小值'}`,
    explicit: [`${name} = ${pretty(lhs)}`, ...(rangeText ? [`範圍 ${rangeText}`] : [])],
    implicit: [...conds.map((c) => c.text), ...(rangeText ? [] : [`${x} 可以是定義域內任意實數`])],
    concepts: conceptList(features(lhs, x), 'extreme', conds.length > 0),
    steps,
    diagram: {
      type: 'function_graph',
      ...graph(lhs, x, pts.map((e) => e.at), r ? [r.lo?.value(), r.hi?.value()].filter((v) => v !== undefined) : []),
      elements: [
        { kind: 'curve', expr: toMath(lhs), label: `${name} = ${pretty(lhs)}`, stage: 2 },
        ...pts.map((e) => ({ kind: 'point', x: e.at, y: e.value, role: 'other', label: `(${show(e.at)}, ${show(e.value)})`, stage: 4 })),
      ],
    },
    answer,
    check: '在候選點附近左右各取一點代入，確認函數值都不超過最大值、不低於最小值',
    uncertain: an.uncertain,
  });
}

/** 沒有變數的算式：直接求值（例如對數計算） */
function evaluate(an, { lhs }) {
  const v = compile(lhs)({});
  if (!Number.isFinite(v)) throw new EngineError('這個算式沒有意義（例如真數不是正數）');
  const res = num(v);
  const logs = [];
  lhs.traverse((n) => {
    const li = logInfo(n);
    if (li && !containsVarAny(n)) logs.push(n);
  });
  const steps = logs.map((n) => {
    const val = num(compile(n)({}));
    return { step: `${pretty(n)} = ${val.pretty()}`, reason: '依對數定義：底數的幾次方等於真數', expr: `${toMath(n)} = ${val.plain()}` };
  });
  steps.push({ step: `合起來計算：${pretty(lhs)} = ${res.pretty()}`, reason: '把每一項的值代入運算', expr: `${toMath(lhs)} = ${res.plain()}` });
  const feat = features(lhs, null);
  return buildResult({
    problem: `求 ${pretty(lhs)} 的值`,
    explicit: [pretty(lhs)],
    implicit: feat.log ? ['對數的真數要大於 0、底數大於 0 且不等於 1', '沒寫底數的 log 是以 10 為底'] : [],
    concepts: feat.log ? [['log.definition', '用定義求對數值'], ['log.rules', '用對數律化簡']] : [['exp.rules', '用指數律化簡']],
    steps,
    diagram: null,
    answer: res.pretty(),
    check: '用計算機按一次，確認數值相同',
    uncertain: [...an.uncertain, ...(res.approx ? ['結果無法化成簡單的精確值，以近似值表示'] : [])],
  });
}

const containsVarAny = (n) => {
  let f = false;
  n.traverse((m, path, parent) => {
    if (m.type === 'SymbolNode' && !['pi', 'e'].includes(m.name) && !(parent?.type === 'FunctionNode' && path === 'fn')) f = true;
  });
  return f;
};

/** 依題目判斷要做什麼；回傳四階段結果，看不出要做什麼就丟出 EngineError */
export function solveGeneral(an) {
  if (an.param) throw new EngineError(`題目含參數 ${an.param}，通用解法無法處理`);
  const s = sides(an);
  if (!an.x) return evaluate(an, s);
  if (an.main.kind === 'rel') {
    if (s.op === '=') return equation(an, s);
    if (['<', '<=', '>', '>='].includes(s.op)) return inequality(an, s);
    throw new EngineError('目前不支援 ≠ 的題目');
  }
  const k = an.keys;
  if (k.min || k.max || k.extreme) return extreme(an, s);
  if (k.root || k.intersect || k.solve) return equation(an, s);
  throw new EngineError('看不出這題要求什麼（解方程式、不等式、最值，或求值）');
}

export { Q, containsVar };
