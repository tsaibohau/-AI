// 答案比對：數值、集合、區間、座標點，以數學等價判斷（不是比字串）
import { evalReal } from './math.js';

const EPS = 1e-9;
const near = (a, b) =>
  a === b || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b)));

export function normalize(s) {
  let t = String(s ?? '');
  // 去掉含中文的全形括號補充說明，例如「（-3 不合）」；「（2，-5）」這種座標保留
  t = t.replace(/（[^）]*[㐀-鿿][^）]*）/g, '');
  t = t.normalize('NFKC');
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

const isEmptyWord = (t) => /^(無解|空集合|∅|\{\}|empty)$/i.test(t);
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
export function compareAnswer(gold, modelAnswer) {
  const parse = PARSERS[gold.type];
  if (!parse) throw new Error(`未知的答案類型：${gold.type}`);
  const g = parse(gold.value);
  if (g === null) throw new Error(`標準答案無法解析：${gold.value}`);
  const m = parse(modelAnswer ?? '');
  if (m === null) return { ok: false, reason: '模型答案無法解析' };
  return equalParsed(gold.type, g, m) ? { ok: true, reason: '等價' } : { ok: false, reason: '不等價' };
}
