// 答案比對：數值、集合、區間、座標點，以數學等價判斷（不是比字串）
import { evalReal } from './math.js';

const EPS = 1e-9;
const near = (a, b) =>
  a === b || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b)));

/** 找到 s[i] 這個左括號對應的右括號位置 */
function matchParen(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '(') d++;
    else if (s[j] === ')' && --d === 0) return j;
  }
  return -1;
}

/** log₂ 3、log 3、ln 2 等寫法轉成 mathjs：log(3, 2)、log(3, 10)、log(2) */
function normalizeLogs(t) {
  t = t
    .replace(/(log_\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?(?:\/\d+)?)/g, '$1($2)')
    .replace(/\b(log|ln)\s+(\d+(?:\.\d+)?(?:\/\d+)?)/g, '$1($2)')
    .replace(/(log_\d+(?:\.\d+)?)\s+\(/g, '$1(');
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const m = t.slice(i).match(/^(log_(\d+(?:\.\d+)?)|log|ln)\(/);
    if (!m || /[a-zA-Z_]/.test(t[i - 1] || '')) {
      out += t[i];
      continue;
    }
    const open = i + m[1].length;
    const close = matchParen(t, open);
    if (close < 0) {
      out += t[i];
      continue;
    }
    const inner = normalizeLogs(t.slice(open + 1, close));
    const hasComma = splitTop(inner, [',']).length > 1;
    if (m[2]) out += `log(${inner}, ${m[2]})`;
    else if (m[1] === 'ln') out += `log(${inner})`;
    else out += hasComma ? `log(${inner})` : `log(${inner}, 10)`;
    i = close;
  }
  return out;
}

export function normalize(s) {
  let t = String(s ?? '');
  // 去掉含中文的全形括號補充說明，例如「（-3 不合）」；「（2，-5）」這種座標保留
  t = t.replace(/（[^）]*[㐀-鿿][^）]*）/g, '');
  t = t.replace(/²/g, '^2').replace(/³/g, '^3');
  t = t.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (m) => `_${[...m].map((c) => c.charCodeAt(0) - 0x2080).join('')} `);
  t = t.normalize('NFKC');
  t = normalizeLogs(t);
  t = t
    .replace(/^\s*(答案|答)\s*[:：]?/, '')
    .replace(/[≤≦]/g, '<=')
    .replace(/[≥≧]/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/[−–—]/g, '-')
    .replace(/∞/g, 'inf')
    .replace(/∪/g, 'U')
    .replace(/或/g, 'or')
    .replace(/π/g, 'pi')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/√\(/g, 'sqrt(')
    .replace(/√(\d+(?:\.\d+)?|[a-z])/gi, 'sqrt($1)')
    .replace(/\s+/g, '')
    .replace(/[。.]$/, '');
  return t;
}

const isEmptyWord = (t) => /^(無解|無實數解|無實根|沒有實數解|空集合|∅|\{\}|empty)$/i.test(t);
const isAllReal = (t) => /^(R|ℝ|所有實數|全體實數|實數|任意實數|\(-inf,\+?inf\))$/.test(t);
const stripCjk = (t) => t.replace(/[㐀-鿿：:]/g, '');

/** 在括號深度 0 的位置切割 */
function splitTop(str, seps) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (depth === 0) {
      const sep = seps.find((s) => str.startsWith(s, i));
      if (sep) {
        out.push(cur);
        cur = '';
        i += sep.length - 1;
        continue;
      }
    }
    cur += ch;
  }
  out.push(cur);
  return out.filter((x) => x !== '');
}

function num(t) {
  if (/^\+?inf(inity)?$/i.test(t)) return Infinity;
  if (/^-inf(inity)?$/i.test(t)) return -Infinity;
  return evalReal(t);
}

const stripVar = (t) => t.replace(/^[a-zA-Z]\w*=/, '');

export function parseNumber(s) {
  const t = stripVar(stripCjk(normalize(s)));
  const v = num(t);
  return Number.isFinite(v) ? v : null;
}

