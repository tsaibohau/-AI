// 應用問題：照使用者的解題思路（docs/solving-method/應用問題.md）
// 1. 提取關鍵數據（情境名詞＝點）→ 2. 先看最後一小題問什麼 → 3. 第 1 小題求中垂線（垂直是重點）
// → 4. 再找一條中垂線、聯立求交點 → 5. 檢查到三點等距
// 目前支援：三個地點，求到三點距離相等的位置（外心）
import { Q } from '../num.js';
import { EngineError } from '../poly.js';
import { ask, buildResult } from '../common.js';
import { parsePoint, qx, qy, midpoint, perpendicularBisector, intersect, lineInfo } from '../lines.js';
import { findByCues } from '../../core/definitions.js';

const NUM = String.raw`[-−]?\s*\d+(?:\.\d+)?(?:\s*/\s*\d+)?`;
const POINT_RE = new RegExp(String.raw`([A-Z])\s*[(（]\s*(${NUM})\s*[,，]\s*(${NUM})\s*[)）]`, 'g');
const MINUS = '−';
const fmt = (q) => q.pretty();
const par = (q) => (q.sign() < 0 ? `(${fmt(q)})` : fmt(q)); // 負數加括號
const ptText = (x, y) => `(${fmt(x)}, ${fmt(y)})`;

/** 從題目找出帶坐標的點，例如 A(−3, −2) */
export function extractPoints(text) {
  const t = String(text || '').normalize('NFKC').replace(/[−–—﹣]/g, '-');
  const out = [];
  for (const m of t.matchAll(POINT_RE)) {
    if (out.some((p) => p.name === m[1])) continue;
    const P = parsePoint(`(${m[2]}, ${m[3]})`);
    out.push({ name: m[1], x: qx(P), y: qy(P) });
  }
  return out;
}

/** 題目前面的情境名詞（村莊、學校…），找不到就用「地點」 */
function placeWord(text) {
  return String(text).match(/村莊|村落|學校|車站|商店|燈塔|基地台|住家|工廠|城市|島/)?.[0] || '地點';
}

/** 是不是「三個地點、求到三點等距的位置」 */
export function isCircumcenterApp(text) {
  const ids = findByCues(text).map((h) => h.id);
  return extractPoints(text).length === 3 && (ids.includes('geo.circumcenter') || /外心|距離(都)?相等|等距/.test(text));
}

