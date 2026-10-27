// 二次函數題型：最值、頂點與對稱軸、限定區間最值、根與交點
import { Q } from '../num.js';
import { EngineError, mathPoly, prettyPoly, ueval } from '../poly.js';
import {
  buildResult, completingSquareStep, graphBox, mainPoly, prettyText, quadOf, rootSteps, subst, vertexOf,
} from '../common.js';

function fnName(an) {
  const m = an.main;
  if (m.kind === 'def') return m.name === 'y' ? 'y' : `${m.name}(${an.x})`;
  return `f(${an.x})`;
}

function wantOf(keys) {
  if (keys.extreme || (keys.min && keys.max)) return 'both';
  if (keys.max) return 'max';
  if (keys.min) return 'min';
  return 'both';
}
const WANT_TEXT = { min: '最小值', max: '最大值', both: '最大值與最小值' };

function openingFact(a) {
  return `二次項係數 ${a.pretty()} ${a.sign() > 0 ? '> 0，圖形開口向上' : '< 0，圖形開口向下'}`;
}

const curve = (p, x, name, stage = 2) => ({ kind: 'curve', expr: mathPoly(p, 'x'), label: `${name} = ${prettyPoly(p, x)}`, stage });
const pt = (x, y, role, label, stage) => ({ kind: 'point', x: x.value(), y: y.value(), role, label, stage });

/** 題型 1：求最大值或最小值（不限範圍） */
export function solveExtreme(an) {
  const { p } = quadOf(an);
  const x = an.x;
  const name = fnName(an);
  const want = wantOf(an.keys);
  const { a, h, k } = vertexOf(p);
  const up = a.sign() > 0;
  const steps = [completingSquareStep(p, x, name)];
  steps.push({
    step: `因為 (${x} − ${h.pretty()})² ≥ 0，所以 ${name} ${up ? '≥' : '≤'} ${k.pretty()}，等號在 ${x} = ${h.pretty()} 時成立`,
    reason: `平方一定 ≥ 0，乘上${up ? '正數' : '負數'} ${a.pretty()} 後${up ? '仍 ≥ 0' : '變成 ≤ 0'}`,
    expr: `${subst(p, h, x)} = ${k.plain()}`,
  });
  steps.push({
    step: up
      ? `最小值為 ${k.pretty()}（在 ${x} = ${h.pretty()} 時）；開口向上，${x} 往兩側時值無限變大，所以沒有最大值`
      : `最大值為 ${k.pretty()}（在 ${x} = ${h.pretty()} 時）；開口向下，${x} 往兩側時值無限變小，所以沒有最小值`,
    reason: '頂點是拋物線的最低點（開口向上）或最高點（開口向下）',
    expr: '',
  });
  const kv = k.pretty();
  let answer;
  if (want === 'both') answer = up ? `最小值 ${kv}，沒有最大值` : `最大值 ${kv}，沒有最小值`;
  else if ((want === 'min') === up) answer = kv;
  else answer = want === 'min' ? '沒有最小值' : '沒有最大值';
  const h1 = h.add(1);
  return buildResult({
    problem: `求 ${name} = ${prettyPoly(p, x)} 的${WANT_TEXT[want]}`,
    explicit: [`${name} = ${prettyPoly(p, x)}`],
    implicit: [`${x} 可以是任意實數（題目沒有限制範圍）`, openingFact(a)],
    concepts: [
      ['quad.opening', '開口方向決定有最小值還是最大值'],
      ['quad.completing_square', '配方成標準式，直接看出頂點'],
      ['quad.max_min', '頂點的函數值就是最值'],
    ],
    steps,
    diagram: {
      type: 'function_graph',
      ...graphBox(p, [h.value()]),
      elements: [curve(p, x, name), pt(h, k, 'vertex', `頂點 (${h.pretty()}, ${k.pretty()})`, 4)],
    },
    answer,
    check: `代回 ${x} = ${h.pretty()} 得 ${k.pretty()}；再取 ${x} = ${h1.pretty()} 得 ${ueval(p, h1).pretty()}，${up ? '比' : '比'} ${k.pretty()} ${up ? '大' : '小'}，符合${up ? '最小' : '最大'}值的判斷`,
    uncertain: an.uncertain,
  });
}