export function parseSet(s) {
  const n = normalize(s);
  if (isEmptyWord(n)) return [];
  let t = stripCjk(n);
  if (/^\{.*\}$/.test(t)) t = t.slice(1, -1);
  const vals = splitTop(t, [',', 'or', ';', '、', 'and']).map((x) => num(stripVar(x)));
  if (!vals.length || vals.some((v) => !Number.isFinite(v))) return null;
  return [...new Set(vals)].sort((a, b) => a - b);
}

export function parsePoint(s) {
  const t = stripVar(stripCjk(normalize(s)));
  const m = t.match(/^\((.*)\)$/);
  if (!m) return null;
  const vals = splitTop(m[1], [',']).map(num);
  if (vals.length < 2 || vals.some((v) => !Number.isFinite(v))) return null;
  return vals;
}

const isVar = (t) => /^[a-zA-Z]$/.test(t);

function parseInequality(piece) {
  if (/^[a-zA-Z]!=/.test(piece)) {
    const v = num(piece.slice(3));
    if (!Number.isFinite(v)) return null;
    return [iv(-Infinity, v, false, false), iv(v, Infinity, false, false)];
  }
  const tok = piece.split(/(<=|>=|<|>)/);
  const le = (op) => op === '<' || op === '<=';
  if (tok.length === 3) {
    const [a, op, b] = tok;
    const closed = op.endsWith('=');
    if (isVar(a)) {
      const v = num(b);
      if (!Number.isFinite(v)) return null;
      return [le(op) ? iv(-Infinity, v, false, closed) : iv(v, Infinity, closed, false)];
    }
    if (isVar(b)) {
      const v = num(a);
      if (!Number.isFinite(v)) return null;
      return [le(op) ? iv(v, Infinity, closed, false) : iv(-Infinity, v, false, closed)];
    }
    return null;
  }
  if (tok.length === 5 && isVar(tok[2])) {
    const [a, op1, , op2, b] = tok;
    if (le(op1) !== le(op2)) return null;
    let lo = num(a), hi = num(b), cl = op1.endsWith('='), ch = op2.endsWith('=');
    if (!le(op1)) [lo, hi, cl, ch] = [hi, lo, ch, cl];
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    return [iv(lo, hi, cl, ch)];
  }
  return null;
}

function iv(lo, hi, loClosed, hiClosed) {
  return { lo, hi, loClosed: Number.isFinite(lo) && loClosed, hiClosed: Number.isFinite(hi) && hiClosed };
}

function mergeIntervals(list) {
  const xs = list
    .filter((x) => x.lo < x.hi || (near(x.lo, x.hi) && x.loClosed && x.hiClosed))
    .sort((a, b) => a.lo - b.lo || (b.loClosed ? 1 : 0) - (a.loClosed ? 1 : 0));
  const out = [];
  for (const x of xs) {
    const last = out[out.length - 1];
    const touches = last && (x.lo < last.hi || (near(x.lo, last.hi) && (x.loClosed || last.hiClosed)));
    if (touches) {
      if (x.hi > last.hi || (near(x.hi, last.hi) && x.hiClosed)) {
        last.hiClosed = near(x.hi, last.hi) ? last.hiClosed || x.hiClosed : x.hiClosed;
        last.hi = Math.max(last.hi, x.hi);
      }
    } else out.push({ ...x });
  }
  return out;
}

/** 解析成區間聯集（已合併）；無法解析回傳 null */
export function parseIntervals(s) {
  const n = normalize(s);
  if (isEmptyWord(n)) return [];
  if (isAllReal(n)) return [iv(-Infinity, Infinity, false, false)];
  const t = stripCjk(n).replace(/^[a-zA-Z]\w*∈/, '');
  const out = [];
  for (const piece of splitTop(t, ['U', 'or', ','])) {
    const m = piece.match(/^([[(])(.*)([\])])$/);
    if (m) {
      const parts = splitTop(m[2], [',']);
      if (parts.length !== 2) return null;
      const lo = num(parts[0]);
      const hi = num(parts[1]);
      if (Number.isNaN(lo) || Number.isNaN(hi)) return null;
      out.push(iv(lo, hi, m[1] === '[', m[3] === ']'));
      continue;
    }
    const eqm = piece.match(/^[a-zA-Z]=(.+)$/) || piece.match(/^\{(.+)\}$/);
    if (eqm) {
      const vals = splitTop(eqm[1], [',']).map(num);
      if (vals.some((v) => !Number.isFinite(v))) return null;
      for (const v of vals) out.push(iv(v, v, true, true));
      continue;
    }
    const r = parseInequality(piece);
    if (!r) return null;
    out.push(...r);
  }
  return mergeIntervals(out);
}

