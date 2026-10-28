// 多項式：從 mathjs 語法樹建出精確係數，並格式化給學生看或給 mathjs 驗算
import { Q } from './num.js';
import { parseExpr } from '../core/math.js';

export class EngineError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EngineError';
  }
}

// ---------- 單變數多項式：Q 陣列，由常數項開始 ----------
export const trim = (p) => {
  const r = p.slice();
  while (r.length > 1 && r[r.length - 1].isZero()) r.pop();
  return r.length ? r : [new Q(0n)];
};
export const deg = (p) => {
  const t = trim(p);
  return t.length === 1 && t[0].isZero() ? -Infinity : t.length - 1;
};
const at = (p, i) => p[i] || new Q(0n);
export const uadd = (p, q) => trim(Array.from({ length: Math.max(p.length, q.length) }, (_, i) => at(p, i).add(at(q, i))));
export const uscale = (p, k) => trim(p.map((c) => c.mul(k)));
export const usub = (p, q) => uadd(p, uscale(q, -1));
export function umul(p, q) {
  const r = Array.from({ length: p.length + q.length - 1 }, () => new Q(0n));
  p.forEach((a, i) => q.forEach((b, j) => (r[i + j] = r[i + j].add(a.mul(b)))));
  return trim(r);
}
export const ueval = (p, x) => p.reduceRight((acc, c) => acc.mul(x).add(c), new Q(0n));

const SUP = { 2: '²', 3: '³' };
const MINUS = '−';

/** 給學生看的多項式，例如 2x² − 8x + 3 */
export function prettyPoly(p, v = 'x') {
  const t = trim(p);
  const parts = [];
  for (let e = t.length - 1; e >= 0; e--) {
    const c = t[e];
    if (c.isZero()) continue;
    const a = c.abs();
    let coef = a.pretty();
    if (e > 0 && a.eq(1)) coef = '';
    else if (e > 0 && !a.isInt()) coef = `(${coef})`;
    const vs = e === 0 ? '' : e === 1 ? v : `${v}${SUP[e] || `^${e}`}`;
    const term = coef + vs;
    if (!parts.length) parts.push(c.sign() < 0 ? `${MINUS}${term}` : term);
    else parts.push(`${c.sign() < 0 ? MINUS : '+'} ${term}`);
  }
  return parts.length ? parts.join(' ') : '0';
}

/** mathjs 語法的多項式，例如 2*x^2 - 8*x + 3 */
export function mathPoly(p, v = 'x') {
  const t = trim(p);
  const parts = [];
  for (let e = t.length - 1; e >= 0; e--) {
    const c = t[e];
    if (c.isZero()) continue;
    const a = c.abs();
    const vs = e === 0 ? '' : e === 1 ? v : `${v}^${e}`;
    let term;
    if (e === 0) term = a.plain();
    else if (a.eq(1)) term = vs;
    else term = `${a.isInt() ? a.plain() : `(${a.plain()})`}*${vs}`;
    if (!parts.length) parts.push(c.sign() < 0 ? `-${term}` : term);
    else parts.push(`${c.sign() < 0 ? '-' : '+'} ${term}`);
  }
  return parts.length ? parts.join(' ') : '0';
}

