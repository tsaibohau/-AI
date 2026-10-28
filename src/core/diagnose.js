// 診斷學生的作答：對了沒有、錯在哪裡、屬於哪一類錯誤
// 錯誤類型：審題、漏列條件、觀念、公式、延伸、計算、符號
import { compareAnswer, compareExpr, parseNumber, parseSet, parsePoint, parseIntervals } from './answer.js';

const EPS = 1e-9;
const near = (a, b) => a === b || Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));

const FORMAT_HINT = {
  number: '例如 −5、1/2、√2',
  set: '例如 {1, 2} 或 x = 1 或 x = 2',
  interval: '例如 (−2, 3]、x < −1 或 x > 4、所有實數、無解',
  point: '例如 (2, −5)',
  line: '例如 x + 2y − 8 = 0 或 y = −1/2 x + 4',
  expr: '例如 4k² − 12k − 16',
  expr_prop: '例如 t² − 6t + 8',
};

const result = (ok, message, category = null) => ({ ok, message, category });

function sameSet(a, b) {
  return a.length === b.length && a.every((x, i) => near(x, b[i]));
}

function diagnoseNumber(g, s) {
  if (near(s, -g)) return result(false, '數字對了，但正負號弄反了，再看一次符號。', '符號');
  if (Math.abs(g) > EPS && near(s, 1 / g)) return result(false, '你算出的是倒數，分子分母是不是放反了？', '計算');
  if (Math.abs(s - g) <= 1e-3 * Math.max(1, Math.abs(g))) return result(false, '很接近了！請寫精確值（分數或根號），不要寫小數近似值。', '計算');
  return result(false, '數值不對，回頭檢查這一步的計算。', '計算');
}

function diagnoseSet(g, s, ask) {
  if (sameSet(s, g.map((x) => -x).sort((a, b) => a - b)) && g.some((x) => Math.abs(x) > EPS)) {
    return result(false, '根的正負號弄反了：(x − a) = 0 的根是 +a，不是 −a。', '符號');
  }
  const missing = g.filter((x) => !s.some((y) => near(x, y)));
  const extra = s.filter((y) => !g.some((x) => near(x, y)));
  if (extra.length && ask.domain) {
    const dom = parseIntervals(ask.domain);
    const outside = dom && extra.filter((y) => !dom.some((d) => (y > d.lo || (d.loC && near(y, d.lo))) && (y < d.hi || (d.hiC && near(y, d.hi)))));
    if (outside && outside.length) return result(false, `有些值不在定義域（${ask.domain}）內，要捨去。`, '漏列條件');
  }
  if (missing.length && !extra.length) return result(false, `少了 ${missing.length} 個解，再檢查一次是不是全部找到了。`, '延伸');
  if (extra.length && !missing.length) return result(false, '多了不該有的值，代回原式檢查看看。', '漏列條件');
  return result(false, '解不對，回頭檢查這一步的計算。', '計算');
}

function covers(outer, inner) {
  // inner 的每一段都在 outer 裡（只看數值範圍）
  return inner.every((x) => outer.some((o) => o.lo <= x.lo + EPS && o.hi >= x.hi - EPS));
}

function diagnoseInterval(g, s, ask) {
  const ends = (xs) => xs.flatMap((x) => [x.lo, x.hi]);
  const ge = ends(g);
  const se = ends(s);
  if (ge.length === se.length && ge.every((x, i) => near(x, se[i]))) {
    return result(false, '範圍對了，但端點有沒有包含要再檢查：≤ 用中括號 [ ]，< 用小括號 ( )。', '符號');
  }
  // 和正確答案互補：方向反了
  const gFinite = ge.filter(Number.isFinite).sort((a, b) => a - b);
  const sFinite = se.filter(Number.isFinite).sort((a, b) => a - b);
  const sameCuts = gFinite.length && gFinite.length === sFinite.length && gFinite.every((x, i) => near(x, sFinite[i]));
  if (sameCuts && !covers(s, g)) {
    return result(false, '分界點找對了，但取錯了範圍：可能是乘以負數時忘了變號，或「兩根之間」和「兩根外側」弄反。', '符號');
  }
  if (covers(s, g) && ask.domain) return result(false, `範圍太大了：記得和定義域（${ask.domain}）取交集。`, '漏列條件');
  if (covers(s, g)) return result(false, '範圍太大了，有些值其實不滿足，取一個數代入檢查。', '延伸');
  if (covers(g, s)) return result(false, '範圍太小了，漏掉了一部分。', '延伸');
  return result(false, '範圍不對，回頭找分界點並逐段判斷正負。', '計算');
}

function diagnosePoint(g, s) {
  if (g.length === s.length && near(g[0], s[1]) && near(g[1], s[0])) return result(false, '兩個座標的順序反了，要寫 (x, y)。', '符號');
  if (g.length === s.length && g.some((x, i) => near(x, -s[i]) && !near(x, s[i])) && g.every((x, i) => near(Math.abs(x), Math.abs(s[i])))) {
    return result(false, '有一個座標的正負號錯了：(x − h)² 的頂點在 x = h，(x + 2)² 代表 h = −2。', '符號');
  }
  return result(false, '座標不對，回頭檢查配方的過程。', '計算');
}

/**
 * ask: { type, value, var?, domain? }，student: 學生輸入的文字
 * 回傳 { ok, message, category }
 */
export function diagnose(ask, student) {
  const text = String(student ?? '').trim();
  if (!text) return result(false, '先寫下你的答案再檢查。');
  if (ask.type === 'line') {
    // 直線：移到同一邊後只差一個非零倍數就算對
    const c = compareExpr(ask.value, text, 'auto', true);
    if (c.ok) return result(true, '正確！');
    if (c.reason === '無法解析') return result(false, `看不懂你的寫法，${FORMAT_HINT.line}。`);
    return result(false, '這條直線不對：檢查斜率有沒有取負倒數、代入的是不是中點，或把中點代進你的式子看看會不會成立。', '計算');
  }
  if (ask.type === 'expr' || ask.type === 'expr_prop') {
    const c = compareExpr(ask.value, text, ask.var || 'x', ask.type === 'expr_prop');
    if (c.ok) return result(true, '正確！');
    if (c.reason === '無法解析') return result(false, `看不懂你的寫法，${FORMAT_HINT[ask.type]}。`);
    if (c.ratio !== null && near(c.ratio, -1)) return result(false, '整個式子差一個負號，檢查移項或展開時的符號。', '符號');
    if (c.ratio !== null) return result(false, '和正確的式子差一個倍數，檢查係數。', '計算');
    return result(false, '式子不對：代一個數字進去，和原式比比看哪裡不一樣。', '計算');
  }
  const parse = { number: parseNumber, set: parseSet, interval: parseIntervals, point: parsePoint }[ask.type];
  const s = parse(text);
  if (s === null) return result(false, `看不懂你的寫法，${FORMAT_HINT[ask.type]}。`);
  if (compareAnswer(ask, text).ok) return result(true, '正確！');
  const g = parse(ask.value);
  if (ask.type === 'number') return diagnoseNumber(g, s);
  if (ask.type === 'set') return diagnoseSet(g, s, ask);
  if (ask.type === 'interval') return diagnoseInterval(g, s, ask);
  return diagnosePoint(g, s);
}
