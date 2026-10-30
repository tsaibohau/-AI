// AI 可以呼叫的工具：全部用解題引擎精確計算。AI 只負責規劃與解釋，數字一律以工具結果為準。
import { solve } from '../engine/index.js';
import { normalizeProblem } from '../engine/parse.js';
import { EngineError, MPoly, parseText, symbolsOf, toMPoly } from '../engine/poly.js';
import { compile } from '../engine/general/ast.js';
import { identify } from '../engine/general/identify.js';
import { Q } from '../engine/num.js';
import * as L from '../engine/lines.js';
import { toolGraphSpec } from '../engine/tools.js';
import { validateDiagram, describeDiagram } from '../core/diagram.js';
import { explainConcept, allDefinitions } from '../core/definitions.js';

const str = (description) => ({ type: 'string', description });
const strArr = (description) => ({ type: 'array', items: { type: 'string' }, description });

function exact(v) {
  if (!Number.isFinite(v)) return { exact: '沒有定義或不是實數' };
  const id = identify(v);
  return id && !id.approx ? { exact: id.pretty(), approx: Number(v.toPrecision(10)) } : { approx: Number(v.toPrecision(10)) };
}

/** 線性方程組（精確解） */
function solveLinearSystem(equations, variables) {
  const nodes = equations.map((e) => {
    const t = normalizeProblem(e).replace(/\s+/g, '');
    const parts = t.split('=');
    if (parts.length !== 2) throw new EngineError(`方程式「${e}」要有一個等號`);
    return parseText(`(${parts[0]})-(${parts[1]})`);
  });
  const vars = variables?.length ? variables : [...new Set(nodes.flatMap(symbolsOf))].filter((s) => !['pi', 'e'].includes(s)).sort();
  if (vars.length > 6) throw new EngineError('未知數太多');
  const rows = nodes.map((n, i) => {
    const m = toMPoly(n, vars);
    const row = vars.map(() => new Q(0n));
    let c = new Q(0n);
    for (const [k, q] of m.terms) {
      const e = k.split(',').map(Number);
      const deg = e.reduce((s, x) => s + x, 0);
      if (deg > 1) throw new EngineError(`第 ${i + 1} 個方程式不是一次式，請改用 solve 工具`);
      const j = e.indexOf(1);
      if (j < 0) c = c.add(q);
      else row[j] = row[j].add(q);
    }
    return [...row, c.neg()];
  });
  // 高斯消去
  const n = vars.length;
  let r = 0;
  const pivots = [];
  for (let col = 0; col < n && r < rows.length; col++) {
    const p = rows.findIndex((row, i) => i >= r && !row[col].isZero());
    if (p < 0) continue;
    [rows[r], rows[p]] = [rows[p], rows[r]];
    const piv = rows[r][col];
    rows[r] = rows[r].map((x) => x.div(piv));
    for (let i = 0; i < rows.length; i++) {
      if (i === r || rows[i][col].isZero()) continue;
      const f = rows[i][col];
      rows[i] = rows[i].map((x, j) => x.sub(f.mul(rows[r][j])));
    }
    pivots.push(col);
    r++;
  }
  if (rows.some((row) => row.slice(0, n).every((x) => x.isZero()) && !row[n].isZero())) return { result: '無解（方程式互相矛盾）' };
  if (pivots.length < n) return { result: '有無限多組解（條件不足）', variables: vars };
  const sol = {};
  pivots.forEach((col, i) => (sol[vars[col]] = rows[i][n].pretty()));
  return { result: '唯一解', solution: sol };
}

/** 直線參數：可以是方程式文字 */
const lineArg = (t) => L.parseLine(t);

