// 第 2 批：會用工具的解題對話
//   node training/chat/tools-gen.mjs        產生 data/tools-items.json 與 prompts/2-tools-*.md
// 題目全部自創（固定亂數種子）；計算結果由解題引擎產生，保證正確。
// Gemini 只負責寫「拿到工具結果之後，老師怎麼講」那一句。
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTool } from '../../src/agent/tools.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAM = JSON.parse(readFileSync(join(HERE, 'exam.json'), 'utf8')).cases.map((c) => c.user.replace(/\s+/g, ''));

// 固定種子的亂數，讓每次產生的題目一樣
let seed = 20261029;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const nz = (a, b) => {
  let v = 0;
  while (v === 0) v = int(a, b);
  return v;
};
const pt = (x, y) => `(${x}, ${y})`;
const sgn = (n) => (n < 0 ? `− ${-n}` : `+ ${n}`);
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
/** 分數 n/d 化簡成文字，例如 −2/5、3 */
const frac = (n, d) => {
  if (d < 0) [n, d] = [-n, -d];
  const g = gcd(n, d) || 1;
  [n, d] = [n / g, d / g];
  return d === 1 ? String(n) : `${n}/${d}`;
};
const term = (c, v) => (c === 0 ? '' : `${c < 0 ? ' − ' : ' + '}${Math.abs(c) === 1 ? '' : Math.abs(c)}${v}`);

const items = [];
const add = (kind, question, call, lead) => {
  if (EXAM.includes(question.replace(/\s+/g, ''))) return;
  const result = runTool(call.name, call.args);
  delete result.__diagram;
  items.push({ id: `${kind}-${items.filter((i) => i.kind === kind).length + 1}`, kind, question, lead, call, result });
};

const LEAD = {
  slope: ['斜率我用工具算，避免算錯。', '先算斜率。', '我先把斜率算出來。', ''],
  line: ['我用兩點把直線求出來。', '先把直線方程式算出來。', ''],
  bisector: ['中垂線要通過中點、又跟線段垂直，我直接算。', '我算一下中垂線。', ''],
  intersect: ['交點就是兩條線同時成立的點，我解一下。', '我算交點。', ''],
  solve: ['我用工具解一下。', '先把它解出來。', ''],
  calc: ['分數加減我用工具算精確值。', '我算一下。', ''],
  measure: ['我量一下。', '用工具算比較準。', ''],
  check: ['我們算算看對不對。', '我先算一次正確答案，再跟你的比。', ''],
};

