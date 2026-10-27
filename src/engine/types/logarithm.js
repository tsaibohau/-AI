// 對數題型：合併成單一對數 → 化成指數 → 解多項式 → 檢查真數
import { Q, lcm } from '../num.js';
import { EngineError, deg, mathPoly, parseText, prettyPoly, toMPoly, umul, usub, uscale, ueval } from '../poly.js';
import { ALL, contains, describeSet, formatSet, intersect } from '../interval.js';
import { REL_PRETTY, buildResult, rootSteps, solveIneq } from '../common.js';
import { compile, containsVar, logInfo, pretty, toMath } from '../general/ast.js';
import { sides, num } from '../general/solve.js';

const INEQ = ['<', '<=', '>', '>='];
const strip = (n) => (n.type === 'ParenthesisNode' ? strip(n.content) : n);

/** 攤平加減：回傳 [{ sign, node }] */
function terms(node, sign = 1, out = []) {
  const n = strip(node);
  if (n.type === 'OperatorNode' && n.fn === 'add') {
    terms(n.args[0], sign, out);
    terms(n.args[1], sign, out);
  } else if (n.type === 'OperatorNode' && n.fn === 'subtract') {
    terms(n.args[0], sign, out);
    terms(n.args[1], -sign, out);
  } else if (n.type === 'OperatorNode' && n.fn === 'unaryMinus') {
    terms(n.args[0], -sign, out);
  } else out.push({ sign, node: n });
  return out;
}

/** 一項拆成 係數 × (最多一個 log)；回傳 { coef: Q, log: { base, arg } | null } */
function factor(node) {
  const n = strip(node);
  const li = logInfo(n);
  if (li) {
    if (typeof li.base !== 'number') throw new EngineError('底數含變數的對數還不支援');
    return { coef: new Q(1n), log: li };
  }
  if (n.type === 'OperatorNode' && n.fn === 'multiply') {
    const a = factor(n.args[0]);
    const b = factor(n.args[1]);
    if (a.log && b.log) throw new EngineError('兩個對數相乘，需要換底公式');
    return { coef: a.coef.mul(b.coef), log: a.log || b.log };
  }
  if (n.type === 'OperatorNode' && n.fn === 'divide') {
    const a = factor(n.args[0]);
    const b = factor(n.args[1]);
    if (b.log) throw new EngineError('對數在分母，需要換底公式');
    return { coef: a.coef.div(b.coef), log: a.log };
  }
  if (n.type === 'OperatorNode' && n.fn === 'unaryMinus') {
    const a = factor(n.args[0]);
    return { coef: a.coef.neg(), log: a.log };
  }
  if (containsAnyVar(n)) throw new EngineError('變數出現在對數外面');
  const p = toMPoly(n, []);
  return { coef: p.constantValue(), log: null };
}

function containsAnyVar(n) {
  let f = false;
  n.traverse((m, path, parent) => {
    if (m.type === 'SymbolNode' && !(parent?.type === 'FunctionNode' && path === 'fn')) f = true;
  });
  return f;
}

/** 找共同底數 B，使每個底數都是 B 的有理數次方；回傳 B 與各底數的次方 */
function commonBase(bases) {
  // 底數小於 1（例如 1/2）時用倒數當共同底數，次方為負，係數自動變號
  const uniq = [...new Set(bases)];
  const cand = new Set();
  for (const b of uniq) {
    const bb = b < 1 ? 1 / b : b;
    cand.add(bb);
    for (let k = 2; k <= 6; k++) {
      const r = bb ** (1 / k);
      if (Math.abs(r - Math.round(r)) < 1e-9 && Math.round(r) > 1) cand.add(Math.round(r));
    }
  }
  for (const B of [...cand].sort((a, b) => a - b)) {
    const ks = uniq.map((b) => {
      const k = Math.log(b) / Math.log(B);
      for (let d = 1; d <= 6; d++) if (Math.abs(k * d - Math.round(k * d)) < 1e-9) return new Q(BigInt(Math.round(k * d)), BigInt(d));
      return null;
    });
    if (ks.every((k) => k && !k.isZero())) return { B, k: new Map(uniq.map((b, i) => [b, ks[i]])) };
  }
  throw new EngineError('對數的底數無法化成同一個底');
}