const PARSERS = { number: parseNumber, set: parseSet, interval: parseIntervals, point: parsePoint };

function equalParsed(type, a, b) {
  if (type === 'number') return near(a, b);
  if (a.length !== b.length) return false;
  if (type === 'interval') {
    return a.every(
      (x, i) => near(x.lo, b[i].lo) && near(x.hi, b[i].hi) && x.loClosed === b[i].loClosed && x.hiClosed === b[i].hiClosed,
    );
  }
  return a.every((x, i) => near(x, b[i]));
}

/**
 * gold: { type: 'number' | 'set' | 'interval' | 'point', value: string }
 * 回傳 { ok, reason }
 */
/** 把算式文字整理成可計算的 mathjs 字串；有等號時取「左 − 右」 */
export function exprToMath(s) {
  let t = normalize(s).replace(/^[a-zA-Z]\([a-zA-Z]\)=/, '').replace(/^y=/, '');
  // t(t-1) 這種單一字母後面接括號，當成相乘
  t = t.replace(/(^|[^a-zA-Z])([a-zA-Z])\(/g, '$1$2*(');
  const parts = splitTop(t, ['=']);
  if (parts.length === 2) t = `(${parts[0]})-(${parts[1]})`;
  else if (parts.length > 2) return null;
  return t;
}

/** 隨機代值比較兩個算式；proportional 為 true 時允許差一個非零倍數 */
export function compareExpr(goldStr, studentStr, v = 'x', proportional = false) {
  const g = exprToMath(goldStr);
  const st = exprToMath(studentStr);
  if (!g || !st) return { ok: false, reason: '無法解析', ratio: null };
  const pts = [-2.3, -1.1, 0.4, 1.7, 2.9, 3.6, 0.9];
  let ratio = null;
  let used = 0;
  let allClose = true;
  for (const p of pts) {
    const a = evalReal(g, { [v]: p });
    const b = evalReal(st, { [v]: p });
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    used++;
    if (Math.abs(a - b) > 1e-7 * Math.max(1, Math.abs(a))) allClose = false;
    if (Math.abs(a) > 1e-9) {
      const r = b / a;
      if (ratio === null) ratio = r;
      else if (Math.abs(r - ratio) > 1e-7 * Math.max(1, Math.abs(ratio))) ratio = NaN;
    }
  }
  if (used < 3) return { ok: false, reason: '無法解析', ratio: null };
  if (allClose) return { ok: true, reason: '等價', ratio: 1 };
  const prop = Number.isFinite(ratio) && Math.abs(ratio) > 1e-9;
  if (proportional && prop) return { ok: true, reason: '差一個倍數，等價', ratio };
  return { ok: false, reason: '不等價', ratio: prop ? ratio : null };
}

export function compareAnswer(gold, modelAnswer) {
  if (gold.type === 'expr' || gold.type === 'expr_prop') {
    return compareExpr(gold.value, modelAnswer ?? '', gold.var || 'x', gold.type === 'expr_prop');
  }
  const parse = PARSERS[gold.type];
  if (!parse) throw new Error(`未知的答案類型：${gold.type}`);
  const g = parse(gold.value);
  if (g === null) throw new Error(`標準答案無法解析：${gold.value}`);
  const m = parse(modelAnswer ?? '');
  if (m === null) return { ok: false, reason: '模型答案無法解析' };
  return equalParsed(gold.type, g, m) ? { ok: true, reason: '等價' } : { ok: false, reason: '不等價' };
}
