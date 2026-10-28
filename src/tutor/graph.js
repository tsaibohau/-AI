// 圖解說明：用「點」來解釋圖形為什麼長這樣（圖解數學：每個圖都是由點組成的）
import { parseText, toMPoly } from '../engine/poly.js';
import { compile, features, logInfo } from '../engine/general/ast.js';
import { identify } from '../engine/general/identify.js';

const show = (v) => {
  if (!Number.isFinite(v)) return '沒有定義';
  const id = identify(v);
  return id && !id.approx ? id.pretty() : String(Math.round(v * 100) / 100).replace('-', '−');
};

/** 判斷函數的種類（給學生看的說法） */
function kindOf(expr) {
  const node = parseText(expr);
  const f = features(node, 'x');
  let degree = null;
  try {
    const p = toMPoly(node, ['x']);
    degree = Math.max(0, p.degreeIn('x'));
  } catch {
    degree = null;
  }
  let logBase = null;
  node.traverse((n) => {
    const li = logInfo(n);
    if (li && typeof li.base === 'number') logBase = li.base;
  });
  return { node, f, degree, logBase };
}

/** 挑幾個好算的 x，列出 (x, y) 讓學生看到圖是怎麼「點出來」的 */
export function samplePoints(expr, xr, n = 5) {
  const f = compile(parseText(expr));
  const [a, b] = xr;
  const step = Math.max(1, Math.round((b - a) / (n + 1)));
  const xs = [];
  for (let x = Math.ceil(a); x <= b && xs.length < n + 4; x += step) xs.push(x);
  const pts = xs.map((x) => ({ x, y: f({ x }) })).filter((p) => Number.isFinite(p.y));
  return pts.slice(0, n);
}

function shapeText(k, expr) {
  const { f, degree, logBase } = k;
  if (degree === 1) return '這是一次函數：x 每增加 1，y 都增加（或減少）一樣多，所以畫出來是一條直線。';
  if (degree === 2) {
    return '這是二次函數，圖形是拋物線。因為有 x² 這一項：x 離頂點越遠，平方長得越快（1、4、9、16…），y 的變化也越來越大，所以點連起來是彎的，而且左右對稱。';
  }
  if (degree !== null && degree >= 3) return `這是 ${degree} 次多項式函數：次方越高，曲線可以轉越多個彎（最多轉 ${degree - 1} 次），所以會上下起伏。`;
  if (f.fracVar) return '這是分式函數：分母等於 0 的地方沒有定義，靠近那裡時分母很小、整個值變得非常大（或非常負），所以曲線在那裡斷開，往上下延伸。';
  if (logBase) return `這是對數函數：真數必須大於 0，所以圖只在一邊；x 每乘以 ${logBase === Math.E ? 'e' : logBase}，y 只增加 1，所以越往右越平緩。`;
  if (f.expVar) return '這是指數函數：x 每增加 1，y 就乘上同一個倍數，所以一開始很平、後來急速變大，而且永遠在 x 軸上方（加減常數會讓整條上下平移）。';
  if (f.sqrtVar) return '這是根號函數：根號內不能是負數，所以圖從某一點才開始；越往右增加得越慢。';
  return `把 x 代入 ${expr} 算出 y，每一組 (x, y) 就是圖上的一個點，把點連起來就是圖形。`;
}

/** 回傳說明段落；spec 是驗證過的圖解規格 */
export function explainGraph(spec) {
  if (!spec) return ['這題的圖只是輔助，重點在上面的步驟。'];
  const paras = [];
  if (spec.type === 'function_graph') {
    const curve = spec.elements.find((e) => e.kind === 'curve');
    if (curve) {
      const k = kindOf(curve.expr);
      paras.push(`圖上的曲線是 ${curve.label || curve.expr}。每一個 x 代進去會算出一個 y，(x, y) 就是圖上的一個點，所有的點連起來就是這條曲線。`);
      const pts = samplePoints(curve.expr, spec.x);
      if (pts.length) paras.push(`例如：${pts.map((p) => `x = ${show(p.x)} 時 y = ${show(p.y)}`).join('；')}。`);
      paras.push(shapeText(k, curve.label || curve.expr));
    }
    const logPts = spec.elements.filter((e) => e.kind === 'point' && /log|ln/.test(e.label || ''));
    if (logPts.length) {
      paras.push(`對數就是在問：在指數函數的圖上，y 等於真數時 x 是多少。${logPts.map((p) => `點 (${show(p.x)}, ${show(p.y)}) 代表 ${p.label}`).join('；')}。`);
    }
    const roots = spec.elements.filter((e) => e.kind === 'point' && e.role === 'root');
    if (roots.length) paras.push(`曲線和 x 軸的交點（${roots.map((r) => r.label || show(r.x)).join('、')}）就是 y = 0 的地方，也就是方程式的根。`);
    const v = spec.elements.find((e) => e.kind === 'point' && e.role === 'vertex');
    if (v) paras.push(`頂點 ${v.label || ''} 是曲線轉彎的地方，也是最高點或最低點。`);
    const sh = spec.elements.find((e) => e.kind === 'shade');
    if (sh) paras.push(`綠色區域是曲線在 x 軸${sh.sign.startsWith('>') ? '上方' : '下方'}的部分：那些 x 讓算式${sh.sign.startsWith('>') ? '大於' : '小於'} 0，就是不等式的解。實心點代表包含、空心點代表不包含。`);
  } else if (spec.type === 'number_line') {
    paras.push('數線上每一點代表一個實數。粗線段是符合條件的範圍：實心圓點代表端點包含在內，空心圓點代表不包含，箭頭代表一直延伸到無限。');
    if (spec.elements.some((e) => e.kind === 'interval') && new Set(spec.elements.map((e) => e.stage)).size > 1) {
      paras.push('上面灰色那條是定義域（式子有意義的範圍），下面藍色才是答案；答案一定要落在定義域裡面。');
    }
    const bad = spec.elements.filter((e) => e.kind === 'point' && !e.closed);
    if (bad.length) paras.push(`紅色空心點 ${bad.map((b) => b.label).join('、')} 是算出來但不在定義域內的值，要捨去。`);
  } else if (spec.type === 'geometry') {
    paras.push('圖上的點用座標決定位置，線段連接兩點，圓是和圓心距離相等的所有點，角度標示兩條線段張開的大小。');
  }
  return paras;
}