const SUBS = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const logName = (B) => (B === 10 ? 'log' : B === Math.E ? 'ln' : `log${String(B).replace(/\d/g, (d) => SUBS[d])}`);
const pp = (p, x) => {
  const s = prettyPoly(p, x);
  return /[+−]/.test(s.slice(1)) ? `(${s})` : s;
};
const product = (fs, x) =>
  fs.length ? fs.map(({ g, n }) => `${pp(g, x)}${n > 1 ? (n === 2 ? '²' : n === 3 ? '³' : `^${n}`) : ''}`).join('') : '1';
const productMath = (fs, x) => (fs.length ? fs.map(({ g, n }) => `(${mathPoly(g, x)})^${n}`).join('*') : '1');
const productPoly = (fs) => fs.reduce((acc, { g, n }) => {
  let r = acc;
  for (let i = 0; i < n; i++) r = umul(r, g);
  return r;
}, [new Q(1n)]);

/** 把 F(x) 分析成 Σ c·log_B(g) + C */
function analyzeLogs(an) {
  if (an.param) throw new EngineError('含參數的對數題目還不支援');
  const s = sides(an);
  const x = an.x;
  const F = parseText(`(${s.lhs.toString()})-(${s.rhs.toString()})`);
  const raw = terms(F).map(({ sign, node }) => {
    const f = factor(node);
    return { coef: sign < 0 ? f.coef.neg() : f.coef, log: f.log };
  });
  let C = new Q(0n);
  const logs = [];
  for (const t of raw) {
    if (!t.log) {
      C = C.add(t.coef);
      continue;
    }
    if (!containsVar(t.log.arg, x)) {
      // 常數的對數：值是有理數就併入常數
      const v = compile(t.log.arg)({});
      const val = Math.log(v) / Math.log(t.log.base);
      const q = num(val);
      if (q instanceof Q) {
        C = C.add(t.coef.mul(q));
        continue;
      }
    }
    const g = toMPoly(t.log.arg, [x]).coeffsIn(x, null).map((c) => c[0]);
    logs.push({ coef: t.coef, base: t.log.base, g, node: t.log.arg });
  }
  if (!logs.length) throw new EngineError('找不到含變數的對數');
  const { B, k } = commonBase(logs.map((l) => l.base));
  const changed = logs.filter((l) => !k.get(l.base).eq(1));
  for (const l of logs) l.c = l.coef.div(k.get(l.base)); // log_b g = (1/k) log_B g
  return { s, F, x, B, C, logs, changed };
}

function domainOf(logs, x) {
  let set = ALL();
  const steps = [];
  for (const l of logs) {
    if (deg(l.g) > 2) throw new EngineError('真數的次方太高');
    set = intersect(set, solveIneq(l.g, '>', x).set);
  }
  return { set, steps };
}

function prepare(an, op) {
  const A = analyzeLogs(an);
  const { x, B, C, logs } = A;
  const L = logs.reduce((m, l) => lcm(m, l.c.d), 1n);
  const n = logs.map((l) => l.c.mul(new Q(L)));
  const K = C.mul(new Q(L)).neg(); // Σ n_i log_B g_i = K
  if (!K.isInt()) throw new EngineError('化成指數時次方不是整數');
  const pos = [];
  const neg = [];
  logs.forEach((l, i) => {
    const ni = Number(n[i].n);
    if (ni > 0) pos.push({ g: l.g, n: ni });
    if (ni < 0) neg.push({ g: l.g, n: -ni });
  });
  const Ki = Number(K.n);
  const BK = Ki >= 0 ? new Q(BigInt(B) ** BigInt(Ki)) : new Q(1n, BigInt(B) ** BigInt(-Ki));
  if (!Number.isInteger(B)) throw new EngineError('自然對數題目化成指數會出現 e，改用通用解法');
  const P = usub(productPoly(pos), uscale(productPoly(neg), BK));
  if (deg(P) > 2) throw new EngineError('合併後次方太高');
  const dom = domainOf(logs, x);
  const steps = [];
  steps.push({
    step: `先找定義域：真數都要大於 0（${logs.map((l) => `${prettyPoly(l.g, x)} > 0`).join('、')}），所以 ${describeSet(dom.set, x)}`,
    reason: '對數的真數必須是正數，最後要用來檢查解',
    expr: '',
  });
  if (A.changed.length) {
    steps.push({
      step: `換底，統一用 ${logName(B)}：${A.changed.map((l) => `${logName(l.base)}(${prettyPoly(l.g, x)}) = (${l.c.div(l.coef).pretty()})·${logName(B)}(${prettyPoly(l.g, x)})`).join('、')}`,
      reason: `底數都是 ${B} 的次方，用換底公式化成同底`,
      expr: '',
    });
  }
  if (L !== 1n) steps.push({ step: `兩邊同乘以 ${L}，讓係數都是整數`, reason: '係數會變成真數的次方，用整數比較好算', expr: '' });
  const left = `${logName(B)}(${product(pos, x)})`;
  const right = neg.length ? `${logName(B)}(${product(neg, x)}) + ${Ki}` : `${Ki}`;
  steps.push({
    step: `用對數律合併：${left} ${REL_PRETTY[op]} ${right}`,
    reason: 'log M + log N = log(MN)，n·log M = log Mⁿ；係數為負的移到另一邊',
    expr: '',
  });
  return { ...A, pos, neg, K: Ki, BK, P, dom, steps };
}

