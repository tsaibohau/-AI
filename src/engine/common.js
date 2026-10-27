// 解題器共用：取得二次式、求根步驟、解不等式步驟、組合四階段結果
import { Q, Surd, quadRoots, toIntCoeffs, gcd } from './num.js';
import { EngineError, MPoly, deg, mathPoly, parseText, prettyPoly, toMPoly, ueval, uscale } from './poly.js';
import { ALL, describeSet, formatSet, iv, point } from './interval.js';
import { NEG_INF, POS_INF } from './num.js';

export const REL_PRETTY = { '<': '<', '<=': '≤', '>': '>', '>=': '≥', '=': '=', '!=': '≠' };
export const FLIP = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' };
export const holds = (sign, rel) =>
  ({ '<': sign < 0, '<=': sign <= 0, '>': sign > 0, '>=': sign >= 0 })[rel];

/** 把原始算式文字整理成好讀的樣子（給「已知」顯示用） */
export function prettyText(s) {
  return String(s)
    .replace(/\^\((\d+)\)/g, '^$1')
    .replace(/\^2(?!\d)/g, '²')
    .replace(/\^3(?!\d)/g, '³')
    .replace(/<=/g, ' ≤ ')
    .replace(/>=/g, ' ≥ ')
    .replace(/!=/g, ' ≠ ')
    .replace(/(?<![≤≥])([<>])(?!=)/g, ' $1 ')
    .replace(/(?<![<>!])=/g, ' = ')
    .replace(/(\d)\*(?=[a-zA-Z(])/g, '$1')
    .replace(/\*/g, '·')
    .replace(/sqrt\(/g, '√(')
    .replace(/(?<=[\w)²³])\s*([+-])\s*/g, ' $1 ')
    .replace(/-/g, '−')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 主算式轉成多項式（關係式取左減右） */
export function mainPoly(an) {
  const vars = [an.x, an.param].filter(Boolean);
  const m = an.main;
  if (m.kind === 'rel') {
    const l = toMPoly(parseText(m.lhs), vars);
    const r = toMPoly(parseText(m.rhs), vars);
    return { poly: l.sub(r), lhs: l, rhs: r, vars };
  }
  return { poly: toMPoly(an.node, vars), vars };
}

/** 取得不含參數的二次式係數（由常數項開始） */
export function quadOf(an) {
  if (an.param) throw new EngineError(`這個題型不應該有參數 ${an.param}`);
  const { poly, lhs, rhs } = mainPoly(an);
  const p = poly.coeffsIn(an.x, null).map((c) => c[0]);
  if (deg(p) !== 2) throw new EngineError('這不是二次式，目前只支援二次函數與二次不等式');
  return { p, lhs: lhs && lhs.coeffsIn(an.x, null).map((c) => c[0]), rhs: rhs && rhs.coeffsIn(an.x, null).map((c) => c[0]) };
}

/** 頂點 h = −b/(2a)，k = f(h) */
export function vertexOf(p) {
  const [c, b, a] = p;
  const h = b.neg().div(a.mul(2));
  return { a, b, c, h, k: ueval(p, h) };
}

export function vertexFormPretty(a, h, k, v = 'x') {
  const aStr = a.eq(1) ? '' : a.eq(-1) ? '−' : a.isInt() ? a.pretty() : `(${a.pretty()})`;
  const sq = h.isZero() ? `${v}²` : `(${v} ${h.sign() > 0 ? '−' : '+'} ${h.abs().pretty()})²`;
  const kStr = k.isZero() ? '' : ` ${k.sign() > 0 ? '+' : '−'} ${k.abs().pretty()}`;
  return `${aStr}${sq}${kStr}`;
}
export const vertexFormMath = (a, h, k, v = 'x') => `${a.toMath()}*(${v} - ${h.toMath()})^2 + ${k.toMath()}`;

/** 代值算式：把變數換成數字，例如 2*(2)^2 - 8*(2) + 3 */
export const subst = (p, val, v = 'x') =>
  mathPoly(p, v).replace(new RegExp(`\\b${v}\\b`, 'g'), `(${val.plain()})`);

/** 老師模式的提問 */
export const ask = (q, type, value, extra = {}) => ({ q, type, value, ...extra });
export const setPlain = (rs) => (rs.length ? `{${rs.map((r) => r.plain()).join(', ')}}` : '無解');

/** 配方步驟 */
export function completingSquareStep(p, v = 'x', name = 'f(x)') {
  const { a, h, k } = vertexOf(p);
  return {
    step: `配方：${name} = ${prettyPoly(p, v)} = ${vertexFormPretty(a, h, k, v)}`,
    reason: a.eq(1)
      ? `把 ${v} 的一次項係數除以 2 再平方，加上再減去，湊成完全平方`
      : `先提出二次項係數 ${a.pretty()}，再把括號內湊成完全平方`,
    expr: `${mathPoly(p, v)} = ${vertexFormMath(a, h, k, v)}`,
    concept: 'quad.completing_square',
    detail: `h = −b/(2a) = −(${p[1].pretty()})/(2 × ${a.pretty()}) = ${h.pretty()}；把 ${v} = ${h.pretty()} 代回原式，得 k = ${k.pretty()}`,
    ask: ask(`配方後寫成 a(${v} − h)² + k，頂點 (h, k) 是多少？`, 'point', `(${h.plain()}, ${k.plain()})`),
  };
}

function linearFactor(r, v) {
  // r = n/d → (d·v − n)，顯示與 mathjs 兩種寫法
  const q = r.toQ();
  const d = q.d;
  const n = q.n;
  const vs = d === 1n ? v : `${d}${v}`;
  const pretty = n === 0n ? v : `(${vs} ${n > 0n ? '−' : '+'} ${n < 0n ? -n : n})`;
  const math = `(${d === 1n ? v : `${d}*${v}`} - (${n}))`;
  return { pretty, math, d };
}

/** 二次式求根的步驟；回傳 { roots, steps, concepts, disc } */
export function rootSteps(p, v = 'x', { showDisc = false } = {}) {
  const [c, b, a] = p;
  const disc = b.mul(b).sub(a.mul(c).mul(4));
  const roots = quadRoots(a, b, c);
  const steps = [];
  const concepts = new Map();
  const poly = prettyPoly(p, v);
  const discStep = {
    step: `計算判別式 D = b² − 4ac = (${b.pretty()})² − 4 × (${a.pretty()}) × (${c.pretty()}) = ${disc.pretty()}`,
    reason: 'D > 0 有兩相異實根，D = 0 有重根，D < 0 沒有實根',
    expr: `(${b.plain()})^2 - 4*${a.toMath()}*${c.toMath()} = ${disc.plain()}`,
    concept: 'quad.discriminant',
    detail: `a = ${a.pretty()}、b = ${b.pretty()}、c = ${c.pretty()}；b² = ${b.mul(b).pretty()}，4ac = ${a.mul(c).mul(4).pretty()}，相減得 ${disc.pretty()}`,
    ask: ask('判別式 D = b² − 4ac 是多少？', 'number', disc.plain()),
  };
  const rational = roots.length && roots.every((r) => r.isRational());
  if (showDisc || !rational) {
    steps.push(discStep);
    concepts.set('quad.discriminant', '用判別式判斷有幾個實根');
  }
  if (!roots.length) return { roots, steps, concepts, disc };

  if (rational) {
    const fs = roots.map((r) => linearFactor(r, v));
    const lead = a.div(new Q(fs.reduce((m, f) => m * f.d, 1n) ** (roots.length === 1 ? 2n : 1n)));
    const leadStr = lead.eq(1) ? '' : lead.eq(-1) ? '−' : lead.pretty();
    const body = roots.length === 1 ? `${fs[0].pretty}²` : `${fs[0].pretty}${fs[1].pretty}`;
    const bodyMath = roots.length === 1 ? `${fs[0].math}^2` : `${fs[0].math}*${fs[1].math}`;
    steps.push({
      step: `因式分解：${poly} = ${leadStr}${body}`,
      reason: '找兩數使乘積與和符合係數（十字交乘），可直接看出根',
      expr: `${mathPoly(p, v)} = ${lead.toMath()}*${bodyMath}`,
      concept: 'base.factoring',
      detail: a.eq(1)
        ? `要找兩個數：相乘等於 ${c.pretty()}、相加等於 ${b.pretty()}，就是 ${(roots.length === 1 ? [roots[0], roots[0]] : roots).map((r) => r.toQ().neg().pretty()).join(' 和 ')}`
        : `十字交乘：把 ${a.pretty()}${v}² 和 ${c.pretty()} 各拆成兩數相乘，交叉相乘再相加要等於 ${b.pretty()}${v}`,
    });
    concepts.set('base.factoring', '把二次式分解成一次因式的乘積');
    steps.push({
      step: roots.length === 1 ? `重根 ${v} = ${roots[0].pretty()}` : `兩根為 ${v} = ${roots[0].pretty()} 或 ${v} = ${roots[1].pretty()}`,
      reason: '乘積為 0 時，至少有一個因式為 0',
      expr: `${subst(p, roots[0].toQ(), v)} = 0`,
      concept: 'base.factoring',
      detail: `令每個因式等於 0：${fs.map((f, i) => `${f.pretty} = 0 → ${v} = ${roots[i].pretty()}`).join('；')}`,
      ask: ask(`這個方程式的${roots.length === 1 ? '根' : '兩個根'}是多少？`, 'set', setPlain(roots)),
    });
  } else {
    steps.push({
      step: `用公式解 ${v} = (−b ± √D) / (2a)，得 ${v} = ${roots[0].pretty()} 或 ${v} = ${roots[1].pretty()}`,
      reason: 'D 不是完全平方數，無法用整數因式分解，改用公式解',
      expr: `${a.toMath()}*${roots[1].toMath()}^2 + ${b.toMath()}*${roots[1].toMath()} + ${c.toMath()} = 0`,
      concept: 'quad.discriminant',
      detail: `${v} = (−(${b.pretty()}) ± √${disc.pretty()}) / (2 × ${a.pretty()})，再把根號化簡`,
      ask: ask('用公式解，兩個根是多少？（可以用 √ 表示）', 'set', setPlain(roots)),
    });
    concepts.set('quad.forms', '用兩根表示二次式');
  }
  return { roots, steps, concepts, disc };
}

/** 把係數化成互質整數、領導係數為正以外的倍數（不改正負） */
function primitive(p) {
  const ints = toIntCoeffs(p);
  const g = ints.reduce((x, y) => gcd(x, y), 0n) || 1n;
  return ints.map((n) => new Q(n / g));
}

/**
 * 解多項式不等式 p(v) rel 0，p 最多二次。
 * 回傳 { set, steps, concepts }
 */
export function solveIneq(p, rel, v = 'x') {
  const steps = [];
  const concepts = new Map();
  const d = deg(p);
  if (d <= 0) {
    const c = p[0] || new Q(0n);
    const ok = holds(c.sign(), rel);
    steps.push({ step: `化簡後是常數：${c.pretty()} ${REL_PRETTY[rel]} 0 ${ok ? '成立' : '不成立'}`, reason: '沒有變數，直接判斷', expr: '' });
    return { set: ok ? ALL() : [], steps, concepts };
  }
  if (d === 1) {
    const [c, b] = p;
    const r = c.neg().div(b);
    const rr = b.sign() < 0 ? FLIP[rel] : rel;
    steps.push({
      step: `移項後除以 ${b.pretty()}：${v} ${REL_PRETTY[rr]} ${r.pretty()}`,
      reason: b.sign() < 0 ? '除以負數，不等號要反向' : '除以正數，不等號方向不變',
      expr: `${b.toMath()}*${r.toMath()} + ${c.toMath()} = 0`,
      concept: 'base.linear_ineq',
    });
    concepts.set('base.linear_ineq', '一次不等式移項求解');
    const set = { '<': [iv(NEG_INF, r)], '<=': [iv(NEG_INF, r, false, true)], '>': [iv(r, POS_INF)], '>=': [iv(r, POS_INF, true)] }[rr];
    return { set, steps, concepts };
  }
  if (d !== 2) throw new EngineError('目前只支援二次以內的不等式');

  let q = p;
  let rr = rel;
  if (q[2].sign() < 0) {
    q = uscale(q, -1);
    rr = FLIP[rel];
    steps.push({
      step: `兩邊同乘以 −1：${prettyPoly(q, v)} ${REL_PRETTY[rr]} 0`,
      reason: '讓二次項係數變成正的比較好判斷；乘以負數時不等號要反向',
      expr: '',
      concept: 'base.linear_ineq',
      detail: '每一項都變號，不等號也要反過來，例如 > 變成 <',
    });
  }
  const prim = primitive(q);
  if (!prim[2].eq(q[2])) {
    const f = prim[2].div(q[2]);
    const how = f.cmp(1) < 0 && new Q(1n).div(f).isInt() ? `同除以 ${new Q(1n).div(f).pretty()}` : `同乘以 ${f.pretty()}`;
    steps.push({
      step: `兩邊${how}：${prettyPoly(prim, v)} ${REL_PRETTY[rr]} 0`,
      reason: '乘除正數不改變不等號方向，係數變簡單比較好分解',
      expr: '',
    });
    q = prim;
  }
  const rs = rootSteps(q, v);
  steps.push(...rs.steps);
  rs.concepts.forEach((why, id) => concepts.set(id, why));
  const roots = rs.roots;
  let set;
  if (roots.length === 2) {
    steps.push({
      step: `二次項係數為正，拋物線開口向上：在兩根 ${roots[0].pretty()} 與 ${roots[1].pretty()} 之間，值小於 0；在兩根外側，值大於 0`,
      reason: '開口向上的拋物線只有在兩根之間會落在橫軸下方',
      expr: '',
      concept: 'qineq.graph_method',
      detail: `可以取數字驗證：兩根之間取一個數代入會得到負數，兩根外側取一個數代入會得到正數`,
    });
    const [r1, r2] = roots;
    set = {
      '<': [iv(r1, r2)],
      '<=': [iv(r1, r2, true, true)],
      '>': [iv(NEG_INF, r1), iv(r2, POS_INF)],
      '>=': [iv(NEG_INF, r1, false, true), iv(r2, POS_INF, true)],
    }[rr];
    if (rs.concepts.has('base.factoring')) concepts.set('qineq.factored', '分解後依兩根把數線分段判斷正負');
  } else if (roots.length === 1) {
    const r = roots[0];
    steps.push({
      step: `完全平方一定 ≥ 0，只有在 ${v} = ${r.pretty()} 時等於 0`,
      reason: '任何實數的平方都不會是負的',
      expr: '',
    });
    set = { '>': [iv(NEG_INF, r), iv(r, POS_INF)], '>=': ALL(), '<': [], '<=': point(r) }[rr];
  } else {
    steps.push({
      step: '判別式小於 0 且開口向上：拋物線整個在橫軸上方，對所有實數值都大於 0',
      reason: '沒有實根代表圖形不會碰到橫軸',
      expr: '',
    });
    set = rr === '>' || rr === '>=' ? ALL() : [];
    concepts.set('qineq.always_true', '判別式小於 0 時二次式恆正或恆負');
  }
  concepts.set('qineq.graph_method', '用拋物線與橫軸的位置判斷正負');
  steps.push({
    step: `所以解為：${describeSet(set, v)}`,
    reason: '取出符合不等號方向的部分',
    expr: '',
    concept: 'base.interval_notation',
    ask: ask(`${prettyPoly(q, v)} ${REL_PRETTY[rr]} 0 的解是什麼範圍？`, 'interval', formatSet(set, v)),
  });
  return { set, steps, concepts };
}

/** 組合成四階段輸出 */
export function buildResult({ problem, explicit, implicit, concepts, steps, diagram = null, answer, check, uncertain = [] }) {
  const cs = [];
  const seen = new Set();
  for (const [id, why] of concepts) {
    if (seen.has(id)) continue;
    seen.add(id);
    cs.push({ id, why });
  }
  return { problem, knowns: { explicit, implicit }, concepts: cs, extension: steps, diagram, answer, check, uncertain };
}

const round = (x) => Math.round(x * 100) / 100;

/** 依關鍵 x 值決定函數圖形的顯示範圍 */
export function graphBox(p, xs) {
  const vals = xs.filter(Number.isFinite);
  let lo = Math.min(...vals) - 2;
  let hi = Math.max(...vals) + 2;
  if (hi - lo < 6) [lo, hi] = [(lo + hi) / 2 - 3, (lo + hi) / 2 + 3];
  const ys = [0];
  for (let i = 0; i <= 40; i++) {
    const x = lo + ((hi - lo) * i) / 40;
    ys.push(p.reduceRight((acc, c) => acc * x + c.value(), 0));
  }
  let ylo = Math.min(...ys);
  let yhi = Math.max(...ys);
  const pad = Math.max(1, (yhi - ylo) * 0.1);
  return { x: [Math.floor(lo), Math.ceil(hi)], y: [round(ylo - pad), round(yhi + pad)] };
}

export const numLabel = (n) => n.pretty();
export { Q, Surd, MPoly };
