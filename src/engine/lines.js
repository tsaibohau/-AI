// 直線與坐標幾何：全部用精確分數計算；點的坐標可以含參數（例如 D(2, a)）
import { Q, Surd, squareFactor } from './num.js';
import { EngineError, MPoly, parseText, symbolsOf, toMPoly } from './poly.js';
import { normalizeProblem } from './parse.js';

const MINUS = '−';
const prep = (t) => normalizeProblem(String(t)).replace(/\s+/g, '');

// ---------- 多變數多項式的顯示 ----------

// 參數寫在前面、x y 在後面，例如 ay、2kx
function monoText(vars, exps) {
  const order = vars.map((v, i) => i).sort((i, j) => (['x', 'y'].includes(vars[i]) ? 1 : 0) - (['x', 'y'].includes(vars[j]) ? 1 : 0));
  return order
    .map((i) => (exps[i] === 0 ? '' : exps[i] === 1 ? vars[i] : `${vars[i]}${exps[i] === 2 ? '²' : exps[i] === 3 ? '³' : `^${exps[i]}`}`))
    .join('');
}

/** 係數有共同分母時寫成 (分子)/分母，例如 (a + 1)/2 */
export function mpFrac(m) {
  const L = [...m.terms.values()].reduce((l, q) => (l * q.d) / gcdBig(l, q.d), 1n);
  if (L === 1n) return mpPretty(m);
  const top = m.scale(new Q(L));
  const t = mpPretty(top);
  return `${top.terms.size > 1 ? `(${t})` : t}/${L}`;
}

/** 分數式 num/den 的顯示：分母領頭係數為負時上下同乘 −1 */
function fracText(num, den) {
  const lead = [...den.terms.values()][0];
  if (lead && lead.sign() < 0) [num, den] = [num.neg(), den.neg()];
  const wrap = (m) => (m.terms.size > 1 ? `(${mpPretty(m)})` : mpPretty(m));
  return `${wrap(num)}/${wrap(den)}`;
}

/** MPoly → 好讀的文字，例如 2x + 3y − 9、(a + 1)/2 */
export function mpPretty(m) {
  const terms = [...m.terms].map(([k, q]) => ({ e: k.split(',').map(Number), q }));
  if (!terms.length) return '0';
  terms.sort((a, b) => {
    const da = a.e.reduce((s, x) => s + x, 0);
    const db = b.e.reduce((s, x) => s + x, 0);
    if (!da !== !db) return da ? -1 : 1; // 常數放最後
    for (let i = 0; i < a.e.length; i++) if (a.e[i] !== b.e[i]) return b.e[i] - a.e[i];
    return 0;
  });
  let out = '';
  terms.forEach(({ e, q }, i) => {
    const mono = monoText(m.vars, e);
    const a = q.abs();
    let coef = mono && a.eq(1) ? '' : a.pretty();
    if (mono && !a.isInt()) coef = `(${coef})`;
    const t = coef + mono;
    if (i === 0) out = q.sign() < 0 ? `${MINUS}${t}` : t;
    else out += ` ${q.sign() < 0 ? MINUS : '+'} ${t}`;
  });
  return out;
}

/** MPoly → mathjs 語法 */
export function mpMath(m) {
  const terms = [...m.terms].map(([k, q]) => {
    const e = k.split(',').map(Number);
    const mono = m.vars.map((v, i) => (e[i] === 0 ? '' : e[i] === 1 ? v : `${v}^${e[i]}`)).filter(Boolean).join('*');
    return mono ? `(${q.plain()})*${mono}` : `(${q.plain()})`;
  });
  return terms.length ? terms.join(' + ') : '0';
}

// ---------- 點 ----------