// ---------- 多變數多項式（最多兩個變數：主變數與參數） ----------
export class MPoly {
  constructor(vars, terms = new Map()) {
    this.vars = vars;
    this.terms = terms; // key: 指數以逗號連接，value: Q
  }
  static constant(vars, q) {
    const key = vars.map(() => 0).join(',');
    return new MPoly(vars, q.isZero() ? new Map() : new Map([[key, q]]));
  }
  static variable(vars, name) {
    const key = vars.map((v) => (v === name ? 1 : 0)).join(',');
    return new MPoly(vars, new Map([[key, new Q(1n)]]));
  }
  _with(entries) {
    const m = new Map();
    for (const [k, q] of entries) {
      const prev = m.get(k);
      const next = prev ? prev.add(q) : q;
      if (next.isZero()) m.delete(k);
      else m.set(k, next);
    }
    return new MPoly(this.vars, m);
  }
  add(o) { return this._with([...this.terms, ...o.terms]); }
  neg() { return this._with([...this.terms].map(([k, q]) => [k, q.neg()])); }
  sub(o) { return this.add(o.neg()); }
  scale(q) { return this._with([...this.terms].map(([k, c]) => [k, c.mul(q)])); }
  mul(o) {
    const out = [];
    for (const [k1, a] of this.terms) {
      const e1 = k1.split(',').map(Number);
      for (const [k2, b] of o.terms) {
        const e2 = k2.split(',').map(Number);
        out.push([e1.map((x, i) => x + e2[i]).join(','), a.mul(b)]);
      }
    }
    return this._with(out);
  }
  pow(n) {
    let r = MPoly.constant(this.vars, new Q(1n));
    for (let i = 0; i < n; i++) r = r.mul(this);
    return r;
  }
  isConstant() { return [...this.terms.keys()].every((k) => k === '' || k.split(',').every((e) => e === '0')); }
  constantValue() { return this.terms.get(this.vars.map(() => 0).join(',')) || new Q(0n); }
  degreeIn(name) {
    const i = this.vars.indexOf(name);
    let d = -Infinity;
    for (const k of this.terms.keys()) d = Math.max(d, Number(k.split(',')[i]));
    return d;
  }
  /**
   * 依主變數 x 的次方拆開，每個係數是參數的單變數多項式。
   * 回傳陣列 coeffs[e] = 參數多項式（Q 陣列）
   */
  coeffsIn(main, param) {
    const i = this.vars.indexOf(main);
    const j = param ? this.vars.indexOf(param) : -1;
    const dx = Math.max(0, this.degreeIn(main));
    const out = Array.from({ length: dx + 1 }, () => [new Q(0n)]);
    for (const [k, q] of this.terms) {
      const e = k.split(',').map(Number);
      const ep = j >= 0 ? e[j] : 0;
      const arr = out[e[i]];
      while (arr.length <= ep) arr.push(new Q(0n));
      arr[ep] = arr[ep].add(q);
    }
    return out.map(trim);
  }
}

const FUNCS = new Set(['log', 'ln', 'sqrt', 'cbrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'abs', 'log2', 'log10']);

/** 把 2kx 拆成 2k*x、x(x+1) 變成 x*(x+1)，讓 mathjs 照數學習慣解析 */
export function prepExpr(s) {
  return s
    .replace(/[a-zA-Z]+/g, (w) => (FUNCS.has(w) || w === 'pi' ? w : w.split('').join('*')))
    .replace(/(^|[^a-zA-Z])([a-zA-Z])\(/g, '$1$2*(')
    .replace(/\)\(/g, ')*(');
}

export function parseText(s) {
  try {
    return parseExpr(prepExpr(s));
  } catch {
    throw new EngineError(`看不懂算式「${s}」`);
  }
}

export function symbolsOf(node) {
  const names = new Set();
  node.traverse((n, path, parent) => {
    if (n.type === 'SymbolNode' && !(parent && parent.type === 'FunctionNode' && path === 'fn')) names.add(n.name);
  });
  return [...names];
}

/** 語法樹 → MPoly；遇到非多項式（log、根號、變數次方）就丟出 EngineError */
export function toMPoly(node, vars) {
  const rec = (n) => {
    switch (n.type) {
      case 'ConstantNode':
        if (typeof n.value !== 'number') throw new EngineError('算式中有無法處理的常數');
        return MPoly.constant(vars, Q.parse(String(n.value)));
      case 'SymbolNode':
        if (!vars.includes(n.name)) throw new EngineError(`不認得的符號 ${n.name}`);
        return MPoly.variable(vars, n.name);
      case 'ParenthesisNode':
        return rec(n.content);
      case 'OperatorNode': {
        const [a, b] = n.args;
        switch (n.fn) {
          case 'unaryMinus': return rec(a).neg();
          case 'unaryPlus': return rec(a);
          case 'add': return rec(a).add(rec(b));
          case 'subtract': return rec(a).sub(rec(b));
          case 'multiply': return rec(a).mul(rec(b));
          case 'divide': {
            const den = rec(b);
            if (!den.isConstant() || den.constantValue().isZero()) throw new EngineError('分母含變數，不是多項式');
            return rec(a).scale(new Q(1n).div(den.constantValue()));
          }
          case 'pow': {
            const ex = rec(b);
            const v = ex.isConstant() ? ex.constantValue() : null;
            if (!v || !v.isInt() || v.sign() < 0 || v.value() > 10) throw new EngineError('次方不是非負整數，不是多項式');
            return rec(a).pow(Number(v.n));
          }
          default:
            throw new EngineError(`不支援的運算 ${n.op}`);
        }
      }
      default:
        throw new EngineError('算式含函數或特殊符號，不是多項式');
    }
  };
  return rec(node);
}
