// 計算工具箱：讓學生在引導模式下自己動手試（代值、找使算式為 0 的值）
import { normalizeProblem } from './parse.js';
import { parseText, symbolsOf } from './poly.js';
import { compile } from './general/ast.js';
import { findRoots } from './general/numeric.js';
import { identify } from './general/identify.js';
import { pretty, toMath } from './general/ast.js';
import { evaluateDiagram } from './diagrams.js';

function prep(exprText) {
  const t = normalizeProblem(exprText).replace(/\s+/g, '');
  const node = parseText(t);
  const vars = symbolsOf(node).filter((s) => !['pi', 'e'].includes(s));
  if (vars.length > 1) throw new Error(`算式裡有多個變數（${vars.join('、')}），工具箱一次只能處理一個`);
  return { node, v: vars[0] || 'x' };
}

/** 代值計算，回傳文字 */
export function toolEvaluate(exprText, valueText) {
  try {
    const { node, v } = prep(exprText);
    const val = valueText === '' || valueText == null ? NaN : compile(prep(String(valueText)).node)({});
    const r = compile(node)({ [v]: val });
    if (!Number.isFinite(r)) return `${v} = ${valueText} 時算式沒有意義（可能不在定義域內）`;
    const id = identify(r);
    return `${v} = ${valueText} 時，值為 ${id ? id.pretty() : r}`;
  } catch (e) {
    return `看不懂這個算式：${e.message}`;
  }
}

/** 找出使算式等於 0 的值 */
export function toolRoots(exprText) {
  try {
    const { node, v } = prep(exprText);
    const f = compile(node);
    const { roots } = findRoots((t) => f({ [v]: t }));
    if (!roots.length) return `在 −1000 到 1000 之間找不到使算式等於 0 的 ${v}`;
    return `使算式等於 0 的 ${v}：${roots.map((r) => identify(r).pretty()).join('、')}`;
  } catch (e) {
    return `看不懂這個算式：${e.message}`;
  }
}

/** 把一個算式畫成圖解規格；回傳 { spec } 或 { error } */
export function toolGraphSpec(exprText) {
  try {
    // 方程式或不等式：畫「左邊 − 右邊」
    const t = normalizeProblem(exprText).replace(/\s+/g, '');
    const m = t.match(/^(.+?)(<=|>=|!=|=|<|>)(.+)$/);
    const { node, v } = prep(m ? `(${m[1]})-(${m[3]})` : exprText);
    const f = compile(node);
    const has = symbolsOf(node).some((s) => !['pi', 'e'].includes(s));
    if (!has) return { spec: evaluateDiagram(node, f({})) };
    const g = (x) => f({ [v]: x });
    const { roots } = findRoots(g);
    const near = roots.filter((r) => Math.abs(r) <= 50);
    // 有根時以根為中心，沒有根時看原點附近
    const c0 = near.length ? Math.min(...near) : 0;
    const c1 = near.length ? Math.max(...near) : 0;
    const half = Math.max(4, (c1 - c0) / 2 + 3);
    const mid = (c0 + c1) / 2;
    const lo = Math.floor(mid - half);
    const hi = Math.ceil(mid + half);
    // y 範圍只看根附近，曲線的重點才不會被壓扁
    const ys = [];
    const ylo0 = near.length ? c0 - 1.5 : lo;
    const yhi0 = near.length ? c1 + 1.5 : hi;
    for (let i = 0; i <= 80; i++) {
      const y = g(ylo0 + ((yhi0 - ylo0) * i) / 80);
      if (Number.isFinite(y)) ys.push(y);
    }
    if (!ys.length) return { error: '這個算式在 −5 到 5 附近都沒有定義，畫不出來' };
    ys.sort((a, b) => a - b);
    const ylo = Math.min(0, ys[Math.floor(ys.length * 0.05)]);
    const yhi = Math.max(0, ys[Math.floor(ys.length * 0.95)]);
    const pad = Math.max(1, (yhi - ylo) * 0.15);
    const expr = v === 'x' ? toMath(node) : toMath(node, { [v]: 'x' });
    return {
      spec: {
        type: 'function_graph',
        x: [lo, hi],
        y: [Math.round((ylo - pad) * 100) / 100, Math.round((yhi + pad) * 100) / 100],
        elements: [
          { kind: 'curve', expr, label: `y = ${v === 'x' ? pretty(node) : pretty(node, { [v]: 'x' }).replace(/\(x\)/g, 'x')}`, stage: 1 },
          ...near.map((r) => ({ kind: 'point', x: r, y: 0, role: 'root', label: identify(r).pretty(), stage: 1 })),
        ],
      },
    };
  } catch (e) {
    return { error: `畫不出來：${e.message}` };
  }
}