// 1. 斜率
for (let i = 0; i < 18; i++) {
  let [x1, y1, x2, y2] = [int(-6, 6), int(-6, 6), int(-6, 6), int(-6, 6)];
  if (x1 === x2) x2 += nz(1, 3);
  const [A, B] = [pt(x1, y1), pt(x2, y2)];
  const q = pick([`A${A}、B${B} 的斜率是多少？`, `求通過 ${A} 和 ${B} 的直線斜率`, `${A} 到 ${B} 的斜率怎麼算？`, `斜率？兩點是 ${A}、${B}`]);
  add('slope', q, { name: 'slope', args: { p1: A, p2: B } }, pick(LEAD.slope));
}
// 2. 兩點式直線
for (let i = 0; i < 15; i++) {
  let [x1, y1, x2, y2] = [int(-5, 5), int(-5, 5), int(-5, 5), int(-5, 5)];
  if (x1 === x2 && y1 === y2) y2 += 2;
  const [A, B] = [pt(x1, y1), pt(x2, y2)];
  const q = pick([`求通過 ${A}、${B} 的直線方程式`, `A${A}、B${B} 這條直線的方程式是什麼？`, `幫我寫出過 ${A} 和 ${B} 的直線`]);
  add('line', q, { name: 'line', args: { mode: 'two_points', p1: A, p2: B } }, pick(LEAD.line));
}
// 3. 中垂線
for (let i = 0; i < 12; i++) {
  const [x1, y1] = [int(-6, 6), int(-6, 6)];
  const [x2, y2] = [x1 + 2 * nz(-3, 3), y1 + 2 * int(-3, 3)];
  const [A, B] = [pt(x1, y1), pt(x2, y2)];
  const q = pick([`A${A}、B${B} 的中垂線方程式？`, `求線段 AB 的垂直平分線，A${A}、B${B}`, `到 ${A} 和 ${B} 距離相等的點形成什麼直線？`]);
  add('bisector', q, { name: 'perpendicular_bisector', args: { p1: A, p2: B } }, pick(LEAD.bisector));
}
// 4. 交點
for (let i = 0; i < 12; i++) {
  const [x0, y0] = [int(-4, 4), int(-4, 4)];
  const [a1, b1, a2, b2] = [nz(-3, 3), nz(-3, 3), nz(-3, 3), nz(-3, 3)];
  if (a1 * b2 === a2 * b1) continue;
  const L1 = `${a1}x${term(b1, 'y')} = ${a1 * x0 + b1 * y0}`.replace(/^1x/, 'x').replace(/^-1x/, '−x').replace(/^-/, '−');
  const L2 = `${a2}x${term(b2, 'y')} = ${a2 * x0 + b2 * y0}`.replace(/^1x/, 'x').replace(/^-1x/, '−x').replace(/^-/, '−');
  const q = pick([`${L1} 和 ${L2} 的交點？`, `求兩直線 ${L1}、${L2} 的交點坐標`, `解聯立 ${L1}、${L2}`]);
  add('intersect', q, { name: 'intersect', args: { line1: L1, line2: L2 } }, pick(LEAD.intersect));
}
// 5. 一元二次方程式
for (let i = 0; i < 18; i++) {
  const [r1, r2] = [int(-6, 6), int(-6, 6)];
  const b = -(r1 + r2);
  const c = r1 * r2;
  const eq = `x²${term(b, 'x')}${c === 0 ? '' : ` ${sgn(c)}`} = 0`;
  const q = pick([`解 ${eq}`, `${eq} 的解是多少？`, `幫我解這個方程式：${eq}`]);
  add('solve', q, { name: 'solve', args: { problem: eq } }, pick(LEAD.solve));
}
// 6. 二次不等式
for (let i = 0; i < 10; i++) {
  const r1 = int(-5, 3);
  const r2 = r1 + int(1, 5);
  const b = -(r1 + r2);
  const c = r1 * r2;
  const op = pick(['<', '>', '≤', '≥']);
  const ineq = `x²${term(b, 'x')}${c === 0 ? '' : ` ${sgn(c)}`} ${op} 0`;
  add('solve', `解不等式 ${ineq}`, { name: 'solve', args: { problem: ineq } }, pick(LEAD.solve));
}
// 7. 二次函數最大最小值
for (let i = 0; i < 10; i++) {
  const a = pick([1, 2, 3, -1, -2]);
  const h = int(-3, 3);
  const k = int(-5, 5);
  const b = -2 * a * h;
  const c = a * h * h + k;
  const f = `${a === 1 ? '' : a === -1 ? '−' : a}x²${term(b, 'x')}${c === 0 ? '' : ` ${sgn(c)}`}`.replace(/^-/, '−');
  const q = `求 f(x) = ${f} 的${a > 0 ? '最小值' : '最大值'}`;
  add('solve', q, { name: 'solve', args: { problem: q } }, pick(LEAD.solve));
}
// 8. 分數計算
for (let i = 0; i < 15; i++) {
  const [a, b, c, d] = [int(1, 9), int(2, 9), int(1, 9), int(2, 9)];
  const op = pick(['+', '−', '×', '÷']);
  const expr = `${a}/${b} ${op} ${c}/${d}`;
  add('calc', pick([`${expr} 等於多少？`, `算 ${expr}`, `幫我算 ${expr}`]), { name: 'calculate', args: { expression: `(${a}/${b}) ${{ '+': '+', '−': '-', '×': '*', '÷': '/' }[op]} (${c}/${d})` } }, pick(LEAD.calc));
}
// 9. 距離、中點
for (let i = 0; i < 10; i++) {
  const [A, B] = [pt(int(-5, 5), int(-5, 5)), pt(int(-5, 5), int(-5, 5))];
  if (A === B) continue;
  const kind = pick(['distance', 'midpoint']);
  const q = kind === 'distance' ? `${A} 和 ${B} 的距離是多少？` : `${A}、${B} 的中點在哪？`;
  add('measure', q, { name: 'measure', args: { kind, points: [A, B] } }, pick(LEAD.measure));
}
// 10. 外心
for (let i = 0; i < 8; i++) {
  const [A, B, C] = [pt(int(-4, 4), int(-4, 4)), pt(int(-4, 4), int(-4, 4)), pt(int(-4, 4), int(-4, 4))];
  const r = runTool('triangle_centers', { a: A, b: B, c: C });
  if (r.error) continue;
  add('measure', pick([`三個村莊在 A${A}、B${B}、C${C}，要蓋一所到三村等距的學校，學校在哪？`, `求 A${A}、B${B}、C${C} 三角形的外心`]), { name: 'triangle_centers', args: { a: A, b: B, c: C } }, '到三點等距就是外心，我直接算。');
}
// 11. 學生算錯，請老師檢查（斜率上下顛倒、忘了變號）
for (let i = 0; i < 12; i++) {
  let [x1, y1, x2, y2] = [int(-5, 5), int(-5, 5), int(-5, 5), int(-5, 5)];
  if (x1 === x2) x2 += 2;
  if (y1 === y2) y2 += 3;
  const dx = x2 - x1;
  const dy = y2 - y1;
  // 常見錯誤：分子分母顛倒、忘了負號
  const wrong = pick([frac(dx, dy), frac(-dy, dx)]);
  if (wrong === frac(dy, dx)) continue;
  const [A, B] = [pt(x1, y1), pt(x2, y2)];
  add('check', `我算 A${A}、B${B} 的斜率是 ${wrong}，對嗎？`, { name: 'slope', args: { p1: A, p2: B } }, pick(LEAD.check));
}
// 12. 參數題：恆過定點（老師先說明怎麼想，再用工具解聯立）
const FIXED = [
  ['直線 y = kx + 3k − 2 恆過哪一點？', ['x + 3 = 0', 'y + 2 = 0'], '把含 k 的項整理在一起：k(x + 3) − (y + 2) = 0。不管 k 是多少都成立，兩個括號都要等於零，我解一下。'],
  ['直線 (m + 1)x + y − 2m = 0 恆過哪一點？', ['x − 2 = 0', 'x + y = 0'], '把含 m 的項提出來：m(x − 2) + (x + y) = 0，兩部分都要等於零，我解一下。'],
  ['不管 a 是多少，直線 ax − y + 2a + 1 = 0 都通過哪一點？', ['x + 2 = 0', '−y + 1 = 0'], '整理成 a(x + 2) + (−y + 1) = 0，a 的係數和剩下的部分都要是零，我解聯立。'],
  ['直線 y − 4 = t(x − 1) 恆過的定點是？', ['x − 1 = 0', 'y − 4 = 0'], '這是點斜式，t 怎麼變都要成立，代表 x − 1 和 y − 4 都要是零，我確認一下。'],
];
for (const [q, eqs, lead] of FIXED) add('param', q, { name: 'solve_linear_system', args: { equations: eqs } }, lead);
// 13. 工具回錯：題目寫法看不懂
const BROKEN = ['解 x^^2 − 9 = 0', '解 2x + = 7', '算 3/ + 4', '解 x² − 4x + = 0', '求 (x+1 的平方', '解 x²))− 1 = 0'];
for (const q of BROKEN.filter((b) => b !== '算 3/ + 4')) add('error', q, { name: q.startsWith('算') ? 'calculate' : 'solve', args: q.startsWith('算') ? { expression: q.slice(2) } : { problem: q.slice(2) } }, pick(LEAD.solve));

