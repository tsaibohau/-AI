// 把浮點數還原成精確形式：整數、分數、二次根式、對數；都不像就保留近似值
import { Q, Surd } from '../num.js';

const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const subscript = (n) => String(n).replace(/\d/g, (d) => SUB[d]);

/** c·log_b(arg)，arg 為正有理數，b 為大於 0 且不等於 1 的整數或 e */
export class LogNum {
  constructor(b, arg, coef = new Q(1n)) {
    this.b = b; // 數字（10、2、Math.E）
    this.arg = arg; // Q
    this.coef = coef; // Q
  }
  value() { return this.coef.value() * (Math.log(this.arg.value()) / Math.log(this.b)); }
  argPretty() { return this.arg.isInt() ? this.arg.pretty() : `(${this.arg.pretty()})`; }
  pretty() {
    const name = this.b === 10 ? 'log ' : this.b === Math.E ? 'ln ' : `log${subscript(this.b)} `;
    const c = this.coef.eq(1) ? '' : this.coef.eq(-1) ? '−' : `${this.coef.pretty()} `;
    return `${c}${name}${this.argPretty()}`;
  }
  plain() {
    const inner = this.b === Math.E ? `log(${this.arg.plain()})` : `log(${this.arg.plain()}, ${this.b})`;
    return this.coef.eq(1) ? inner : `${this.coef.plain()}*${inner}`;
  }
  toMath() { return `(${this.plain()})`; }
}

/** 立方根 c·∛m */
export class CubeRoot {
  constructor(m, coef = new Q(1n)) { this.m = m; this.coef = coef; }
  value() { return this.coef.value() * Math.cbrt(this.m.value()); }
  pretty() {
    const c = this.coef.eq(1) ? '' : this.coef.eq(-1) ? '−' : this.coef.pretty();
    return `${c}∛${this.m.isInt() ? this.m.pretty() : `(${this.m.pretty()})`}`;
  }
  plain() { return `${this.coef.eq(1) ? '' : `${this.coef.plain()}*`}cbrt(${this.m.plain()})`; }
  toMath() { return `(${this.plain()})`; }
}

/** 無法化簡的近似值 */
export class Approx {
  constructor(v) { this.v = v; this.approx = true; }
  value() { return this.v; }
  pretty() { return `≈ ${fmt(this.v)}`; }
  plain() { return fmt(this.v); }
  toMath() { return `(${fmt(this.v)})`; }
}

export const fmt = (v) => String(Number(v.toPrecision(10)));

function rational(v, tol, maxDen = 1000) {
  // 連分數逼近
  let h0 = 1, h1 = 0, k0 = 0, k1 = 1;
  let x = v;
  for (let i = 0; i < 30; i++) {
    const a = Math.floor(x);
    [h0, h1] = [a * h0 + h1, h0];
    [k0, k1] = [a * k0 + k1, k0];
    if (k0 > maxDen) break;
    if (Math.abs(v - h0 / k0) <= tol * Math.max(1, Math.abs(v))) return new Q(BigInt(h0), BigInt(k0));
    const f = x - a;
    if (f < 1e-15) break;
    x = 1 / f;
  }
  return null;
}

const SQUAREFREE = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22, 23, 26, 29, 30];

/** 嘗試還原；tol 是相對誤差容許值 */
export function identify(v, tol = 1e-9) {
  if (!Number.isFinite(v)) return null;
  if (Math.abs(v) < 1e-12) return new Q(0n);
  const q = rational(v, tol);
  if (q) return q;
  for (let d = 1; d <= 12; d++) {
    for (let b = 1; b <= 12; b++) {
      for (const r of SQUAREFREE) {
        for (const s of [1, -1]) {
          const a = v * d - s * b * Math.sqrt(r);
          const ai = Math.round(a);
          if (Math.abs(a - ai) <= tol * d * Math.max(1, Math.abs(v))) return new Surd(BigInt(ai), BigInt(s * b), BigInt(r), BigInt(d));
        }
      }
    }
  }
  const cube = rational(v ** 3, tol * 10, 50);
  if (cube && !rational(Math.cbrt(Math.abs(cube.value())), 1e-12, 50)) return new CubeRoot(cube.sign() < 0 ? cube.neg() : cube, new Q(cube.sign() < 0 ? -1n : 1n));
  for (const base of [2, 3, 5, 10, 7]) {
    const c = rational(base ** v, tol * 10, 200);
    if (c && c.sign() > 0 && !c.eq(1)) return new LogNum(base, c);
  }
  return new Approx(v);
}

/** log_b(x) 的精確形式：x 是 b 的整數次方就回傳整數 */
export function logOf(b, x) {
  const v = x.value();
  if (!(v > 0)) return null;
  const k = Math.log(v) / Math.log(b);
  const kr = Math.round(k);
  if (Math.abs(k - kr) < 1e-12) return new Q(BigInt(kr));
  if (x instanceof Q) {
    const rq = rational(k, 1e-12, 12);
    if (rq && Math.abs(b ** rq.value() - v) < 1e-12 * Math.max(1, v)) return rq;
    return new LogNum(b, x);
  }
  if (x instanceof Surd && x.isRational()) return logOf(b, x.toQ());
  return identify(k);
}

export { subscript };