/** 題型 9：對數方程式 */
export function solveLogEquation(an) {
  if (an.main.kind !== 'rel' || an.main.op !== '=') throw new EngineError('找不到等號');
  const d = prepare(an, '=');
  const { x, B, pos, neg, K, BK, P, dom, s } = d;
  const steps = [...d.steps];
  steps.push({
    step: `化成指數：${product(pos, x)} = ${neg.length ? `${B}^${K} · ${product(neg, x)}` : `${B}^${K} = ${BK.pretty()}`}`,
    reason: `log_b A = k 等於 A = b^k（對數的定義）`,
    expr: '',
  });
  steps.push({
    step: `展開移項：${prettyPoly(P, x)} = 0`,
    reason: '整理成多項式方程式',
    expr: `${productMath(pos, x)} - ${BK.toMath()}*${productMath(neg, x)} = ${mathPoly(P, x)}`,
  });
  const concepts = [
    ['log.domain', '真數要大於 0'],
    ['log.rules', '用對數律合併'],
    ['log.definition', '把對數式化成指數式'],
    ['log.equation', '對數方程式'],
  ];
  if (d.changed.length) concepts.push(['log.change_base', '換底化成同底']);
  let roots;
  if (deg(P) === 2) {
    const rs = rootSteps(P, x);
    steps.push(...rs.steps);
    rs.concepts.forEach((why, id) => concepts.push([id, why]));
    roots = rs.roots;
  } else if (deg(P) === 1) {
    const r = P[0].neg().div(P[1]);
    steps.push({ step: `${x} = ${r.pretty()}`, reason: '解一次方程式', expr: `${mathPoly(P, x).replace(new RegExp(x, 'g'), `(${r.plain()})`)} = 0` });
    roots = [r];
  } else throw new EngineError('合併後不是一次或二次方程式');
  const good = roots.filter((r) => contains(dom.set, r.value()));
  const bad = roots.filter((r) => !contains(dom.set, r.value()));
  steps.push({
    step: `檢查定義域：${[...good.map((r) => `${x} = ${r.pretty()} 符合`), ...bad.map((r) => `${x} = ${r.pretty()} 不合（真數會小於或等於 0）`)].join('；')}`,
    reason: '化成多項式時可能多出不合的根，一定要代回檢查',
    expr: '',
  });
  const f = compile(d.F);
  return buildResult({
    problem: `解方程式 ${pretty(s.lhs)} = ${pretty(s.rhs)}`,
    explicit: [`${pretty(s.lhs)} = ${pretty(s.rhs)}`],
    implicit: [`真數都要大於 0：${d.logs.map((l) => `${prettyPoly(l.g, x)} > 0`).join('、')}`],
    concepts,
    steps,
    diagram: {
      type: 'number_line',
      x: [Math.floor(Math.min(-3, ...roots.map((r) => r.value()))) - 1, Math.ceil(Math.max(3, ...roots.map((r) => r.value()))) + 1],
      elements: [
        ...dom.set.map((r) => ({ kind: 'interval', from: r.lo.inf ? '-inf' : r.lo.value(), to: r.hi.inf ? 'inf' : r.hi.value(), closedFrom: r.loC, closedTo: r.hiC, stage: 2 })),
        ...good.map((r) => ({ kind: 'point', x: r.value(), closed: true, label: `${x} = ${r.pretty()}`, stage: 4 })),
        ...bad.map((r) => ({ kind: 'point', x: r.value(), closed: false, label: `${r.pretty()}（不合）`, stage: 4 })),
      ],
    },
    answer: good.length ? `{${good.map((r) => r.pretty()).join(', ')}}` : '無解',
    check: good.length ? good.map((r) => `代回 ${x} = ${r.pretty()}：左邊減右邊 = ${num(f({ [x]: r.value() })).pretty()}`).join('；') : '所有候選根都不符合定義域，所以無解',
    uncertain: an.uncertain,
  });
}