export const TOOLS = [
  {
    name: 'calculate',
    description: '計算一個沒有未知數的算式，回傳精確值（分數、根號、對數）與近似值；有等號（例如 1+1=2）時回答兩邊相不相等。支援 sqrt、log(真數, 底)、log 是以 10 為底、ln、sin/cos/tan（角度寫 72°）、abs、π。',
    parameters: { type: 'object', properties: { expression: str('算式，例如 (3*1.5-5)/2、tan(72°)、log(8, 2)') }, required: ['expression'] },
    run: ({ expression }) => {
      const value = (text) => {
        const node = parseText(normalizeProblem(text).replace(/\s+/g, ''));
        const left = symbolsOf(node).filter((s) => !['pi', 'e'].includes(s));
        if (left.length) throw new EngineError(`算式含未知數 ${left.join('、')}，請改用 solve 或 solve_linear_system`);
        return exact(compile(node)({}));
      };
      // 學生打「1+1=2」這種沒有未知數的等式：兩邊各算一次，回答對不對
      const sides = String(expression).split(/(?<![<>!≤≥])=(?!=)/);
      if (sides.length === 2) {
        const [a, b] = sides.map(value);
        const same = a.exact === b.exact || Math.abs(a.approx - b.approx) < 1e-9 * Math.max(1, Math.abs(a.approx));
        return { left: a.exact, right: b.exact, correct: same };
      }
      return value(expression);
    },
  },
  {
    name: 'solve',
    description: '解一個未知數的方程式或不等式（未知數可以是 x、a、k、m 等任何字母），或求一個函數的最大最小值。也可以直接丟整句題目（例如「求 f(x)=2x²−8x+3 的最小值」）。回傳答案與解題步驟。',
    parameters: { type: 'object', properties: { problem: str('方程式、不等式或題目文字，例如 (a+1)/2 < 4、(1/2)*abs((3m+8)^2/m) = 6') }, required: ['problem'] },
    run: ({ problem }) => {
      const r = solve(problem);
      if (!r.ok) return { error: r.reason };
      return {
        answer: r.data.answer,
        steps: r.data.extension.map((s) => s.step),
        check: r.data.check,
        ...(r.data.uncertain.length ? { note: r.data.uncertain } : {}),
      };
    },
    teach: true,
  },
  {
    name: 'solve_linear_system',
    description: '解一次聯立方程組（精確解），例如 2 + 3b + c = 0 與 3b = −9。',
    parameters: {
      type: 'object',
      properties: { equations: strArr('每個元素是一個方程式'), variables: strArr('未知數，可省略') },
      required: ['equations'],
    },
    run: ({ equations, variables }) => solveLinearSystem(equations, variables),
  },
  {
    name: 'slope',
    description: '求兩點的斜率。坐標可以含參數，例如 (0,−1) 與 (2,a) 的斜率是 (a + 1)/2。',
    parameters: { type: 'object', properties: { p1: str('第一點，例如 (2,1)'), p2: str('第二點，例如 (2,a)') }, required: ['p1', 'p2'] },
    run: ({ p1, p2 }) => {
      const s = L.slopeBetween(p1, p2);
      return { slope: s.slope };
    },
  },
  {
    name: 'line',
    description: '建立或分析一條直線，回傳一般式、斜截式、斜率、x 截距、y 截距。mode：two_points（兩點）、point_slope（一點與斜率）、equation（分析已知方程式，可含參數）。',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['two_points', 'point_slope', 'equation'] },
        p1: str('two_points 的第一點，或 point_slope 的點'),
        p2: str('two_points 的第二點'),
        slope: str('point_slope 的斜率；鉛直線寫 vertical'),
        equation: str('equation 模式的直線方程式，例如 2x − 3y − 6 = 0'),
      },
      required: ['mode'],
    },
    run: ({ mode, p1, p2, slope, equation }) => {
      if (mode === 'two_points') return L.lineInfo(L.lineThrough(p1, p2));
      if (mode === 'point_slope') return L.lineInfo(L.linePointSlope(p1, slope));
      return L.lineInfo(equation);
    },
  },
  {
    name: 'line_relation',
    description: '求通過某點、且和已知直線平行或垂直的直線。',
    parameters: {
      type: 'object',
      properties: { line: str('已知直線方程式'), point: str('通過的點'), relation: { type: 'string', enum: ['parallel', 'perpendicular'] } },
      required: ['line', 'point', 'relation'],
    },
    run: ({ line, point, relation }) => L.lineInfo(relation === 'parallel' ? L.parallelThrough(lineArg(line), point) : L.perpendicularThrough(lineArg(line), point)),
  },
  {
    name: 'perpendicular_bisector',
    description: '求線段的中垂線（到兩端點等距離的所有點）。',
    parameters: { type: 'object', properties: { p1: str('端點一'), p2: str('端點二') }, required: ['p1', 'p2'] },
    run: ({ p1, p2 }) => {
      const r = L.perpendicularBisector(p1, p2);
      return { midpoint: r.midpoint, ...L.lineInfo(r.line) };
    },
  },
  {
    name: 'intersect',
    description: '求兩直線的交點，或判斷平行、重合。',
    parameters: { type: 'object', properties: { line1: str('直線一'), line2: str('直線二') }, required: ['line1', 'line2'] },
    run: ({ line1, line2 }) => {
      const r = L.intersect(line1, line2);
      return r.point ? { relation: r.relation, point: r.point } : { relation: r.relation };
    },
  },
  {
    name: 'measure',
    description: '量測：distance（兩點距離）、midpoint（中點）、point_line_distance（點到直線距離，points 放一點並給 line）、area（多邊形面積，points 依順序列出頂點）。',
    parameters: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['distance', 'midpoint', 'point_line_distance', 'area'] }, points: strArr('點，例如 ["(1,-1)", "(3,7)"]'), line: str('point_line_distance 用的直線') },
      required: ['kind', 'points'],
    },
    run: ({ kind, points, line }) => {
      if (kind === 'distance') return { distance: L.distance(points[0], points[1]).text };
      if (kind === 'midpoint') return { midpoint: L.midpoint(points[0], points[1]).text };
      if (kind === 'point_line_distance') return { distance: L.pointLineDistance(points[0], line).text };
      return { area: L.polygonArea(points).text };
    },
  },
  {
    name: 'translate_line',
    description: '把直線平移：往右 right 單位、往上 up 單位（往左、往下用負數）。注意：若題目給的是「平移後」的直線，要求原直線，就反方向平移。',
    parameters: { type: 'object', properties: { line: str('直線方程式'), right: str('往右的量'), up: str('往上的量') }, required: ['line', 'right', 'up'] },
    run: ({ line, right, up }) => L.lineInfo(L.translateLine(line, right, up)),
  },
  {
    name: 'triangle_centers',
    description: '求三角形的外心（到三個頂點等距離，是兩條中垂線的交點）與重心。',
    parameters: { type: 'object', properties: { a: str('頂點 A'), b: str('頂點 B'), c: str('頂點 C') }, required: ['a', 'b', 'c'] },
    run: ({ a, b, c }) => {
      const r = L.triangleCenters(a, b, c);
      return { circumcenter: r.circumcenter, centroid: r.centroid, bisectorAB: r.bisectorAB, bisectorBC: r.bisectorBC };
    },
  },
  {
    name: 'concept',
    description: '查一個數學觀念：是定義（不用證明）還是導出（附推導）、淺白比喻、從哪些更基本的觀念來。學生問「為什麼」時先查，追問就查 comes_from 裡的觀念。',
    parameters: { type: 'object', properties: { name: str('觀念名稱或學生的問法，例如 加法、負負得正、為什麼不能除以0、中垂線') }, required: ['name'] },
    run: ({ name }) => {
      const r = explainConcept(name);
      if (r) return r;
      return { error: `資料庫裡沒有「${name}」`, known: allDefinitions().map((d) => d.name) };
    },
  },
  {
    name: 'draw',
    description: '在坐標平面上畫圖給學生看（圖解數學）。可以畫點、線段、直線、多邊形、圓、函數圖形。解題時盡量畫圖幫助理解。',
    parameters: {
      type: 'object',
      properties: {
        points: strArr('點，格式「名稱(x,y)」，例如 ["A(9,9)", "B(1,5)"]'),
        segments: strArr('線段，用點的名稱，例如 ["AB", "BC"]'),
        lines: strArr('直線方程式，例如 ["2x + y − 17 = 0"]'),
        polygons: strArr('多邊形，依序寫點的名稱，例如 ["ABC"]'),
        circles: strArr('圓，格式「圓心名稱,通過的點名稱」或「圓心名稱,半徑」，例如 ["O,A"]'),
        functions: strArr('函數，例如 ["x^2 - 3x + 2"]'),
      },
    },
    run: (args) => {
      const spec = buildDrawSpec(args);
      const v = validateDiagram(spec);
      if (!v.ok) return { error: `圖畫不出來：${v.error}` };
      return { ok: true, shown: describeDiagram(v.spec) , __diagram: spec };
    },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** 執行一個工具；錯誤會變成 { error } 回給 AI，不會中斷對話 */
export function runTool(name, args = {}) {
  const t = BY_NAME.get(name);
  if (!t) return { error: `沒有這個工具：${name}` };
  try {
    return t.run(args || {});
  } catch (e) {
    return { error: e instanceof EngineError ? e.message : `工具執行失敗：${e.message}` };
  }
}

/** 給模型看的工具宣告（不含執行函式） */
export const toolDeclarations = () => TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }));

