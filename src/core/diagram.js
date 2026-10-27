// 圖解規格：白名單驗證、整理成渲染器可直接用的格式、純文字退回描述
// 規格不合法時不畫圖，改用 describeDiagram() 的文字，絕不讓畫面崩潰。
import { evalReal } from './math.js';
import { parseText } from '../engine/poly.js';
import { compile, containsVar } from '../engine/general/ast.js';

const MAX_ELEMENTS = 40;
const MAX_ABS = 1e4;
const SIGNS = ['<0', '<=0', '>0', '>=0'];

class SpecError extends Error {}
const fail = (msg) => {
  throw new SpecError(msg);
};

/** 數值欄位：數字或不含變數的 mathjs 算式（例如 "sqrt(2)"） */
function num(v, where, { allowInf = false } = {}) {
  if (allowInf && (v === '-inf' || v === 'inf' || v === -Infinity || v === Infinity)) return v === '-inf' || v === -Infinity ? -Infinity : Infinity;
  let n = typeof v === 'number' ? v : typeof v === 'string' && v.length <= 60 ? evalReal(v) : NaN;
  if (!Number.isFinite(n) || Math.abs(n) > MAX_ABS) fail(`${where} 不是合理的數值`);
  return n;
}

function range(v, where) {
  if (!Array.isArray(v) || v.length !== 2) fail(`${where} 必須是 [最小, 最大]`);
  const a = num(v[0], where);
  const b = num(v[1], where);
  if (!(a < b)) fail(`${where} 的最小值要小於最大值`);
  return [a, b];
}

const stage = (v) => (Number.isInteger(v) && v >= 1 && v <= 4 ? v : 1);
const label = (v) => (typeof v === 'string' ? v.slice(0, 60) : '');

/** 函數算式：只能有變數 x，必須能編譯，並在範圍內至少有一些點有定義 */
function fn(expr, where, xr) {
  if (typeof expr !== 'string' || !expr || expr.length > 300) fail(`${where} 缺少算式`);
  let node;
  try {
    node = parseText(expr);
  } catch {
    fail(`${where} 的算式看不懂`);
  }
  let bad = null;
  node.traverse((n, path, parent) => {
    if (n.type === 'SymbolNode' && !(parent?.type === 'FunctionNode' && path === 'fn') && !['x', 'pi', 'e'].includes(n.name)) bad = n.name;
  });
  if (bad) fail(`${where} 的算式只能用變數 x（出現了 ${bad}）`);
  let f;
  try {
    f = compile(node);
  } catch {
    fail(`${where} 的算式含不支援的函數`);
  }
  let ok = 0;
  for (let i = 0; i <= 20; i++) if (Number.isFinite(f({ x: xr[0] + ((xr[1] - xr[0]) * i) / 20 }))) ok++;
  if (!ok) fail(`${where} 的算式在顯示範圍內都沒有定義`);
  return { expr, hasX: containsVar(node, 'x') };
}

function functionGraph(spec) {
  const x = range(spec.x, 'x 範圍');
  const y = range(spec.y, 'y 範圍');
  const elements = spec.elements.map((e, i) => {
    const w = `第 ${i + 1} 個元素`;
    if (e.kind === 'curve') return { kind: 'curve', ...fn(e.expr, w, x), label: label(e.label), stage: stage(e.stage) };
    if (e.kind === 'point') {
      return { kind: 'point', x: num(e.x, w), y: num(e.y, w), role: ['vertex', 'root', 'intercept', 'other'].includes(e.role) ? e.role : 'other', label: label(e.label), stage: stage(e.stage) };
    }
    if (e.kind === 'shade') {
      if (!SIGNS.includes(e.sign)) fail(`${w} 的 sign 必須是 ${SIGNS.join('、')}`);
      return { kind: 'shade', ...fn(e.expr, w, x), sign: e.sign, stage: stage(e.stage) };
    }
    return fail(`${w} 的種類「${e.kind}」不在函數圖形允許的清單中`);
  });
  return { type: 'function_graph', x, y, elements };
}

function numberLine(spec) {
  const x = range(spec.x, 'x 範圍');
  const elements = spec.elements.map((e, i) => {
    const w = `第 ${i + 1} 個元素`;
    if (e.kind === 'interval') {
      const from = num(e.from, w, { allowInf: true });
      const to = num(e.to, w, { allowInf: true });
      if (!(from <= to)) fail(`${w} 的起點要小於終點`);
      return { kind: 'interval', from, to, closedFrom: Number.isFinite(from) && e.closedFrom === true, closedTo: Number.isFinite(to) && e.closedTo === true, stage: stage(e.stage) };
    }
    if (e.kind === 'point') return { kind: 'point', x: num(e.x, w), closed: e.closed !== false, label: label(e.label), stage: stage(e.stage) };
    return fail(`${w} 的種類「${e.kind}」不在數線允許的清單中`);
  });
  return { type: 'number_line', x, elements };
}