/** 解析點：'(2, a)'、[2, 'a']、{ x: 2, y: 'a' } */
export function parsePoint(p) {
  let xs, ys;
  if (Array.isArray(p)) [xs, ys] = p.map(String);
  else if (p && typeof p === 'object') [xs, ys] = [String(p.x), String(p.y)];
  else {
    const t = prep(p).replace(/^[A-Za-z]\w*(?=\()/, '');
    const m = t.match(/^\((.+),(.+)\)$/);
    if (!m) throw new EngineError(`看不懂點的寫法「${p}」，請寫成 (2, 1)`);
    [xs, ys] = [m[1], m[2]];
  }
  const nx = parseText(prep(xs));
  const ny = parseText(prep(ys));
  const params = [...new Set([...symbolsOf(nx), ...symbolsOf(ny)])].filter((s) => !['pi', 'e'].includes(s));
  return { x: toMPoly(nx, params), y: toMPoly(ny, params), params };
}

const isNum = (pt) => pt.x.isConstant() && pt.y.isConstant();
const qx = (pt) => pt.x.constantValue();
const qy = (pt) => pt.y.constantValue();
export const pointText = (pt) => `(${mpPretty(pt.x)}, ${mpPretty(pt.y)})`;
const qPoint = (x, y) => `(${x.pretty()}, ${y.pretty()})`;

function lift(m, vars) {
  // 把只含參數的多項式搬到含 x、y 的變數表
  const out = new Map();
  for (const [k, q] of m.terms) {
    const e = k ? k.split(',').map(Number) : [];
    const full = vars.map((v) => (m.vars.includes(v) ? e[m.vars.indexOf(v)] : 0));
    out.set(full.join(','), q);
  }
  return new MPoly(vars, out);
}

// ---------- 直線：Ax + By + C = 0 ----------

/** 數字直線，A、B、C 化成互質整數，A > 0（或 A = 0 且 B > 0） */
function normLine(A, B, C) {
  if (A.isZero() && B.isZero()) throw new EngineError('這不是一條直線');
  const L = [A, B, C].reduce((l, q) => (l * q.d) / gcdBig(l, q.d), 1n);
  let ints = [A, B, C].map((q) => (q.n * L) / q.d);
  const g = ints.reduce((x, y) => gcdBig(x, y), 0n) || 1n;
  ints = ints.map((n) => n / g);
  if (ints[0] < 0n || (ints[0] === 0n && ints[1] < 0n)) ints = ints.map((n) => -n);
  const [a, b, c] = ints.map((n) => new Q(n));
  return { kind: 'line', A: a, B: b, C: c };
}
function gcdBig(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

/** 解析直線方程式文字（例如 2x + 3y = 9、y = −3x + 12、x = 2）；可含參數 */
export function parseLine(text) {
  const t = prep(text);
  const parts = t.split('=');
  if (parts.length !== 2) throw new EngineError(`看不懂直線「${text}」，請寫成 2x + 3y + 9 = 0 或 y = 2x + 1`);
  const node = parseText(`(${parts[0]})-(${parts[1]})`);
  const params = symbolsOf(node).filter((s) => !['x', 'y', 'pi', 'e'].includes(s));
  const vars = ['x', 'y', ...params];
  const m = toMPoly(node, vars);
  if (m.degreeIn('x') > 1 || m.degreeIn('y') > 1) throw new EngineError('這不是直線（x 或 y 的次方大於 1）');
  const A = new Map();
  const B = new Map();
  const C = new Map();
  for (const [k, q] of m.terms) {
    const e = k.split(',').map(Number);
    if (e[0] && e[1]) throw new EngineError('這不是直線（有 xy 項）');
    const rest = e.slice(2).join(',');
    const target = e[0] ? A : e[1] ? B : C;
    target.set(rest, (target.get(rest) || new Q(0n)).add(q));
  }
  const mk = (mp) => new MPoly(params, new Map([...mp].filter(([, q]) => !q.isZero()).map(([k, q]) => [params.length ? k : '', q])));
  const a = mk(A);
  const b = mk(B);
  const c = mk(C);
  if (!params.length) return normLine(a.constantValue(), b.constantValue(), c.constantValue());
  return { kind: 'pline', A: a, B: b, C: c, params };
}

const asLine = (l) => (typeof l === 'string' ? parseLine(l) : l);
function numLine(l, what = '這個計算') {
  const L = asLine(l);
  if (L.kind !== 'line') throw new EngineError(`${what}需要數字直線；直線含參數 ${L.params.join('、')}，請先求出參數`);
  return L;
}
function numPoint(p, what = '這個計算') {
  const P = typeof p === 'string' || Array.isArray(p) || !p.x?.terms ? parsePoint(p) : p;
  if (!isNum(P)) throw new EngineError(`${what}需要數字坐標；點含參數 ${P.params.join('、')}，請先求出參數`);
  return P;
}

const termText = (q, v, first) => {
  if (q.isZero()) return '';
  const a = q.abs();
  const coef = v && a.eq(1) ? '' : a.pretty();
  const t = `${coef}${v}`;
  return first ? (q.sign() < 0 ? `${MINUS}${t}` : t) : ` ${q.sign() < 0 ? MINUS : '+'} ${t}`;
};

/** 直線的各種寫法與資訊 */
export function lineInfo(l) {
  const L = asLine(l);
  if (L.kind === 'pline') {
    const vars = ['x', 'y', ...L.params];
    const full = lift(L.A, vars).mul(MPoly.variable(vars, 'x')).add(lift(L.B, vars).mul(MPoly.variable(vars, 'y'))).add(lift(L.C, vars));
    const slope = L.B.isConstant()
      ? L.B.constantValue().isZero()
        ? '沒有斜率（鉛直線）'
        : mpFrac(L.A.scale(new Q(-1n).div(L.B.constantValue())))
      : fracText(L.A.neg(), L.B);
    return { equation: `${mpPretty(full)} = 0`, slope, note: `含參數 ${L.params.join('、')}` };
  }
  const { A, B, C } = L;
  let eq = '';
  for (const [q, v] of [[A, 'x'], [B, 'y'], [C, '']]) eq += termText(q, v, !eq);
  const info = { equation: `${eq} = 0`, A: A.plain(), B: B.plain(), C: C.plain() };
  if (B.isZero()) {
    info.slope = '沒有斜率（鉛直線）';
    info.form = `x = ${C.neg().div(A).pretty()}`;
    info.xIntercept = C.neg().div(A).pretty();
  } else {
    const m = A.neg().div(B);
    const k = C.neg().div(B);
    info.slope = m.pretty();
    const mx = m.isZero() ? '' : `${m.eq(1) ? '' : m.eq(-1) ? MINUS : m.isInt() ? m.pretty() : `(${m.pretty()})`}x`;
    info.form = `y = ${mx}${mx ? (k.isZero() ? '' : ` ${k.sign() < 0 ? MINUS : '+'} ${k.abs().pretty()}`) : k.pretty()}`;
    info.yIntercept = k.pretty();
    if (!A.isZero()) info.xIntercept = C.neg().div(A).pretty();
  }
  return info;
}

// ---------- 直線的建立 ----------

/** 兩點斜率；可含參數，例如 C(0, −1)、D(2, a) → (a + 1)/2 */
export function slopeBetween(p, q) {
  const P = parsePoint(p);
  const R = parsePoint(q);
  const params = [...new Set([...P.params, ...R.params])];
  const up = (pt) => ({ x: lift(pt.x, params), y: lift(pt.y, params) });
  const a = up(P);
  const b = up(R);
  const dy = b.y.sub(a.y);
  const dx = b.x.sub(a.x);
  if (dx.isConstant()) {
    if (dx.constantValue().isZero()) return { slope: '沒有斜率（鉛直線）', vertical: true };
    const s = dy.scale(new Q(1n).div(dx.constantValue()));
    return { slope: mpFrac(s), math: mpMath(s) };
  }
  return { slope: fracText(dy, dx), math: `(${mpMath(dy)})/(${mpMath(dx)})` };
}

/** 通過兩點的直線（可含參數） */
export function lineThrough(p, q) {
  const P = parsePoint(p);
  const R = parsePoint(q);
  if (isNum(P) && isNum(R)) {
    const [x1, y1, x2, y2] = [qx(P), qy(P), qx(R), qy(R)];
    if (x1.eq(x2) && y1.eq(y2)) throw new EngineError('兩點重合，無法決定直線');
    // (y2 − y1)(x − x1) − (x2 − x1)(y − y1) = 0
    const A = y2.sub(y1);
    const B = x1.sub(x2);
    const C = x2.sub(x1).mul(y1).sub(y2.sub(y1).mul(x1));
    return normLine(A, B, C);
  }
  const params = [...new Set([...P.params, ...R.params])];
  const vars = ['x', 'y', ...params];
  const X = MPoly.variable(vars, 'x');
  const Y = MPoly.variable(vars, 'y');
  const [x1, y1, x2, y2] = [P.x, P.y, R.x, R.y].map((m) => lift(m, vars));
  const eq = y2.sub(y1).mul(X.sub(x1)).sub(x2.sub(x1).mul(Y.sub(y1)));
  return parseLine(`${mpMath(eq)} = 0`);
}

/** 通過一點、斜率 m 的直線；m 可以是 'vertical' 代表鉛直線 */
export function linePointSlope(p, m) {
  const P = numPoint(p, '點斜式');
  if (m === 'vertical' || m === '∞') return normLine(new Q(1n), new Q(0n), qx(P).neg());
  const node = parseText(prep(m));
  if (symbolsOf(node).length) throw new EngineError('斜率含參數，請先求出參數');
  const s = toMPoly(node, []).constantValue();
  // y − y1 = m(x − x1) → m x − y + (y1 − m x1) = 0
  return normLine(s, new Q(-1n), qy(P).sub(s.mul(qx(P))));
}

export function parallelThrough(l, p) {
  const L = numLine(l, '平行線');
  const P = numPoint(p, '平行線');
  return normLine(L.A, L.B, L.A.mul(qx(P)).add(L.B.mul(qy(P))).neg());
}

export function perpendicularThrough(l, p) {
  const L = numLine(l, '垂直線');
  const P = numPoint(p, '垂直線');
  // 法向量 (A, B) 變成方向向量：B x − A y + C' = 0
  return normLine(L.B, L.A.neg(), L.B.mul(qx(P)).sub(L.A.mul(qy(P))).neg());
}

export function midpoint(p, q) {
  const P = numPoint(p, '中點');
  const R = numPoint(q, '中點');
  const x = qx(P).add(qx(R)).div(2);
  const y = qy(P).add(qy(R)).div(2);
  return { x, y, text: qPoint(x, y) };
}

/** 線段 PQ 的中垂線 */
export function perpendicularBisector(p, q) {
  const P = numPoint(p, '中垂線');
  const R = numPoint(q, '中垂線');
  const M = midpoint(P, R);
  const dx = qx(R).sub(qx(P));
  const dy = qy(R).sub(qy(P));
  if (dx.isZero() && dy.isZero()) throw new EngineError('兩點重合，沒有中垂線');
  // 法向量就是 PQ 方向：dx·x + dy·y − (dx·Mx + dy·My) = 0
  return { line: normLine(dx, dy, dx.mul(M.x).add(dy.mul(M.y)).neg()), midpoint: M.text };
}

/** 兩直線交點 */
export function intersect(l1, l2) {
  const a = numLine(l1, '求交點');
  const b = numLine(l2, '求交點');
  const det = a.A.mul(b.B).sub(a.B.mul(b.A));
  if (det.isZero()) {
    const same = a.A.mul(b.C).sub(a.C.mul(b.A)).isZero() && a.B.mul(b.C).sub(a.C.mul(b.B)).isZero();
    return { relation: same ? '重合' : '平行', point: null };
  }
  const x = a.B.mul(b.C).sub(b.B.mul(a.C)).div(det);
  const y = b.A.mul(a.C).sub(a.A.mul(b.C)).div(det);
  return { relation: '相交', x, y, point: qPoint(x, y) };
}

/** √(有理數) 的精確值 */
function sqrtQ(q) {
  if (q.sign() < 0) throw new EngineError('負數不能開平方');
  const [s, r] = squareFactor(q.n * q.d);
  return new Surd(0n, s, r, q.d);
}

export function distance(p, q) {
  const P = numPoint(p, '距離');
  const R = numPoint(q, '距離');
  const d2 = qx(R).sub(qx(P)).pow(2).add(qy(R).sub(qy(P)).pow(2));
  const d = sqrtQ(d2);
  return { value: d, text: d.pretty(), squared: d2.pretty() };
}

export function pointLineDistance(p, l) {
  const P = numPoint(p, '點到直線距離');
  const L = numLine(l, '點到直線距離');
  const num = L.A.mul(qx(P)).add(L.B.mul(qy(P))).add(L.C).abs();
  const den2 = L.A.pow(2).add(L.B.pow(2));
  // |Ax0 + By0 + C| / √(A² + B²) = √(num² / den2)
  const d = sqrtQ(num.pow(2).div(den2));
  return { value: d, text: d.pretty() };
}

/** 多邊形面積（鞋帶公式），點依序排列 */
export function polygonArea(points) {
  const P = points.map((p) => numPoint(p, '面積'));
  if (P.length < 3) throw new EngineError('至少要三個點');
  let s = new Q(0n);
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    s = s.add(qx(a).mul(qy(b)).sub(qx(b).mul(qy(a))));
  }
  const area = s.abs().div(2);
  return { value: area, text: area.pretty() };
}

/** 直線平移：往右 dx、往上 dy（往左、往下用負數）。把 x 換成 x − dx、y 換成 y − dy */
export function translateLine(l, dx, dy) {
  const L = numLine(l, '平移');
  const qdx = toMPoly(parseText(prep(dx)), []).constantValue();
  const qdy = toMPoly(parseText(prep(dy)), []).constantValue();
  return normLine(L.A, L.B, L.C.sub(L.A.mul(qdx)).sub(L.B.mul(qdy)));
}

/** 三角形的外心（到三頂點等距）與重心 */
export function triangleCenters(a, b, c) {
  const [A, B, C] = [a, b, c].map((p) => numPoint(p, '三角形'));
  const b1 = perpendicularBisector(A, B).line;
  const b2 = perpendicularBisector(B, C).line;
  const o = intersect(b1, b2);
  if (!o.point) throw new EngineError('三點共線，不是三角形');
  const gx = qx(A).add(qx(B)).add(qx(C)).div(3);
  const gy = qy(A).add(qy(B)).add(qy(C)).div(3);
  return { circumcenter: o.point, cx: o.x, cy: o.y, centroid: qPoint(gx, gy), bisectorAB: lineInfo(b1).equation, bisectorBC: lineInfo(b2).equation };
}

export { qx, qy, isNum, normLine };