/** 第 (1) 小題指定的線段，例如「(1) 求 BC 的中垂線」 */
function firstSide(text, names) {
  const m = String(text).normalize('NFKC').match(/\(1\)[^(]*?([A-Z])([A-Z])\s*(的)?\s*(中垂線|垂直平分線)/);
  if (m && names.includes(m[1]) && names.includes(m[2]) && m[1] !== m[2]) return [m[1], m[2]];
  return [names[0], names[1]];
}

/** 一條邊的中垂線：斜率、負倒數、中點、點斜式、一般式 */
function bisector(P, R) {
  const dx = R.x.sub(P.x);
  const dy = R.y.sub(P.y);
  const M = midpoint(`(${P.x.plain()}, ${P.y.plain()})`, `(${R.x.plain()}, ${R.y.plain()})`);
  const { line } = perpendicularBisector(`(${P.x.plain()}, ${P.y.plain()})`, `(${R.x.plain()}, ${R.y.plain()})`);
  const info = lineInfo(line);
  const side = `${P.name}${R.name}`;
  const slope = dx.isZero() ? null : dy.div(dx);
  // 中垂線斜率：邊是鉛直線 → 0（水平）；邊是水平線 → null（鉛直，沒有斜率）
  const perp = slope === null ? new Q(0n) : slope.isZero() ? null : new Q(-1n).div(slope);
  return { side, P, R, dx, dy, slope, perp, M, line, equation: info.equation };
}

const slopeDetail = (b) =>
  `${b.side} 的斜率 ＝ Δy／Δx ＝ (${fmt(b.R.y)} ${MINUS} ${par(b.P.y)})／(${fmt(b.R.x)} ${MINUS} ${par(b.P.x)}) ＝ ${fmt(b.dy)}／${par(b.dx)}${b.slope && !b.dx.eq(1) ? ` ＝ ${fmt(b.slope)}` : ''}`;

/** 引導對話用的變數（顯示用的文字已排好負號與括號；value 類的用 plain） */
function talkVars(b, label) {
  const v = {
    side: b.side, P: b.P.name, R: b.R.name,
    x1: fmt(b.P.x), y1: fmt(b.P.y), x2: fmt(b.R.x), y2: fmt(b.R.y),
    x1p: par(b.P.x), y1p: par(b.P.y), x2p: par(b.R.x), y2p: par(b.R.y),
    dx: fmt(b.dx), dy: fmt(b.dy), dxp: par(b.dx),
    mx: fmt(b.M.x), my: fmt(b.M.y), mxv: b.M.x.plain(), myv: b.M.y.plain(), mxp: par(b.M.x), myp: par(b.M.y), M: b.M.text,
    xMinus: `x ${MINUS} ${par(b.M.x)}`, yMinus: `y ${MINUS} ${par(b.M.y)}`,
    eq: b.equation,
    subLabel: label.startsWith('第 (1)') ? '這就是第 (1) 小題的答案。' : '',
  };
  if (b.slope) {
    Object.assign(v, { m: fmt(b.slope), mp: par(b.slope), run: String(b.slope.d), rise: new Q(b.slope.n).pretty(), nrun: new Q(-b.slope.n).pretty() });
    if (!b.dy.isZero()) v.minv = fmt(b.dx.div(b.dy));
  }
  if (b.perp) Object.assign(v, { perp: fmt(b.perp), perpp: par(b.perp), perpNeg: fmt(b.perp.neg()) });
  return v;
}

/** 中垂線的四個小步驟（第 1 小題要學生一步一步做） */
function bisectorSteps(b, label) {
  const steps = [];
  const vars = talkVars(b, label);
  const ptOf = (P) => `${P.name}${ptText(P.x, P.y)}`;
  if (b.slope === null) {
    steps.push({
      step: `${b.side} 是鉛直線（兩點的 x 坐標一樣），沒有斜率`,
      reason: '斜率是 Δy／Δx，Δx ＝ 0 時不能除',
      detail: `${ptOf(b.P)}、${ptOf(b.R)} 的 x 坐標都是 ${fmt(b.P.x)}`,
      defs: ['geo.slope'],
    });
    steps.push({
      step: `和鉛直線垂直的是水平線，所以 ${b.side} 的中垂線是水平線（斜率 0）`,
      reason: '斜率相乘 ＝ −1 只適用於兩條都有斜率的直線；鉛直線和水平線是特例',
      defs: ['geo.perpendicular', 'geo.slope_perpendicular'],
    });
  } else {
    steps.push({
      step: `${b.side} 的斜率 ＝ ${fmt(b.slope)}`,
      reason: '斜率 ＝ Δy／Δx（y 的變化量除以 x 的變化量）',
      detail: slopeDetail(b),
      ask: ask(`先算 ${b.side} 的斜率是多少？`, 'number', b.slope.plain()),
      defs: ['geo.slope'],
      talk: { script: 'slope', vars },
    });
    if (b.perp === null) {
      steps.push({
        step: `${b.side} 是水平線（斜率 0），和它垂直的中垂線是鉛直線，沒有斜率`,
        reason: '斜率相乘 ＝ −1 只適用於兩條都有斜率的直線；水平線和鉛直線是特例',
        defs: ['geo.perpendicular', 'geo.slope_perpendicular'],
      });
    } else {
      steps.push({
        step: `中垂線和 ${b.side} 垂直，所以中垂線的斜率 ＝ ${fmt(b.perp)}`,
        reason: `垂直 → 兩線斜率相乘 ＝ −1，所以取負倒數：${par(b.slope)} × ${par(b.perp)} ＝ −1`,
        ask: ask(`中垂線和 ${b.side} 垂直，中垂線的斜率是多少？`, 'number', b.perp.plain()),
        defs: ['geo.perpendicular', 'geo.slope_perpendicular'],
        talk: { script: 'perp', vars },
      });
    }
  }
  steps.push({
    step: `${b.side} 的中點 ＝ ${b.M.text}`,
    reason: '中垂線要通過線段的中點；中點坐標是兩端點坐標的平均',
    detail: `x：(${fmt(b.P.x)} ＋ ${par(b.R.x)})／2 ＝ ${fmt(b.M.x)}；y：(${fmt(b.P.y)} ＋ ${par(b.R.y)})／2 ＝ ${fmt(b.M.y)}`,
    ask: ask(`中垂線通過 ${b.side} 的中點，中點坐標是？`, 'point', `(${b.M.x.plain()}, ${b.M.y.plain()})`),
    defs: ['geo.midpoint', 'geo.midpoint_formula'],
    talk: { script: 'midpoint', vars },
  });
  const ps =
    b.slope === null
      ? `y ＝ ${fmt(b.M.y)}`
      : b.perp === null
        ? `x ＝ ${fmt(b.M.x)}`
        : `y ${MINUS} ${par(b.M.y)} ＝ ${fmt(b.perp)}(x ${MINUS} ${par(b.M.x)})`;
  steps.push({
    step: `${label}：${b.side} 的中垂線是 ${b.equation}`,
    reason:
      b.slope === null || b.perp === null
        ? `中垂線是${b.slope === null ? '水平' : '鉛直'}線，通過中點就能直接寫出`
        : '已知通過的點（中點）和斜率，用點斜式 y − y₀ ＝ m(x − x₀) 寫出直線，再整理成一般式',
    detail: b.slope === null || b.perp === null ? `中垂線通過中點 ${b.M.text}：${ps}，也就是 ${b.equation}` : `點斜式：${ps}，移項整理得 ${b.equation}`,
    ask: ask(b.slope === null || b.perp === null ? `寫出 ${b.side} 的中垂線方程式：` : `用點斜式寫出 ${b.side} 的中垂線方程式：`, 'line', b.equation),
    defs: ['geo.perp_bisector', 'geo.point_slope', 'geo.general_form'],
    ...(b.slope !== null && b.perp !== null ? { talk: { script: 'pointslope', vars } } : {}),
  });
  return steps;
}

/** 解三個地點的外心應用題；不符合時丟 EngineError */
export function solveCircumcenterApp(text) {
  const pts = extractPoints(text);
  if (pts.length !== 3) throw new EngineError('需要剛好三個有坐標的點');
  const byName = Object.fromEntries(pts.map((p) => [p.name, p]));
  const names = pts.map((p) => p.name);
  const [a, b] = firstSide(text, names);
  const c = names.find((n) => n !== a && n !== b);
  const [A, B, C] = [byName[a], byName[b], byName[c]];
  // 三點共線就沒有外心
  if (B.x.sub(A.x).mul(C.y.sub(A.y)).sub(B.y.sub(A.y).mul(C.x.sub(A.x))).isZero()) throw new EngineError('三點在同一條直線上，找不到到三點等距的點');

  const b1 = bisector(A, B);
  const b2 = bisector(B, C);
  const O = intersect(b1.line, b2.line);
  if (!O.point) throw new EngineError('兩條中垂線沒有交點');
  const ox = O.x ?? O.point.x;
  const oy = O.y ?? O.point.y;
  const center = ptText(ox, oy);
  const d2 = (P) => P.x.sub(ox).mul(P.x.sub(ox)).add(P.y.sub(oy).mul(P.y.sub(oy)));
  const r2 = d2(A);
  const place = placeWord(text);
  const hasSub = /\(1\)|（1）|\(2\)|（2）/.test(String(text).normalize('NFKC'));
  const label1 = hasSub ? '第 (1) 小題' : '第一條中垂線';

  const steps = [
    {
      step: `提取關鍵數據：三個${place}就是三個點 ${pts.map((p) => `${p.name}${ptText(p.x, p.y)}`).join('、')}`,
      reason: `題目裡的「${place}」這些名詞只是情境，在課本上的概念就是「點」，其他文字可以先丟掉`,
      defs: ['geo.point', 'geo.coordinate'],
      talk: { script: 'point', vars: { place, pts: pts.map((p) => `${p.name}${ptText(p.x, p.y)}`).join('、') } },
    },
    {
      step: `先看最後要求什麼：到三點距離都相等的位置，就是三條中垂線的交點（外心）${hasSub ? '；所以第 (1) 小題的中垂線是在幫第 (2) 小題鋪路' : ''}`,
      reason: '中垂線上的點到線段兩端等距；同時在兩條中垂線上，就到三個點都等距',
      defs: ['geo.perp_bisector_property', 'geo.circumcenter'],
      talk: { script: 'equidistant', vars: { place, side: b1.side, subNote: hasSub ? '所以第 (1) 小題先叫你算 AB 的中垂線，就是在幫第 (2) 小題鋪路。'.replace('AB', b1.side) : '' } },
    },
    ...bisectorSteps(b1, label1),
    {
      step: `再找一條：${b2.side} 的中垂線是 ${b2.equation}`,
      reason: '外心只要找任兩條邊的中垂線，第三條一定也通過同一點；做法和上面一樣',
      detail:
        (b2.slope === null ? `${b2.side} 是鉛直線，中垂線是水平線` : `${slopeDetail(b2)}，`) +
        (b2.slope === null ? '' : b2.perp === null ? '中垂線是鉛直線' : `中垂線斜率 ${fmt(b2.perp)}`) +
        `，中點 ${b2.M.text}，整理得 ${b2.equation}`,
      ask: ask(`照同樣的方法，${b2.side} 的中垂線方程式是？`, 'line', b2.equation),
      defs: ['geo.perp_bisector'],
    },
    {
      step: `兩條中垂線聯立，交點 ${center}`,
      reason: '交點同時在兩條線上，所以同時滿足兩個方程式',
      detail: `解 ${b1.equation} 與 ${b2.equation}，得 x ＝ ${fmt(ox)}、y ＝ ${fmt(oy)}`,
      ask: ask('把兩條中垂線聯立，交點坐標是？', 'point', `(${ox.plain()}, ${oy.plain()})`),
      defs: ['geo.intersection'],
      talk: {
        script: 'intersect',
        vars: { eq1: b1.equation, eq2: b2.equation, Ov: `(${ox.plain()}, ${oy.plain()})`, detail: `把 ${b1.equation} 和 ${b2.equation} 聯立（可以用加減消去一個未知數），解得 x ＝ ${fmt(ox)}、y ＝ ${fmt(oy)}，交點是 ${center}。` },
      },
    },
    {
      step: `檢查：${center} 到三點的距離平方都是 ${fmt(r2)}，所以到三點等距`,
      reason: '用距離公式驗算；這個距離也是外接圓的半徑',
      detail: pts.map((p) => `到 ${p.name}：(${fmt(p.x)} ${MINUS} ${par(ox)})² ＋ (${fmt(p.y)} ${MINUS} ${par(oy)})² ＝ ${fmt(d2(p))}`).join('；'),
      defs: ['geo.distance', 'geo.circumcircle'],
    },
  ];

  // 「我不懂」追問用的小講義（concepts.json 的 id）
  const LESSON_OF = [
    [/geo\.(circumcenter|circumcircle|distance|perp_bisector_property|point|coordinate)/, 'line.circumcenter'],
    [/geo\.(slope|perpendicular|slope_perpendicular)$/, 'line.slope_perp'],
    [/geo\.(midpoint|midpoint_formula|perp_bisector)$/, 'line.perp_bisector'],
    [/geo\.(point_slope|general_form)$/, 'line.point_slope'],
    [/geo\.intersection/, 'line.intersection'],
  ];
  for (const s of steps) {
    const last = s.defs.at(-1);
    s.concept = LESSON_OF.find(([re]) => re.test(last))?.[1] || 'line.circumcenter';
  }

  const xs = [...pts.map((p) => p.x.value()), ox.value()];
  const ys = [...pts.map((p) => p.y.value()), oy.value()];
  const r = Math.sqrt(r2.value());
  const box = (vals, o, pad = 1) => [Math.floor(Math.min(...vals, o - r) - pad), Math.ceil(Math.max(...vals, o + r) + pad)];
  const diagram = {
    type: 'geometry',
    x: box(xs, ox.value(), 3), // 右邊多留空間放標籤
    y: box(ys, oy.value()),
    elements: [
      ...pts.map((p) => ({ kind: 'point', id: p.name, x: p.x.value(), y: p.y.value(), label: `${p.name}${ptText(p.x, p.y)}`, stage: 1 })),
      { kind: 'polygon', points: names, stage: 1 },
      { kind: 'line', equation: b1.equation, label: `${b1.side} 中垂線`, stage: 3 },
      { kind: 'line', equation: b2.equation, label: `${b2.side} 中垂線`, stage: 3 },
      { kind: 'point', id: 'O', x: ox.value(), y: oy.value(), label: `外心 O${center}`, stage: 4 },
      { kind: 'circle', center: 'O', through: A.name, label: '外接圓', stage: 4 },
    ],
  };

  const data = buildResult({
    problem: String(text).trim(),
    explicit: [...pts.map((p) => `${place} ${p.name} → 點 ${p.name}${ptText(p.x, p.y)}`), `要找的位置到三個${place}距離都相等`],
    implicit: [`「${place}」只是情境名詞，數學上就是點`, '到兩點等距 ⇔ 在這兩點連線段的中垂線上', '三點不在同一條直線上，才有外心'],
    concepts: [
      ['line.circumcenter', '到三點等距的位置就是外心，也就是三條中垂線的交點'],
      ['line.perp_bisector', `要先求 ${b1.side}、${b2.side} 的中垂線`],
      ['line.slope_perp', '中垂線和邊垂直，斜率相乘等於 −1'],
      ['line.point_slope', '知道中點和斜率，用點斜式寫出直線'],
      ['line.intersection', '兩條中垂線聯立求交點'],
    ],
    steps,
    diagram,
    answer: center,
    check: `${center} 到 ${names.join('、')} 的距離平方都是 ${fmt(r2)}；它也在 ${a}${c} 的中垂線上`,
  });
  return {
    data,
    goal: '求點的坐標或直線方程式',
    final: { q: hasSub ? "第 (2) 小題：所求位置的坐標是？" : '所求位置的坐標是？', type: 'point', value: `(${ox.plain()}, ${oy.plain()})` },
    subAnswers: { bisector: b1.equation, side: b1.side },
  };
}
