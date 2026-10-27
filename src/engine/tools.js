// 計算工具箱：讓學生在引導模式下自己動手試（代值、找使算式為 0 的值）
import { normalizeProblem } from './parse.js';
import { parseText, symbolsOf } from './poly.js';
import { compile } from './general/ast.js';
import { findRoots } from './general/numeric.js';
import { identify } from './general/identify.js';

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