/** 題型 2：頂點與對稱軸 */
export function solveVertex(an) {
  const { p } = quadOf(an);
  const x = an.x;
  const name = fnName(an);
  const { a, h, k } = vertexOf(p);
  const wantV = an.keys.vertex || !an.keys.axis;
  const wantA = an.keys.axis;
  const steps = [
    completingSquareStep(p, x, name),
    {
      step: `標準式 a(${x} − h)² + k 的頂點是 (h, k)，所以頂點為 (${h.pretty()}, ${k.pretty()})，對稱軸為 ${x} = ${h.pretty()}`,
      reason: `(${x} − h)² 在 ${x} = h 時最小（等於 0），圖形對這條直線左右對稱`,
      expr: `${subst(p, h, x)} = ${k.plain()}`,
    },
  ];
  const vText = `(${h.pretty()}, ${k.pretty()})`;
  const aText = `${x} = ${h.pretty()}`;
  const answer = wantV && wantA ? `頂點 ${vText}，對稱軸 ${aText}` : wantA ? aText : vText;
  const h1 = h.sub(1);
  const h2 = h.add(1);
  return buildResult({
    problem: `求 ${name} = ${prettyPoly(p, x)} 的${wantV && wantA ? '頂點與對稱軸' : wantA ? '對稱軸' : '頂點'}`,
    explicit: [`${name} = ${prettyPoly(p, x)}`],
    implicit: [openingFact(a)],
    concepts: [
      ['quad.completing_square', '配方成標準式'],
      ['quad.vertex_axis', '由標準式讀出頂點與對稱軸'],
    ],
    steps,
    diagram: {
      type: 'function_graph',
      ...graphBox(p, [h.value()]),
      elements: [curve(p, x, name), pt(h, k, 'vertex', `頂點 ${vText}`, 4)],
    },
    answer,
    check: `對稱性檢查：${x} = ${h1.pretty()} 與 ${x} = ${h2.pretty()} 的函數值都是 ${ueval(p, h1).pretty()}，左右相等`,
    uncertain: an.uncertain,
  });
}

/** 題型 3：限定區間上的最值 */
export function solveRangeExtreme(an) {
  const { p } = quadOf(an);
  const r = an.range;
  if (!r) throw new EngineError('找不到範圍限制，例如 1 ≤ x ≤ 4');
  if (r.lo.cmp(r.hi) >= 0) throw new EngineError('範圍的下界要小於上界');
  const x = an.x;
  const name = fnName(an);
  const want = wantOf(an.keys);
  const { a, h, k } = vertexOf(p);
  const rangeText = `${r.lo.pretty()} ${r.loC ? '≤' : '<'} ${x} ${r.hiC ? '≤' : '<'} ${r.hi.pretty()}`;
  const inside = h.cmp(r.lo) > 0 && h.cmp(r.hi) < 0;
  const fl = ueval(p, r.lo);
  const fh = ueval(p, r.hi);
  const steps = [completingSquareStep(p, x, name)];
  steps.push({
    step: `頂點的 ${x} = ${h.pretty()}，${inside ? '在' : '不在'}範圍 ${rangeText} ${inside ? '內' : '的內部'}`,
    reason: '最值只可能出現在頂點（若在範圍內）或範圍的兩端',
    expr: '',
  });
  steps.push({
    step: `計算兩端：${x} = ${r.lo.pretty()} 時為 ${fl.pretty()}${r.loC ? '' : '（端點取不到）'}`,
    reason: '端點的函數值是最值的候選',
    expr: `${subst(p, r.lo, x)} = ${fl.plain()}`,
  });
  steps.push({
    step: `${x} = ${r.hi.pretty()} 時為 ${fh.pretty()}${r.hiC ? '' : '（端點取不到）'}`,
    reason: '另一端也要算',
    expr: `${subst(p, r.hi, x)} = ${fh.plain()}`,
  });
  const cands = [
    { x: r.lo, v: fl, ok: r.loC },
    { x: r.hi, v: fh, ok: r.hiC },
  ];
  if (inside) cands.push({ x: h, v: k, ok: true });
  const pick = (better) => {
    const best = cands.reduce((m, c) => (better(c.v, m.v) ? c : m));
    const attained = cands.filter((c) => c.v.eq(best.v) && c.ok);
    return attained.length ? { v: best.v, at: attained.map((c) => c.x) } : null;
  };
  const mx = pick((u, w) => u.cmp(w) > 0);
  const mn = pick((u, w) => u.cmp(w) < 0);
  const fmt = (res, label) =>
    res ? `${label}為 ${res.v.pretty()}（${x} = ${res.at.map((t) => t.pretty()).join(' 或 ')}）` : `沒有${label}（會無限接近端點值但取不到）`;
  steps.push({
    step: `比較候選值：${fmt(mx, '最大值')}；${fmt(mn, '最小值')}`,
    reason: `把${inside ? '頂點與' : ''}兩端的值放在一起比大小`,
    expr: '',
  });
  const one = (res, label) => (res ? res.v.pretty() : `沒有${label}`);
  const answer =
    want === 'both' ? `最大值 ${one(mx, '最大值')}，最小值 ${one(mn, '最小值')}` : want === 'max' ? one(mx, '最大值') : one(mn, '最小值');
  const pts = [pt(r.lo, fl, 'other', `${x} = ${r.lo.pretty()}`, 2), pt(r.hi, fh, 'other', `${x} = ${r.hi.pretty()}`, 2)];
  if (inside) pts.push(pt(h, k, 'vertex', `頂點 (${h.pretty()}, ${k.pretty()})`, 3));
  return buildResult({
    problem: `在 ${rangeText} 時，求 ${name} = ${prettyPoly(p, x)} 的${WANT_TEXT[want]}`,
    explicit: [`${name} = ${prettyPoly(p, x)}`, `範圍 ${rangeText}`],
    implicit: [openingFact(a), '頂點不一定在範圍內，要先檢查'],
    concepts: [
      ['quad.completing_square', '配方找出頂點'],
      ['quad.vertex_axis', '判斷頂點是否落在範圍內'],
      ['quad.max_min_interval', '限定範圍時比較頂點與端點'],
    ],
    steps,
    diagram: { type: 'function_graph', ...graphBox(p, [r.lo.value(), r.hi.value(), h.value()]), elements: [curve(p, x, name), ...pts] },
    answer,
    check: `在範圍內任取 ${x} = ${r.lo.add(r.hi).div(2).pretty()}，函數值 ${ueval(p, r.lo.add(r.hi).div(2)).pretty()} 介於最小與最大之間`,
    uncertain: an.uncertain,
  });
}

