// 二次不等式題型：解不等式、恆成立求參數範圍
import { Q } from '../num.js';
import { EngineError, deg, mathPoly, prettyPoly, uadd, ueval, umul, uscale } from '../poly.js';
import { ALL, contains, formatSet, intersect, pickPoint, point, union, describeSet } from '../interval.js';
import { REL_PRETTY, buildResult, graphBox, holds, mainPoly, prettyText, quadOf, solveIneq, vertexOf } from '../common.js';

const INEQ = ['<', '<=', '>', '>='];

/** 題型 5：解二次不等式 */
export function solveQuadIneq(an) {
  const m = an.main;
  if (m.kind !== 'rel' || !INEQ.includes(m.op)) throw new EngineError('找不到不等式，例如 x² − x − 6 < 0');
  const { p, rhs } = quadOf(an);
  const x = an.x;
  const rel = m.op;
  const steps = [];
  if (rhs && !(rhs.length === 1 && rhs[0].isZero())) {
    steps.push({ step: `移項，讓右邊為 0：${prettyPoly(p, x)} ${REL_PRETTY[rel]} 0`, reason: '和 0 比較才能用拋物線與橫軸的位置判斷', expr: '' });
  }
  const sol = solveIneq(p, rel, x);
  steps.push(...sol.steps);
  const set = sol.set;
  const concepts = [...sol.concepts, ['base.interval_notation', '把解寫成區間']];
  const { h } = vertexOf(p);
  const roots = quadRootsFor(p);
  const inPt = pickPoint(set, true);
  const outPt = pickPoint(set, false);
  const val = (t) => ueval(p, new Q(BigInt(t)));
  const checks = [];
  if (inPt !== null) checks.push(`取 ${x} = ${inPt}（在解內）：${val(inPt).pretty()} ${holds(val(inPt).sign(), rel) ? REL_PRETTY[rel] + ' 0 ✓' : '不成立 ✗'}`);
  if (outPt !== null) checks.push(`取 ${x} = ${outPt}（不在解內）：${val(outPt).pretty()}，不滿足 ${REL_PRETTY[rel]} 0 ✓`);
  return buildResult({
    problem: `找出所有使 ${prettyText(`${m.lhs}${m.op}${m.rhs}`)} 成立的實數 ${x}`,
    explicit: [`不等式 ${prettyText(`${m.lhs}${m.op}${m.rhs}`)}`],
    implicit: [`${x} 是實數`, p[2].sign() < 0 ? '二次項係數為負，乘以 −1 時不等號要反向' : '二次項係數為正，拋物線開口向上'],
    concepts,
    steps,
    diagram: {
      type: 'function_graph',
      ...graphBox(p, [h.value(), ...roots]),
      elements: [
        { kind: 'curve', expr: mathPoly(p, 'x'), label: `y = ${prettyPoly(p, x)}`, stage: 2 },
        ...roots.map((r) => ({ kind: 'point', x: r, y: 0, role: 'root', label: String(Math.round(r * 100) / 100), stage: 4 })),
        { kind: 'shade', expr: mathPoly(p, 'x'), sign: `${rel}0`, stage: 4 },
      ],
    },
    answer: formatSet(set, x),
    check: checks.join('；') || '解集合為全體實數或空集合，可任取一數代入確認',
    uncertain: an.uncertain,
  });
}

function quadRootsFor(p) {
  const [c, b, a] = p.map((q) => q.value());
  const D = b * b - 4 * a * c;
  if (D < 0) return [];
  const s = Math.sqrt(D);
  return [...new Set([(-b - s) / (2 * a), (-b + s) / (2 * a)])].sort((u, v) => u - v);
}