/** 題型 10：對數不等式 */
export function solveLogInequality(an) {
  if (an.main.kind !== 'rel' || !INEQ.includes(an.main.op)) throw new EngineError('找不到不等號');
  const op = an.main.op;
  const d = prepare(an, op);
  const { x, B, pos, neg, K, BK, P, dom, s } = d;
  const steps = [...d.steps];
  steps.push({
    step: `底數 ${B} > 1，${logName(B)} 是遞增函數，去掉對數時不等號方向不變：${product(pos, x)} ${REL_PRETTY[op]} ${neg.length ? `${BK.pretty()} · ${product(neg, x)}` : BK.pretty()}`,
    reason: `真數越大，對數值越大；${neg.length ? `在定義域內 ${product(neg, x)} > 0，` : ''}${B}^${K} = ${BK.pretty()}`,
    expr: '',
  });
  steps.push({
    step: `移項整理：${prettyPoly(P, x)} ${REL_PRETTY[op]} 0`,
    reason: '整理成多項式不等式',
    expr: `${productMath(pos, x)} - ${BK.toMath()}*${productMath(neg, x)} = ${mathPoly(P, x)}`,
  });
  const sol = solveIneq(P, op, x);
  steps.push(...sol.steps);
  const set = intersect(sol.set, dom.set);
  steps.push({ step: `和定義域取交集：${describeSet(set, x)}`, reason: '解必須同時讓真數大於 0', expr: '' });
  const concepts = [
    ['log.domain', '真數要大於 0'],
    ['log.rules', '用對數律合併'],
    ['log.function_graph', '底數大於 1 時對數函數遞增'],
    ['log.inequality', '對數不等式'],
    ...sol.concepts,
  ];
  if (d.changed.length) concepts.push(['log.change_base', '換底化成同底']);
  return buildResult({
    problem: `找出所有使 ${pretty(s.lhs)} ${REL_PRETTY[op]} ${pretty(s.rhs)} 成立的實數 ${x}`,
    explicit: [`不等式 ${pretty(s.lhs)} ${REL_PRETTY[op]} ${pretty(s.rhs)}`],
    implicit: [`真數都要大於 0：${d.logs.map((l) => `${prettyPoly(l.g, x)} > 0`).join('、')}`],
    concepts,
    steps,
    diagram: {
      type: 'number_line',
      x: [-5, 10],
      elements: [
        ...dom.set.map((r) => ({ kind: 'interval', from: r.lo.inf ? '-inf' : r.lo.value(), to: r.hi.inf ? 'inf' : r.hi.value(), closedFrom: r.loC, closedTo: r.hiC, stage: 2 })),
        ...set.map((r) => ({ kind: 'interval', from: r.lo.inf ? '-inf' : r.lo.value(), to: r.hi.inf ? 'inf' : r.hi.value(), closedFrom: r.loC, closedTo: r.hiC, stage: 4 })),
      ],
    },
    answer: formatSet(set, x),
    check: '在範圍內外各取一點代回原不等式（要先確認真數為正），前者成立、後者不成立',
    uncertain: an.uncertain,
  });
}

