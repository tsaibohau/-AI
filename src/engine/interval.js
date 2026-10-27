// 精確端點的區間聯集：交集、聯集、格式化成答案或不等式敘述
import { NEG_INF, POS_INF } from './num.js';

const EPS = 1e-12;
const eqv = (a, b) => Math.abs(a.value() - b.value()) < EPS || a.value() === b.value();
const lt = (a, b) => !eqv(a, b) && a.value() < b.value();

export const iv = (lo, hi, loC = false, hiC = false) => ({
  lo, hi, loC: !lo.inf && loC, hiC: !hi.inf && hiC,
});
export const ALL = () => [iv(NEG_INF, POS_INF)];
export const point = (p) => [iv(p, p, true, true)];

function valid(x) {
  return lt(x.lo, x.hi) || (eqv(x.lo, x.hi) && x.loC && x.hiC && !x.lo.inf);
}

/** 排序並合併重疊或相接的區間 */
export function normalizeSet(list) {
  const xs = list.filter(valid).sort((a, b) => a.lo.value() - b.lo.value() || (b.loC ? 1 : 0) - (a.loC ? 1 : 0));
  const out = [];
  for (const x of xs) {
    const last = out[out.length - 1];
    const touches = last && (lt(x.lo, last.hi) || (eqv(x.lo, last.hi) && (x.loC || last.hiC)));
    if (!touches) {
      out.push({ ...x });
      continue;
    }
    if (lt(last.hi, x.hi)) [last.hi, last.hiC] = [x.hi, x.hiC];
    else if (eqv(last.hi, x.hi)) last.hiC = last.hiC || x.hiC;
  }
  return out;
}

export const union = (a, b) => normalizeSet([...a, ...b]);

export function intersect(a, b) {
  const out = [];
  for (const x of a) {
    for (const y of b) {
      let lo, loC, hi, hiC;
      if (eqv(x.lo, y.lo)) [lo, loC] = [x.lo, x.loC && y.loC];
      else [lo, loC] = lt(x.lo, y.lo) ? [y.lo, y.loC] : [x.lo, x.loC];
      if (eqv(x.hi, y.hi)) [hi, hiC] = [x.hi, x.hiC && y.hiC];
      else [hi, hiC] = lt(x.hi, y.hi) ? [x.hi, x.hiC] : [y.hi, y.hiC];
      out.push(iv(lo, hi, loC, hiC));
    }
  }
  return normalizeSet(out);
}

export const isAll = (s) => s.length === 1 && s[0].lo.inf === -1 && s[0].hi.inf === 1;
export const isPoint = (x) => eqv(x.lo, x.hi);

export function contains(set, v) {
  return set.some((x) => {
    const lo = x.lo.value(), hi = x.hi.value();
    return (v > lo || (x.loC && Math.abs(v - lo) < EPS)) && (v < hi || (x.hiC && Math.abs(v - hi) < EPS));
  });
}

/** 區間記號答案，例如 (−∞, −1) ∪ (3, ∞)；無解、所有實數另外處理 */
export function formatSet(set, v = 'x') {
  if (!set.length) return '無解';
  if (isAll(set)) return '所有實數';
  if (set.length === 1 && isPoint(set[0])) return `${v} = ${set[0].lo.pretty()}`;
  return set
    .map((x) => (isPoint(x) ? `{${x.lo.pretty()}}` : `${x.loC ? '[' : '('}${x.lo.pretty()}, ${x.hi.pretty()}${x.hiC ? ']' : ')'}`))
    .join(' ∪ ');
}

/** 不等式敘述，例如 −2 < x < 3、x < −1 或 x > 3 */
export function describeSet(set, v = 'x') {
  if (!set.length) return '沒有實數滿足';
  if (isAll(set)) return `${v} 為任意實數`;
  // 「只挖掉一點」寫成 x ≠ a
  if (set.length === 2 && set[0].lo.inf === -1 && set[1].hi.inf === 1 && eqv(set[0].hi, set[1].lo) && !set[0].hiC && !set[1].loC) {
    return `${v} ≠ ${set[0].hi.pretty()}`;
  }
  const one = (x) => {
    if (isPoint(x)) return `${v} = ${x.lo.pretty()}`;
    const l = x.loC ? '≤' : '<';
    const h = x.hiC ? '≤' : '<';
    if (x.lo.inf) return `${v} ${h} ${x.hi.pretty()}`;
    if (x.hi.inf) return `${v} ${x.loC ? '≥' : '>'} ${x.lo.pretty()}`;
    return `${x.lo.pretty()} ${l} ${v} ${h} ${x.hi.pretty()}`;
  };
  return set.map(one).join(' 或 ');
}

/** 在集合內（或外）挑一個好算的測試點：優先整數 */
export function pickPoint(set, inside = true) {
  const ends = set.flatMap((x) => [x.lo.value(), x.hi.value()]).filter(Number.isFinite);
  const center = ends.length ? Math.round(ends.reduce((a, b) => a + b, 0) / ends.length) : 0;
  for (let d = 0; d <= 30; d++) {
    for (const c of d ? [center + d, center - d] : [center]) {
      if (contains(set, c) === inside) return c;
    }
  }
  return null;
}