mkdirSync(join(HERE, 'data'), { recursive: true });
writeFileSync(join(HERE, 'data', 'tools-items.json'), JSON.stringify(items, null, 1) + '\n');

// 給 Gemini 的提示詞，每份 30 題
const RULES = `# 任務：寫「拿到計算結果後，老師怎麼講」（第 2 批）

我在訓練一個台灣高中數學家教 AI。它不自己算數學，而是呼叫計算工具；工具算完後，它要用老師的口氣把結果講給學生聽。
下面每一題都附上「學生的問題」和「工具算出來的結果（一定正確）」。請幫每一題寫老師的回應，並另外寫一個 AI 味的壞版本。

## 好版本的規則

1. **數字只能用「學生的問題」或「工具結果」裡出現過的**，不可以自己算出新的數字（連中間步驟的數字也不行）。
2. 講清楚答案，再加一個具體的東西：為什麼這樣做（一句話）、一個常見的錯、或一個讓學生確認自己懂了的小問題。
3. 學生算錯（check 類）：先說哪裡不一樣，用工具結果指出正確答案，溫和地點出常見原因（例如分子分母顛倒、忘了變號），不要說教。
4. 工具回傳 error：不要自己算答案，請學生確認題目的寫法，舉出看起來打錯的地方。
5. 口氣平實像真人：驚嘆號最多一個，不要用「一起搞定、有我在、太棒了、你可以的、大魔王、過關斬將」這類空話。
6. 1～3 句，最多 100 字。不要 LaTeX、不要 Markdown（#、**、表格、程式碼區塊）。數學式用一般寫法，例如 x² − 5x + 6、(3, 2)、−1/2。

## 壞版本（rejected）

寫成 AI 味的樣子：很熱情、很多驚嘆號、空泛鼓勵，但沒有具體內容。

## 輸出格式

只輸出 JSON Lines，一行一題，不要有其他說明文字，不要用程式碼區塊：
{"id": "題目代號", "reply": "好版本", "rejected": "壞版本"}

## 題目
`;
const chunks = [];
for (let i = 0; i < items.length; i += 30) chunks.push(items.slice(i, i + 30));
chunks.forEach((ch, n) => {
  const body = ch.map((it) => `- id：${it.id}（${it.kind}）\n  學生：${it.question}\n  工具結果：${JSON.stringify(it.result)}`).join('\n');
  writeFileSync(join(HERE, 'prompts', `2-tools-${n + 1}.md`), `${RULES}\n${body}\n`);
});
const kinds = {};
for (const it of items) kinds[it.kind] = (kinds[it.kind] || 0) + 1;
console.log(`題目 ${items.length} 題（${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join('、')}），提示詞 ${chunks.length} 份`);
console.log('工具回錯的題目：', items.filter((i) => i.result.error).map((i) => i.id).join('、'));