/** 題型 11：對數求值（沒有變數） */
export function solveLogEvaluate(an) {
  if (an.x) throw new EngineError('有變數，不是求值題');
  const s = sides(an);
  const node = s.lhs;
  const value = compile(node)({});
  if (!Number.isFinite(value)) throw new EngineError('這個算式沒有意義');
  const res = num(value);
  const steps = [];
  const concepts = [['log.definition', '底數的幾次方等於真數']];
  let combined = null;
  try {
    // 線性組合：Σ c·log_b(常數)
    const parts = terms(node).map(({ sign, node: n }) => {
      const f = factor(n);
      return { coef: sign < 0 ? f.coef.neg() : f.coef, log: f.log };
    });
    const logs = parts.filter((p) => p.log);
    const C = parts.filter((p) => !p.log).reduce((a, p) => a.add(p.coef), new Q(0n));
    if (logs.length >= 2) {
      const { B, k } = commonBase(logs.map((l) => l.log.base));
      if (Number.isInteger(B)) {
        let prodNum = new Q(1n);
        let ok = true;
        const pieces = [];
        for (const l of logs) {
          const c = l.coef.div(k.get(l.log.base));
          const argV = compile(l.log.arg)({});
          const arg = num(argV);
          if (!(arg instanceof Q) || !c.isInt()) ok = false;
          else {
            const e = Number(c.n);
            prodNum = prodNum.mul(e >= 0 ? arg.pow(e) : new Q(1n).div(arg.pow(-e)));
            pieces.push(`${c.eq(1) ? '' : c.eq(-1) ? '−' : `${c.pretty()}·`}${logName(B)} ${arg.pretty()}`);
          }
        }
        if (ok) {
          if (logs.some((l) => !k.get(l.log.base).eq(1))) {
            steps.push({ step: `換底，統一用 ${logName(B)}：${pieces.join(' + ').replace(/\+ −/g, '− ')}`, reason: `底數都是 ${B} 的次方`, expr: '' });
            concepts.push(['log.change_base', '換底化成同底']);
          }
          steps.push({
            step: `用對數律合併：= ${logName(B)} ${prodNum.isInt() ? prodNum.pretty() : `(${prodNum.pretty()})`}${C.isZero() ? '' : ` ${C.sign() > 0 ? '+' : '−'} ${C.abs().pretty()}`}`,
            reason: 'log M + log N = log(MN)，log M − log N = log(M/N)，n·log M = log Mⁿ',
            expr: '',
          });
          concepts.push(['log.rules', '用對數律合併']);
          combined = true;
        }
      }
    }
  } catch {
    combined = null;
  }
  if (!combined) {
    node.traverse((n) => {
      const li = logInfo(n);
      if (li && typeof li.base === 'number') {
        const v = num(compile(n)({}));
        if (v instanceof Q) {
          steps.push({ step: `${pretty(n)} = ${v.pretty()}`, reason: '真數是底數的整數次方', expr: `${toMath(n)} = ${v.plain()}` });
        } else {
          const arg = pretty(li.arg);
          const b = li.base === Math.E ? 'e' : String(li.base);
          steps.push({
            step: `換底：${pretty(n)} = log ${arg} / log ${b}`,
            reason: '換底公式：logₐb = log b / log a，不同底的對數相乘時，換成同底才能約分',
            expr: `${toMath(n)} = log(${toMath(li.arg)}, 10)/log(${li.base === Math.E ? 'e' : li.base}, 10)`,
          });
        }
      }
    });
    if (steps.some((st) => st.step.startsWith('換底'))) concepts.push(['log.change_base', '用換底公式']);
  }
  steps.push({ step: `計算結果：${pretty(node)} = ${res.pretty()}`, reason: '代入各項的值', expr: `${toMath(node)} = ${res.plain()}` });
  return buildResult({
    problem: `求 ${pretty(node)} 的值`,
    explicit: [pretty(node)],
    implicit: ['沒寫底數的 log 是以 10 為底', '真數要大於 0、底數大於 0 且不等於 1'],
    concepts,
    steps,
    diagram: null,
    answer: res.pretty(),
    check: '用計算機驗算，數值相同',
    uncertain: [...an.uncertain, ...(res.approx ? ['結果無法化成簡單的精確值，以近似值表示'] : [])],
  });
}

export { ueval };
