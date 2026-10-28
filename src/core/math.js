// 受限的 mathjs 實例：關閉可能被濫用的函式（依 mathjs 官方安全建議）
// 只載入用得到的函式，縮小手機下載量
import {
  create,
  evaluateDependencies,
  parseDependencies,
  addDependencies,
  subtractDependencies,
  multiplyDependencies,
  divideDependencies,
  powDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
  sqrtDependencies,
  cbrtDependencies,
  nthRootDependencies,
  logDependencies,
  log10Dependencies,
  log2Dependencies,
  expDependencies,
  absDependencies,
  piDependencies,
  eDependencies,
  InfinityDependencies,
  smallerDependencies,
  largerDependencies,
  equalDependencies,
  sinDependencies,
  cosDependencies,
  tanDependencies,
  asinDependencies,
  acosDependencies,
  atanDependencies,
} from 'mathjs';

export const math = create({
  evaluateDependencies,
  parseDependencies,
  addDependencies,
  subtractDependencies,
  multiplyDependencies,
  divideDependencies,
  powDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
  sqrtDependencies,
  cbrtDependencies,
  nthRootDependencies,
  logDependencies,
  log10Dependencies,
  log2Dependencies,
  expDependencies,
  absDependencies,
  piDependencies,
  eDependencies,
  InfinityDependencies,
  smallerDependencies,
  largerDependencies,
  equalDependencies,
  sinDependencies,
  cosDependencies,
  tanDependencies,
  asinDependencies,
  acosDependencies,
  atanDependencies,
});
const limitedEvaluate = math.evaluate;
const limitedParse = math.parse;

math.import(
  {
    import: () => { throw new Error('已停用 import'); },
    createUnit: () => { throw new Error('已停用 createUnit'); },
    evaluate: () => { throw new Error('已停用 evaluate'); },
    parse: () => { throw new Error('已停用 parse'); },
  },
  { override: true },
);

/** 解析算式成語法樹（只解析不執行） */
export function parseExpr(expr) {
  return limitedParse(String(expr));
}

/** 計算算式，回傳實數；失敗或非實數回傳 NaN */
export function evalReal(expr, scope = {}) {
  try {
    let v = limitedEvaluate(String(expr), { ...scope });
    if (v && typeof v === 'object' && typeof v.valueOf === 'function' && !(v && v.isComplex === true)) v = Number(v.valueOf());
    if ((v && v.isComplex === true)) return Math.abs(v.im) < 1e-12 ? v.re : NaN;
    return typeof v === 'number' ? v : NaN;
  } catch {
    return NaN;
  }
}