/** 題型 6：恆成立，求參數範圍 */
export function solveAlwaysTrue(an) {
  const m = an.main;
  const k = an.param;
  const x = an.x;
  if (!k) throw new EngineError('找不到參數（例如 k），這題可能不是「恆成立求範圍」');
  if (m.kind !== 'rel' || !INEQ.includes(m.op)) throw new EngineError('找不到不等式，例如 x² + 2kx + 3 > 0');
  const { poly } = mainPoly(an);
  if (poly.degreeIn(x) !== 2) throw new EngineError(`${x} 的最高次方不是 2，目前只支援二次式`);
  const [C, B, A] = poly.coeffsIn(x, k);
  const rel = m.op;
  const strict = rel === '<' || rel === '>';
  const upward = rel === '>' || rel === '>=';
  if (deg(A) > 1) throw new EngineError('二次項係數是參數的二次以上式子，目前不支援');
  const D = uadd(umul(B, B), uscale(umul(A, C), -4));
  if (deg(D) > 2) throw new EngineError('判別式是參數的三次以上式子，目前不支援');

  const ineqText = prettyText(`${m.lhs}${m.op}${m.rhs}`);
  const steps = [];
  const concepts = [
    ['qineq.always_true', '恆成立等於圖形整段在橫軸的同一側'],
    ['quad.opening', '開口方向要配合不等號方向'],
    ['quad.discriminant', '與橫軸沒有交點（或只碰一點）用判別式表示'],
    ['qineq.parameter', '把條件轉成參數的不等式來解'],
  ];
  const aRel = upward ? '>' : '<';
  const dRel = strict ? '<' : '<=';
  steps.push({
    step: `「對所有實數 ${x} 都成立」代表拋物線整段在橫軸${upward ? '上方' : '下方'}${strict ? '' : '（可以碰到橫軸）'}：需要 a ${REL_PRETTY[aRel]} 0 且 D ${REL_PRETTY[dRel]} 0`,
    reason: `開口${upward ? '向上' : '向下'}才不會往${upward ? '下' : '上'}穿過橫軸；D ${REL_PRETTY[dRel]} 0 代表與橫軸${strict ? '沒有交點' : '最多碰一點'}`,
    expr: '',
  });

  // 條件一：二次項係數
  let aSet;
  let degenerate = [];
  const aText = prettyPoly(A, k);
  if (deg(A) <= 0) {
    const ok = holds(A[0].sign(), aRel);
    steps.push({ step: `二次項係數 a = ${aText} ${ok ? REL_PRETTY[aRel] : (aRel === '>' ? '<' : '>')} 0，${ok ? '開口條件已經滿足' : '開口方向不對，不可能恆成立'}`, reason: '看二次項係數的正負', expr: '' });
    aSet = ok ? ALL() : [];
  } else {
    // a 是 k 的一次式：先討論 a = 0
    const k0 = A[0].neg().div(A[1]);
    const lin = poly.coeffsIn(x, k).map((c) => ueval(c, k0));
    const bOk = lin[1].isZero() && holds(lin[0].sign(), rel);
    steps.push({
      step: `先討論 a = 0，也就是 ${k} = ${k0.pretty()}：式子變成 ${prettyPoly(lin.slice(0, 2), x)} ${REL_PRETTY[rel]} 0，${bOk ? '對所有實數成立' : '不會對所有實數都成立'}`,
      reason: '二次項係數為 0 時就不是二次式，要另外檢查',
      expr: '',
    });
    if (bOk) degenerate = point(k0);
    const sa = solveIneq(A, aRel, k);
    steps.push({ step: `a ≠ 0 時需 ${aText} ${REL_PRETTY[aRel]} 0`, reason: '開口方向條件', expr: '' }, ...sa.steps);
    aSet = sa.set;
  }

  // 條件二：判別式
  const bMath = mathPoly(B, k);
  const aMath = mathPoly(A, k);
  const cMath = mathPoly(C, k);
  steps.push({
    step: `判別式 D = b² − 4ac = (${prettyPoly(B, k)})² − 4(${aText})(${prettyPoly(C, k)}) = ${prettyPoly(D, k)}`,
    reason: '把係數代入判別式，得到參數的式子',
    expr: `(${bMath})^2 - 4*(${aMath})*(${cMath}) = ${mathPoly(D, k)}`,
  });
  steps.push({ step: `解 ${prettyPoly(D, k)} ${REL_PRETTY[dRel]} 0`, reason: '判別式條件', expr: '' });
  const sd = solveIneq(D, dRel, k);
  steps.push(...sd.steps);
  sd.concepts.forEach((why, id) => concepts.push([id, why]));

  const set = union(intersect(aSet, sd.set), degenerate);
  steps.push({
    step: `兩個條件同時成立${degenerate.length ? `，再加上 ${k} = ${degenerate[0].lo.pretty()}` : ''}：${describeSet(set, k)}`,
    reason: '恆成立需要所有條件都滿足，取交集',
    expr: '',
  });

  const inK = pickPoint(set, true);
  const outK = pickPoint(set, false);
  const dAt = (t) => ueval(D, new Q(BigInt(t)));
  const checks = [];
  if (inK !== null) checks.push(`取 ${k} = ${inK}（在範圍內）：判別式 = ${dAt(inK).pretty()}，符合`);
  if (outK !== null) checks.push(`取 ${k} = ${outK}（不在範圍內）：判別式 = ${dAt(outK).pretty()}${deg(A) > 0 ? `、a = ${ueval(A, new Q(BigInt(outK))).pretty()}` : ''}，不符合恆成立`);

  const ends = set.flatMap((s) => [s.lo.value(), s.hi.value()]).filter(Number.isFinite);
  const lo = Math.floor(Math.min(0, ...ends)) - 2;
  const hi = Math.ceil(Math.max(0, ...ends)) + 2;
  return buildResult({
    problem: `求 ${k} 的範圍，使 ${ineqText} 對所有實數 ${x} 都成立`,
    explicit: [`不等式 ${ineqText}`, `對所有實數 ${x} 都成立`],
    implicit: [`${k} 是實數`, `二次項係數 ${aText} 的正負決定開口方向`],
    concepts,
    steps,
    diagram: {
      type: 'number_line',
      x: [lo, hi],
      elements: set.map((s) => ({
        kind: 'interval',
        from: s.lo.inf ? '-inf' : s.lo.value(),
        to: s.hi.inf ? 'inf' : s.hi.value(),
        closedFrom: s.loC,
        closedTo: s.hiC,
        stage: 4,
      })),
    },
    answer: formatSet(set, k),
    check: checks.join('；') || '可任取範圍內外的值代入判別式確認',
    uncertain: an.uncertain,
  });
}
