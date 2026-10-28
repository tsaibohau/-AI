// 語法樹工具：安全的浮點求值、轉成 mathjs 語法、轉成給學生看的寫法、找出定義域條件
// 台灣高中慣例：log x 是以 10 為底，ln x 是自然對數。
import { EngineError } from '../poly.js';

const LOG_BASE = /^log_(\d+(?:\.\d+)?)$/;
const SUBS = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '.': '.' };
const sub = (s) => String(s).replace(/[\d.]/g, (d) => SUBS[d]);

function baseText(b) {
  for (let d = 2; d <= 20; d++) if (Math.abs(b * d - Math.round(b * d)) < 1e-12) return `${Math.round(b * d)}/${d}`;
  return String(b);
}

/** 回傳 { kind: 'log', base, arg } 或 null；base 是數字或語法樹 */
export function logInfo(n) {
  if (n.type !== 'FunctionNode') return null;
  const name = n.fn.name;
  const m = name.match(LOG_BASE);
  if (m) return { base: Number(m[1]), arg: n.args[0] };
  if (name === 'log2') return { base: 2, arg: n.args[0] };
  if (name === 'log10') return { base: 10, arg: n.args[0] };
  if (name === 'ln') return { base: Math.E, arg: n.args[0] };
  if (name === 'log' && n.args.length === 1) return { base: 10, arg: n.args[0] };
  if (name === 'log' && n.args.length === 2) {
    // 常數底數直接算成數字，例如 log(x, 1/2)
    const b = n.args[1];
    let constant = true;
    b.traverse((m) => {
      if (m.type === 'SymbolNode' && !['pi', 'e'].includes(m.name)) constant = false;
    });
    return { base: constant ? compile(b)({}) : b, arg: n.args[0] };
  }
  return null;
}

export function containsVar(node, x) {
  let found = false;
  node.traverse((n, path, parent) => {
    if (n.type === 'SymbolNode' && n.name === x && !(parent?.type === 'FunctionNode' && path === 'fn')) found = true;
  });
  return found;
}

/** 編譯成浮點函式；定義域外回傳 NaN */
export function compile(node) {
  const rec = (n) => {
    switch (n.type) {
      case 'ConstantNode': {
        const v = Number(n.value);
        return () => v;
      }
      case 'SymbolNode':
        if (n.name === 'pi') return () => Math.PI;
        if (n.name === 'e') return () => Math.E;
        return (s) => (n.name in s ? s[n.name] : NaN);
      case 'ParenthesisNode':
        return rec(n.content);
      case 'OperatorNode': {
        const f = n.args.map(rec);
        switch (n.fn) {
          case 'unaryMinus': return (s) => -f[0](s);
          case 'unaryPlus': return (s) => f[0](s);
          case 'add': return (s) => f[0](s) + f[1](s);
          case 'subtract': return (s) => f[0](s) - f[1](s);
          case 'multiply': return (s) => f[0](s) * f[1](s);
          case 'divide': return (s) => { const d = f[1](s); return d === 0 ? NaN : f[0](s) / d; };
          case 'pow':
            return (s) => {
              const a = f[0](s);
              const b = f[1](s);
              if (a < 0 && !Number.isInteger(b)) {
                // 負數的奇數分之一次方，例如 (−8)^(1/3)
                const inv = 1 / b;
                if (Number.isInteger(Math.round(inv)) && Math.abs(inv - Math.round(inv)) < 1e-12 && Math.round(inv) % 2) return -((-a) ** b);
                return NaN;
              }
              if (a === 0 && b < 0) return NaN;
              return a ** b;
            };
          default:
            throw new EngineError(`不支援的運算 ${n.op}`);
        }
      }
      case 'FunctionNode': {
        const li = logInfo(n);
        if (li) {
          const fa = rec(li.arg);
          const fb = typeof li.base === 'number' ? () => li.base : rec(li.base);
          return (s) => {
            const a = fa(s);
            const b = fb(s);
            if (!(a > 0) || !(b > 0) || b === 1) return NaN;
            return Math.log(a) / Math.log(b);
          };
        }
        const fs = n.args.map(rec);
        const g = {
          sqrt: (a) => (a < 0 ? NaN : Math.sqrt(a)),
          cbrt: Math.cbrt,
          abs: Math.abs,
          exp: Math.exp,
          sin: Math.sin,
          cos: Math.cos,
          // tan 在 90° 附近沒有定義
          tan: (a) => (Math.abs(Math.cos(a)) < 1e-12 ? NaN : Math.tan(a)),
          asin: (a) => (Math.abs(a) > 1 ? NaN : Math.asin(a)),
          acos: (a) => (Math.abs(a) > 1 ? NaN : Math.acos(a)),
          atan: Math.atan,
        }[n.fn.name];
        if (!g || fs.length !== 1) throw new EngineError(`不支援的函數 ${n.fn.name}`);
        return (s) => g(fs[0](s));
      }
      default:
        throw new EngineError('算式中有無法處理的部分');
    }
  };
  return rec(node);
}

/** 轉成 mathjs 可計算的字串；subst 可把變數換成數值字串 */
export function toMath(node, subst = {}) {
  const rec = (n) => {
    switch (n.type) {
      case 'ConstantNode': return String(n.value);
      case 'SymbolNode': return n.name in subst ? `(${subst[n.name]})` : n.name;
      case 'ParenthesisNode': return `(${rec(n.content)})`;
      case 'OperatorNode':
        if (n.args.length === 1) return `(${n.fn === 'unaryMinus' ? '-' : '+'}${rec(n.args[0])})`;
        return `(${rec(n.args[0])} ${n.op} ${rec(n.args[1])})`;
      case 'FunctionNode': {
        const li = logInfo(n);
        if (li) {
          if (li.base === Math.E) return `log(${rec(li.arg)})`;
          const b = typeof li.base === 'number' ? String(li.base) : rec(li.base);
          return `log(${rec(li.arg)}, ${b})`;
        }
        return `${n.fn.name}(${n.args.map(rec).join(', ')})`;
      }
      default: throw new EngineError('算式中有無法處理的部分');
    }
  };
  return rec(node);
}