/** 題型 4：根、與 x 軸交點、實根個數 */
export function solveRoots(an) {
  const { p, rhs } = quadOf(an);
  const x = an.x;
  const name = fnName(an);
  const mode = an.keys.count || an.keys.discriminant ? 'count' : an.keys.intersect ? 'intersect' : 'equation';
  const steps = [];
  const m = an.main;
  if (m.kind === 'rel' && rhs && !(rhs.length === 1 && rhs[0].isZero())) {
    steps.push({
      step: `移項，讓右邊為 0：${prettyPoly(p, x)} = 0`,
      reason: '整理成 a' + x + '² + b' + x + ' + c = 0 的標準形式',
      expr: '',
    });
  } else if (m.kind !== 'rel') {
    steps.push({
      step: `與 ${x} 軸的交點就是函數值為 0 的地方：令 ${prettyPoly(p, x)} = 0`,
      reason: `${x} 軸上的點縱坐標都是 0`,
      expr: '',
    });
  }
  const rs = rootSteps(p, x, { showDisc: mode === 'count' });
  steps.push(...rs.steps);
  const roots = rs.roots;
  const list = roots.map((r) => r.pretty());
  let answer;
  if (mode === 'count') answer = String(roots.length);
  else if (mode === 'intersect') answer = roots.length ? roots.map((r) => `(${r.pretty()}, 0)`).join('、') : '沒有交點';
  else answer = roots.length ? `{${list.join(', ')}}` : '無實數解';
  if (!roots.length) steps.push({ step: '判別式小於 0，沒有實數解', reason: '平方根內是負數，沒有實數', expr: '' });
  const concepts = [...rs.concepts];
  concepts.push(['quad.discriminant', '判斷實根個數']);
  if (mode === 'intersect') concepts.push(['quad.intercepts', '圖形與 x 軸交點就是方程式的實根']);
  const problem =
    mode === 'count'
      ? `判斷 ${prettyPoly(p, x)} = 0 有幾個相異實根`
      : mode === 'intersect'
        ? `求 ${name} = ${prettyPoly(p, x)} 的圖形與 ${x} 軸的交點`
        : `解方程式 ${prettyPoly(p, x)} = 0`;
  const rat = roots.filter((r) => r.isRational());
  return buildResult({
    problem,
    explicit: [m.kind === 'rel' ? prettyText(`${m.lhs}=${m.rhs}`) : `${name} = ${prettyPoly(p, x)}`],
    implicit: [`${x} 是實數，所以只找實數解`],
    concepts,
    steps,
    diagram: {
      type: 'function_graph',
      ...graphBox(p, [vertexOf(p).h.value(), ...roots.map((r) => r.value())]),
      elements: [
        { kind: 'curve', expr: mathPoly(p, 'x'), label: `y = ${prettyPoly(p, x)}`, stage: 2 },
        ...roots.map((r) => ({ kind: 'point', x: r.value(), y: 0, role: 'root', label: r.pretty(), stage: 4 })),
      ],
    },
    answer,
    check: roots.length
      ? rat.length
        ? rat.map((r) => `代入 ${x} = ${r.pretty()}：${prettyPoly(p, x).replaceAll(x, `(${r.pretty()})`)} = ${ueval(p, r.toQ()).pretty()} ✓`).join('；')
        : '把兩根代回原式，化簡後都等於 0；或用根與係數關係：兩根和 = −b/a、兩根積 = c/a'
      : `判別式 ${rs.disc.pretty()} < 0，再次確認沒有實根`,
    uncertain: an.uncertain,
  });
}

export { Q };