// ---------- 畫圖 ----------

function buildDrawSpec({ points = [], segments = [], lines = [], polygons = [], circles = [], functions = [] }) {
  const els = [];
  const pts = {};
  for (const p of points) {
    const m = String(p).replace(/\s+/g, '').match(/^([A-Za-z][A-Za-z0-9']{0,5})\((.+)\)$/);
    if (!m) throw new EngineError(`點的格式要寫成 A(1,2)：「${p}」`);
    const P = L.parsePoint(`(${m[2]})`);
    if (!L.isNum(P)) throw new EngineError(`點 ${m[1]} 的坐標含參數，請先求出參數再畫`);
    pts[m[1]] = [L.qx(P).value(), L.qy(P).value()];
    els.push({ kind: 'point', id: m[1], x: pts[m[1]][0], y: pts[m[1]][1], label: m[1], stage: 1 });
  }
  const split = (s) => String(s).replace(/\s+/g, '').match(/[A-Z][a-z0-9']*/g) || [];
  for (const s of segments) {
    const [a, b] = split(s);
    els.push({ kind: 'segment', from: a, to: b, stage: 1 });
  }
  for (const s of polygons) els.push({ kind: 'polygon', points: split(s), stage: 1 });
  for (const c of circles) {
    const [center, other] = String(c).split(/[,，]/).map((x) => x.trim());
    els.push(/^[A-Za-z]/.test(other) ? { kind: 'circle', center, through: other, stage: 1 } : { kind: 'circle', center, radius: other, stage: 1 });
  }
  const lineEls = lines.map((eq) => {
    const info = L.lineInfo(eq);
    if (info.A === undefined) throw new EngineError(`直線「${eq}」含參數，請先求出參數再畫`);
    return { kind: 'line', equation: eq, label: info.equation, stage: 1 };
  });
  els.push(...lineEls);
  const fnEls = [];
  for (const f of functions) {
    const g = toolGraphSpec(f);
    if (g.error) throw new EngineError(g.error);
    fnEls.push(g.spec.elements[0]);
  }
  els.push(...fnEls.map((e) => ({ ...e, kind: 'curve' })));
  // 自動決定範圍：包含所有點與直線的截距
  const xs = [0, ...Object.values(pts).map((p) => p[0])];
  const ys = [0, ...Object.values(pts).map((p) => p[1])];
  for (const e of lineEls) {
    const info = L.lineInfo(e.equation);
    if (info.xIntercept) xs.push(Number(compile(parseText(info.xIntercept.replace('−', '-')))({})));
    if (info.yIntercept) ys.push(Number(compile(parseText(info.yIntercept.replace('−', '-')))({})));
  }
  const fin = (a) => a.filter((v) => Number.isFinite(v) && Math.abs(v) < 1000);
  let [x0, x1] = [Math.min(...fin(xs)), Math.max(...fin(xs))];
  let [y0, y1] = [Math.min(...fin(ys)), Math.max(...fin(ys))];
  const span = Math.max(6, x1 - x0, y1 - y0) + 2;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return {
    type: 'geometry',
    x: [Math.floor(cx - span / 2), Math.ceil(cx + span / 2)],
    y: [Math.floor(cy - span / 2), Math.ceil(cy + span / 2)],
    elements: els,
  };
}

export { MPoly };
