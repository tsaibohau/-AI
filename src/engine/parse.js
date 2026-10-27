// 題目文字分析：正規化符號、抓出算式、範圍限制與關鍵字
import { Q } from './num.js';
import { EngineError, parseText, symbolsOf, toMPoly } from './poly.js';

const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

export function normalizeProblem(text) {
  let t = String(text ?? '');
  // 上標與下標要在 NFKC 之前處理，否則 x² 會變成 x2
  t = t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => {
    const s = [...m].map((c) => SUP[c]).join('');
    return s.length > 1 ? `^(${s})` : `^${s}`;
  });
  // log₂8 → log_2 8（加空白，避免和後面的數字黏成 log_28）
  t = t.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (m) => `_${[...m].map((c) => SUB[c]).join('')} `);
  t = t.normalize('NFKC');
  t = t
    .replace(/[−–—﹣]/g, '-')
    .replace(/[≤≦⩽]/g, '<=')
    .replace(/[≥≧⩾]/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/[×·⋅∙]/g, '*')
    .replace(/÷/g, '/')
    .replace(/√\(/g, 'sqrt(')
    .replace(/√(\d+(?:\.\d+)?|[a-zA-Z])/g, 'sqrt($1)')
    // log_2 8 → log_2(8)；log 2 → log(2)；ln x → ln(x)
    .replace(/(log_\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?|[a-zA-Z](?![a-zA-Z(]))/g, '$1($2)')
    .replace(/\b(log|ln)\s+(\d+(?:\.\d+)?|[a-zA-Z](?![a-zA-Z(]))/g, '$1($2)')
    .replace(/(log_\d+(?:\.\d+)?)\s+\(/g, '$1(');
  return fixBaseLogs(t);
}

/** log_(1/2)(x − 1) → log((x − 1), (1/2))：底數用括號寫的對數 */
function fixBaseLogs(t) {
  let i = t.indexOf('log_(');
  while (i >= 0) {
    const b0 = i + 4;
    const b1 = matchParen(t, b0);
    if (b1 < 0 || t[b1 + 1] !== '(') break;
    const a1 = matchParen(t, b1 + 1);
    if (a1 < 0) break;
    const rep = `log(${t.slice(b1 + 2, a1)}, ${t.slice(b0 + 1, b1)})`;
    t = t.slice(0, i) + rep + t.slice(a1 + 1);
    i = t.indexOf('log_(', i + rep.length);
  }
  return t;
}

function matchParen(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '(') d++;
    else if (s[j] === ')' && --d === 0) return j;
  }
  return -1;
}

function splitTopComma(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 把文字中的數學片段抓出來 */
export function extractRuns(norm) {
  const raw = norm.match(/[0-9a-zA-Z_+\-*/^().,=<>!\[\]∈ ]+/g) || [];
  return raw
    .flatMap((r) => splitTopComma(r))
    .map((r) => r.replace(/\s+/g, '').replace(/^[,.]+|[,.]+$/g, ''))
    .filter((r) => /[0-9a-zA-Z]/.test(r));
}

/** 嘗試把字串當成常數（不含變數），回傳 Q 或 null */
function asConstant(s) {
  try {
    const node = parseText(s);
    if (symbolsOf(node).length) return null;
    const p = toMPoly(node, []);
    return p.isConstant() ? p.constantValue() : null;
  } catch {
    return null;
  }
}

const REL = /(<=|>=|!=|<|>|=)/;

export function classifyRun(run) {
  // 範圍限制：1<=x<=4、4>=x>=1、x∈[1,4]
  let m = run.match(/^(.+?)(<=|<)([a-zA-Z])(<=|<)(.+)$/);
  if (m) {
    const lo = asConstant(m[1]);
    const hi = asConstant(m[5]);
    if (lo && hi) return { kind: 'range', var: m[3], lo, hi, loC: m[2] === '<=', hiC: m[4] === '<=' };
  }
  m = run.match(/^(.+?)(>=|>)([a-zA-Z])(>=|>)(.+)$/);
  if (m) {
    const hi = asConstant(m[1]);
    const lo = asConstant(m[5]);
    if (lo && hi) return { kind: 'range', var: m[3], lo, hi, loC: m[4] === '>=', hiC: m[2] === '>=' };
  }
  m = run.match(/^([a-zA-Z])∈([[(])(.+),(.+)([\])])$/);
  if (m) {
    const lo = asConstant(m[3]);
    const hi = asConstant(m[4]);
    if (lo && hi) return { kind: 'range', var: m[1], lo, hi, loC: m[2] === '[', hiC: m[5] === ']' };
  }
  // 單邊範圍：x > 0、x ≤ 3、2 < x
  m = run.match(/^([a-zA-Z])(<=|<|>=|>)(.+)$/);
  if (m) {
    const c = asConstant(m[3]);
    if (c) return m[2].startsWith('<') ? { kind: 'range', var: m[1], lo: null, hi: c, loC: false, hiC: m[2] === '<=' } : { kind: 'range', var: m[1], lo: c, hi: null, loC: m[2] === '>=', hiC: false };
  }
  m = run.match(/^(.+?)(<=|<|>=|>)([a-zA-Z])$/);
  if (m) {
    const c = asConstant(m[1]);
    if (c) return m[2].startsWith('<') ? { kind: 'range', var: m[3], lo: c, hi: null, loC: m[2] === '<=', hiC: false } : { kind: 'range', var: m[3], lo: null, hi: c, loC: false, hiC: m[2] === '>=' };
  }
  // 函數定義：f(x)=…、y=…
  m = run.match(/^(?:([a-zA-Z])\(([a-zA-Z])\)|y)=([^<>=!]+)$/);
  if (m) return { kind: 'def', name: m[1] || 'y', var: m[2] || null, expr: m[3] };
  const parts = run.split(REL);
  if (parts.length === 3 && parts[0] && parts[2]) return { kind: 'rel', lhs: parts[0], op: parts[1], rhs: parts[2] };
  if (parts.length === 1) return { kind: 'expr', expr: run };
  return { kind: 'other', text: run };
}

const KEYWORDS = {
  min: /最小/,
  max: /最大/,
  extreme: /最值|極值/,
  vertex: /頂點/,
  axis: /對稱軸/,
  intersect: /交點|交於/,
  count: /幾個|個數|多少個/,
  root: /根|解方程|方程式的解|方程式.*解/,
  discriminant: /判別式/,
  always: /恆成立|恆正|恆負|恆大於|恆小於|恆為|對(於)?(所有|任意|一切|任何)(的)?實數/,
  solve: /解/,
  range: /範圍|區間/,
};

/** 分析題目，回傳 { norm, runs, main, range, vars, keys, uncertain } */
export function analyze(text) {
  const norm = normalizeProblem(text);
  const runs = extractRuns(norm).map(classifyRun);
  const keys = Object.fromEntries(Object.entries(KEYWORDS).map(([k, re]) => [k, re.test(norm)]));
  const uncertain = [];

  const defs = runs.filter((r) => r.kind === 'def');
  const rels = runs.filter((r) => r.kind === 'rel');
  const exprs = runs.filter((r) => r.kind === 'expr' && r.expr.length > 2);
  const ranges = runs.filter((r) => r.kind === 'range');
  const candidates = [...defs, ...rels, ...exprs];
  if (!candidates.length) throw new EngineError('在題目中找不到算式。請用鍵盤輸入算式，例如 x² − 4x + 3');
  const main = candidates[0];
  if (candidates.length > 1) {
    uncertain.push(`題目中有 ${candidates.length} 個算式，系統以「${main.lhs ? `${main.lhs}${main.op}${main.rhs}` : main.expr}」為主，請確認是否正確`);
  }
  for (const o of runs.filter((r) => r.kind === 'other')) uncertain.push(`看不懂「${o.text}」這一段，已略過`);

  // 找出主變數與參數
  const exprText = main.kind === 'rel' ? `(${main.lhs})-(${main.rhs})` : main.expr;
  const node = parseText(exprText);
  const syms = symbolsOf(node).filter((s) => !['pi', 'e'].includes(s));
  const x = main.var || (syms.includes('x') ? 'x' : syms[0]) || null; // 沒有變數：求值題
  const params = syms.filter((s) => s !== x);
  if (params.length > 1) throw new EngineError(`算式中有太多未知數（${syms.join('、')}），目前只支援一個參數`);

  return {
    norm,
    runs,
    main,
    node,
    x,
    param: params[0] || null,
    range: ranges.find((r) => r.var === x) || null,
    keys,
    uncertain,
  };
}

export const ZERO = new Q(0n);

/** 範圍限制的文字，例如 1 ≤ x ≤ 4、x > 0 */
export function rangeText(r) {
  if (r.lo && r.hi) return `${r.lo.pretty()} ${r.loC ? '≤' : '<'} ${r.var} ${r.hiC ? '≤' : '<'} ${r.hi.pretty()}`;
  if (r.lo) return `${r.var} ${r.loC ? '≥' : '>'} ${r.lo.pretty()}`;
  return `${r.var} ${r.hiC ? '≤' : '<'} ${r.hi.pretty()}`;
}