const PREC = { add: 1, subtract: 1, multiply: 2, divide: 2, unaryMinus: 3, unaryPlus: 3, pow: 4 };
const prec = (n) => (n.type === 'ParenthesisNode' ? prec(n.content) : n.type === 'OperatorNode' ? PREC[n.fn] : 5);
const strip = (n) => (n.type === 'ParenthesisNode' ? strip(n.content) : n);
const isNum = (n) => strip(n).type === 'ConstantNode';
const SUP = { 2: '²', 3: '³' };

/** 給學生看的寫法，例如 log₂(x − 1)、4ˣ 寫成 4^x、2x² */
export function pretty(node, subst = {}) {
  const wrap = (n, need) => (prec(n) < need ? `(${rec(n)})` : rec(n));
  const rec = (n0) => {
    const n = strip(n0);
    switch (n.type) {
      case 'ConstantNode': return String(n.value);
      case 'SymbolNode':
        if (n.name in subst) return `(${subst[n.name]})`;
        return n.name === 'pi' ? 'π' : n.name;
      case 'OperatorNode': {
        const [a, b] = n.args;
        switch (n.fn) {
          case 'unaryMinus': return `−${wrap(a, 3)}`;
          case 'unaryPlus': return rec(a);
          case 'add': {
            const r = wrap(b, 1);
            return r.startsWith('−') ? `${rec(a)} − ${r.slice(1)}` : `${rec(a)} + ${r}`;
          }
          case 'subtract': {
            // a − (−b) 寫成 a + b
            const r = wrap(b, 2);
            return r.startsWith('−') && prec(b) >= 2 ? `${rec(a)} + ${r.slice(1)}` : `${rec(a)} − ${r}`;
          }
          case 'multiply': {
            const l = wrap(a, 2);
            const r = wrap(b, 3);
            const implicit = isNum(a) && !isNum(b) && !(b.name in subst) && !r.startsWith('−') && !/^\d/.test(r);
            return implicit ? `${l}${r}` : `${l} · ${r}`;
          }
          case 'divide': return `${wrap(a, 3)}/${wrap(b, 5)}`;
          case 'pow': {
            const base = wrap(a, 5);
            const e = strip(b);
            if (e.type === 'ConstantNode' && SUP[e.value]) return `${base}${SUP[e.value]}`;
            const ex = e.type === 'ConstantNode' || e.type === 'SymbolNode' ? rec(e) : `(${rec(e)})`;
            return `${base}^${ex}`;
          }
          default: return n.toString();
        }
      }
      case 'FunctionNode': {
        const li = logInfo(n);
        if (li) {
          const arg = `(${rec(li.arg)})`;
          if (li.base === 10) return `log${arg}`;
          if (li.base === Math.E) return `ln${arg}`;
          if (typeof li.base === 'number') return Number.isInteger(li.base) ? `log${sub(li.base)}${arg}` : `log_(${baseText(li.base)})${arg}`;
          return `log_(${rec(li.base)})${arg}`;
        }
        if (n.fn.name === 'sqrt') return `√(${rec(n.args[0])})`;
        return `${n.fn.name}(${n.args.map(rec).join(', ')})`;
      }
      default: return n.toString();
    }
  };
  return rec(node);
}

/**
 * 定義域條件（只列含變數的部分）
 * 回傳 [{ kind: 'pos' | 'nonneg' | 'nonzero' | 'base', node, text }]
 */
export function domainConditions(node, x) {
  const out = [];
  const seen = new Set();
  const add = (kind, n, text) => {
    if (seen.has(text)) return;
    seen.add(text);
    out.push({ kind, node: n, text });
  };
  node.traverse((n) => {
    const li = logInfo(n);
    if (li) {
      if (containsVar(li.arg, x)) add('pos', li.arg, `${pretty(li.arg)} > 0（真數要大於 0）`);
      if (typeof li.base !== 'number' && containsVar(li.base, x)) add('base', li.base, `${pretty(li.base)} > 0 且 ≠ 1（底數條件）`);
    } else if (n.type === 'FunctionNode' && n.fn.name === 'sqrt' && containsVar(n.args[0], x)) {
      add('nonneg', n.args[0], `${pretty(n.args[0])} ≥ 0（根號內不可為負）`);
    } else if (n.type === 'OperatorNode' && n.fn === 'divide' && containsVar(n.args[1], x)) {
      add('nonzero', n.args[1], `${pretty(n.args[1])} ≠ 0（分母不可為 0）`);
    }
  });
  return out;
}

/** 算式特徵：用來猜觀念與策略 */
export function features(node, x) {
  const f = { log: false, logVar: false, expVar: false, sqrtVar: false, fracVar: false, logCount: 0 };
  node.traverse((n) => {
    const li = logInfo(n);
    if (li) {
      f.log = true;
      f.logCount++;
      if (x && containsVar(n, x)) f.logVar = true;
    }
    if (x && n.type === 'OperatorNode' && n.fn === 'pow' && containsVar(n.args[1], x)) f.expVar = true;
    if (x && n.type === 'FunctionNode' && n.fn.name === 'sqrt' && containsVar(n, x)) f.sqrtVar = true;
    if (x && n.type === 'OperatorNode' && n.fn === 'divide' && containsVar(n.args[1], x)) f.fracVar = true;
  });
  return f;
}
