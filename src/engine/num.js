// 精確數值：有理數 Q 與二次根式 Surd，以及正負無窮。
// 每種數都提供 value()（浮點近似）、pretty()（給學生看）、toMath()（mathjs 語法，可嵌入算式）。

const abs = (a) => (a < 0n ? -a : a);
export const gcd = (a, b) => {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};
export const lcm = (a, b) => (a === 0n || b === 0n ? 0n : abs(a * b) / gcd(a, b));
const MINUS = '−';

export class Q {
  constructor(n, d = 1n) {
    n = BigInt(n);
    d = BigInt(d);
    if (d === 0n) throw new Error('除以零');
    if (d < 0n) [n, d] = [-n, -d];
    const g = gcd(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
  }
  static of(x) {
    if (x instanceof Q) return x;
    if (typeof x === 'bigint') return new Q(x);
    if (Number.isInteger(x)) return new Q(BigInt(x));
    return Q.parse(String(x));
  }
  /** 解析整數或小數字串（含科學記號）為精確有理數 */
  static parse(s) {
    const m = String(s).trim().match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
    if (!m || (!m[2] && !m[3])) throw new Error(`無法解析數字：${s}`);
    const frac = m[3] || '';
    let n = BigInt((m[2] || '0') + frac);
    let d = 10n ** BigInt(frac.length);
    const e = Number(m[4] || 0);
    if (e > 0) n *= 10n ** BigInt(e);
    if (e < 0) d *= 10n ** BigInt(-e);
    return new Q(m[1] === '-' ? -n : n, d);
  }
  add(o) { o = Q.of(o); return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = Q.of(o); return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = Q.of(o); return new Q(this.n * o.n, this.d * o.d); }
  div(o) { o = Q.of(o); if (o.n === 0n) throw new Error('除以零'); return new Q(this.n * o.d, this.d * o.n); }
  neg() { return new Q(-this.n, this.d); }
  abs() { return new Q(abs(this.n), this.d); }
  pow(k) { let r = new Q(1n); for (let i = 0; i < k; i++) r = r.mul(this); return r; }
  sign() { return this.n > 0n ? 1 : this.n < 0n ? -1 : 0; }
  isZero() { return this.n === 0n; }
  isInt() { return this.d === 1n; }
  cmp(o) { return this.sub(o).sign(); }
  eq(o) { return this.cmp(o) === 0; }
  value() { return Number(this.n) / Number(this.d); }
  pretty() {
    const s = this.n < 0n ? MINUS : '';
    const a = abs(this.n);
    return this.d === 1n ? `${s}${a}` : `${s}${a}/${this.d}`;
  }
  /** 給 answer 用的純 ASCII 形式，例如 -1/2 */
  plain() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`; }
  toMath() {
    if (this.d === 1n && this.n >= 0n) return `${this.n}`;
    return `(${this.plain()})`;
  }
}

/** 化簡 n = s² · r（r 無平方因子），n ≥ 0 */
export function squareFactor(n) {
  let s = 1n;
  let r = n;
  for (let p = 2n; p * p <= r; p++) {
    while (r % (p * p) === 0n) {
      r /= p * p;
      s *= p;
    }
  }
  return [s, r];
}

/** (P + Qc·√r) / D，皆為整數，r 無平方因子 */
export class Surd {
  constructor(P, Qc, r, D) {
    [P, Qc, r, D] = [P, Qc, r, D].map(BigInt);
    if (D === 0n) throw new Error('除以零');
    if (r === 0n) Qc = 0n;
    if (r === 1n) [P, Qc] = [P + Qc, 0n];
    if (Qc === 0n) r = 1n;
    if (D < 0n) [P, Qc, D] = [-P, -Qc, -D];
    const g = gcd(gcd(P, Qc), D) || 1n;
    Object.assign(this, { P: P / g, Qc: Qc / g, r, D: D / g });
  }
  isRational() { return this.Qc === 0n; }
  toQ() { return new Q(this.P, this.D); }
  value() { return (Number(this.P) + Number(this.Qc) * Math.sqrt(Number(this.r))) / Number(this.D); }
  pretty() {
    if (this.isRational()) return this.toQ().pretty();
    const q = abs(this.Qc);
    const rad = `${q === 1n ? '' : q}√${this.r}`;
    let num;
    if (this.P === 0n) num = `${this.Qc < 0n ? MINUS : ''}${rad}`;
    else num = `${this.P < 0n ? MINUS : ''}${abs(this.P)} ${this.Qc < 0n ? MINUS : '+'} ${rad}`;
    if (this.D === 1n) return num;
    return this.P === 0n ? `${num}/${this.D}` : `(${num})/${this.D}`;
  }
  plain() {
    if (this.isRational()) return this.toQ().plain();
    const q = abs(this.Qc);
    const rad = `${q === 1n ? '' : `${q}*`}sqrt(${this.r})`;
    const sgn = this.Qc < 0n ? '-' : '+';
    const num = this.P === 0n ? `${sgn === '-' ? '-' : ''}${rad}` : `${this.P} ${sgn} ${rad}`;
    return this.D === 1n ? num : `(${num})/${this.D}`;
  }
  toMath() { return this.isRational() ? this.toQ().toMath() : `(${this.plain()})`; }
}

export const NEG_INF = { inf: -1, value: () => -Infinity, pretty: () => `${MINUS}∞`, plain: () => '-inf', toMath: () => '(-Infinity)' };
export const POS_INF = { inf: 1, value: () => Infinity, pretty: () => '∞', plain: () => 'inf', toMath: () => 'Infinity' };

/** 把有理數係數的二次式 a x² + b x + c 變成整數係數 [A, B, C]（同號比例） */
export function toIntCoeffs(qs) {
  const L = qs.reduce((l, q) => lcm(l, q.d), 1n);
  return qs.map((q) => (q.n * L) / q.d);
}

/** a x² + b x + c = 0 的實根（由小到大），無實根回傳 [] */
export function quadRoots(a, b, c) {
  let [A, B, C] = toIntCoeffs([a, b, c]);
  const disc = B * B - 4n * A * C;
  if (disc < 0n) return [];
  const [s, r] = squareFactor(disc);
  const roots = [new Surd(-B, -s, r, 2n * A), new Surd(-B, s, r, 2n * A)];
  roots.sort((x, y) => x.value() - y.value());
  return disc === 0n ? [roots[0]] : roots;
}
