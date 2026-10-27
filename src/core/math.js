// 受限的 mathjs 實例：關閉可能被濫用的函式（依 mathjs 官方安全建議）
import { create, all } from 'mathjs';

export const math = create(all);
const limitedEvaluate = math.evaluate;

math.import(
  {
    import: () => { throw new Error('已停用 import'); },
    createUnit: () => { throw new Error('已停用 createUnit'); },
    evaluate: () => { throw new Error('已停用 evaluate'); },
    parse: () => { throw new Error('已停用 parse'); },
    simplify: () => { throw new Error('已停用 simplify'); },
    derivative: () => { throw new Error('已停用 derivative'); },
  },
  { override: true },
);

/** 計算算式，回傳實數；失敗或非實數回傳 NaN */
export function evalReal(expr, scope = {}) {
  try {
    let v = limitedEvaluate(String(expr), { ...scope });
    if (v && typeof v === 'object' && typeof v.valueOf === 'function' && !math.isComplex(v)) v = Number(v.valueOf());
    if (math.isComplex(v)) return Math.abs(v.im) < 1e-12 ? v.re : NaN;
    return typeof v === 'number' ? v : NaN;
  } catch {
    return NaN;
  }
}