function geometry(spec) {
  const x = range(spec.x, 'x 範圍');
  const y = range(spec.y, 'y 範圍');
  const ids = new Set();
  const pts = spec.elements.filter((e) => e.kind === 'point');
  for (const p of pts) {
    if (typeof p.id !== 'string' || !/^[A-Za-z][A-Za-z0-9']{0,5}$/.test(p.id)) fail('幾何的點要有 id（例如 A、B、P1）');
    if (ids.has(p.id)) fail(`點 ${p.id} 重複了`);
    ids.add(p.id);
  }
  const ref = (id, w) => {
    if (!ids.has(id)) fail(`${w} 用到不存在的點 ${id}`);
    return id;
  };
  const elements = spec.elements.map((e, i) => {
    const w = `第 ${i + 1} 個元素`;
    switch (e.kind) {
      case 'point':
        return { kind: 'point', id: e.id, x: num(e.x, w), y: num(e.y, w), label: label(e.label ?? e.id), stage: stage(e.stage) };
      case 'segment':
        return { kind: 'segment', from: ref(e.from, w), to: ref(e.to, w), label: label(e.label), stage: stage(e.stage) };
      case 'circle': {
        const c = { kind: 'circle', center: ref(e.center, w), label: label(e.label), stage: stage(e.stage) };
        if (e.through !== undefined) c.through = ref(e.through, w);
        else {
          c.radius = num(e.radius, w);
          if (!(c.radius > 0)) fail(`${w} 的半徑要大於 0`);
        }
        return c;
      }
      case 'angle': {
        if (!Array.isArray(e.points) || e.points.length !== 3) fail(`${w} 的 points 要有三個點（中間是頂點）`);
        return { kind: 'angle', points: e.points.map((p) => ref(p, w)), label: label(e.label), stage: stage(e.stage) };
      }
      default:
        return fail(`${w} 的種類「${e.kind}」不在幾何允許的清單中`);
    }
  });
  return { type: 'geometry', x, y, elements };
}

/**
 * 驗證並整理圖解規格。
 * 回傳 { ok: true, spec } 或 { ok: false, error }；null 代表這題沒有圖（ok 為 true、spec 為 null）
 */
export function validateDiagram(spec) {
  if (spec === null || spec === undefined) return { ok: true, spec: null };
  try {
    if (typeof spec !== 'object' || Array.isArray(spec)) fail('圖解規格必須是物件');
    if (!Array.isArray(spec.elements)) fail('缺少 elements');
    if (spec.elements.length > MAX_ELEMENTS) fail(`元素太多（最多 ${MAX_ELEMENTS} 個）`);
    for (const e of spec.elements) if (!e || typeof e !== 'object') fail('元素必須是物件');
    if (spec.type === 'function_graph') return { ok: true, spec: functionGraph(spec) };
    if (spec.type === 'number_line') return { ok: true, spec: numberLine(spec) };
    if (spec.type === 'geometry') return { ok: true, spec: geometry(spec) };
    fail(`不支援的圖解種類「${spec.type}」`);
  } catch (e) {
    if (e instanceof SpecError) return { ok: false, error: e.message };
    return { ok: false, error: '圖解規格有問題' };
  }
}

const fmt = (v) => (v === Infinity ? '∞' : v === -Infinity ? '−∞' : String(Math.round(v * 1000) / 1000).replace('-', '−'));
const SIGN_TEXT = { '<0': '小於 0', '<=0': '小於或等於 0', '>0': '大於 0', '>=0': '大於或等於 0' };
const ROLE = { vertex: '頂點', root: '根（和 x 軸的交點）', intercept: '截距', other: '點' };

/** 純文字描述（圖畫不出來時用）；只描述目前階段看得到的元素 */
export function describeDiagram(spec, visible = () => true) {
  if (!spec) return [];
  const lines = [];
  for (const e of spec.elements.filter(visible)) {
    if (e.kind === 'curve') lines.push(`畫出函數 ${e.label || e.expr} 的圖形`);
    else if (e.kind === 'shade') lines.push(`把函數值${SIGN_TEXT[e.sign]}的 x 範圍標出來`);
    else if (e.kind === 'interval') lines.push(`數線上從 ${fmt(e.from)}${e.closedFrom ? '（含）' : ''} 到 ${fmt(e.to)}${e.closedTo ? '（含）' : ''} 的範圍`);
    else if (e.kind === 'point' && spec.type === 'number_line') lines.push(`數線上的點 ${e.label || fmt(e.x)}${e.closed ? '（實心，包含）' : '（空心，不包含）'}`);
    else if (e.kind === 'point' && spec.type === 'geometry') lines.push(`點 ${e.id}(${fmt(e.x)}, ${fmt(e.y)})`);
    else if (e.kind === 'point') lines.push(e.label && /頂點|根|截距|\(/.test(e.label) ? `標出 ${e.label}` : `${ROLE[e.role]} ${e.label || `(${fmt(e.x)}, ${fmt(e.y)})`}`);
    else if (e.kind === 'segment') lines.push(`線段 ${e.from}${e.to}${e.label ? `，長 ${e.label}` : ''}`);
    else if (e.kind === 'circle') lines.push(`以 ${e.center} 為圓心${e.through ? `、通過 ${e.through}` : `、半徑 ${fmt(e.radius)}`}的圓`);
    else if (e.kind === 'angle') lines.push(`角 ${e.points.join('')}${e.label ? ` = ${e.label}` : ''}`);
  }
  return lines;
}
