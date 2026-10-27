// 數值核心：在實數線上找定義域、所有根、正負分段與最值
// 掃描範圍 [-LIMIT, LIMIT]；高中題目的關鍵點幾乎都在這個範圍內。

import { identify } from './identify.js';

export const LIMIT = 1000;

/** 把數值找到的端點對齊精確值（例如 1e-17 → 0），再判斷端點本身有沒有定義 */
function snap(f, inside) {
  const id = identify(inside, 1e-7);
  const v = id && !id.approx ? id.value() : inside;
  const exact = Math.abs(v - inside) < 1e-6 * Math.max(1, Math.abs(v)) ? v : inside;
  return { at: exact, defined: ok(f(exact)), pt: ok(f(exact)) ? exact : inside };
}

function grid() {
  const pts = new Set();
  const add = (lo, hi, n) => {
    for (let i = 0; i <= n; i++) pts.add(Number((lo + ((hi - lo) * i) / n).toFixed(10)));
  };
  add(-10, 10, 4000);
  add(-100, 100, 2000);
  add(-LIMIT, LIMIT, 400);
  return [...pts].sort((a, b) => a - b);
}
const GRID = grid();

const ok = (v) => Number.isFinite(v);

function bisectDefined(f, a, b) {
  // a 有定義、b 沒定義，找交界
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2;
    if (m === a || m === b) break;
    if (ok(f(m))) a = m;
    else b = m;
  }
  return { inside: a, outside: b };
}

function bisectRoot(f, a, b) {
  let fa = f(a);
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    if (m === a || m === b) break;
    const fm = f(m);
    if (!ok(fm)) return null;
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(fa)) [a, fa] = [m, fm];
    else b = m;
  }
  return (a + b) / 2;
}

function goldenMin(g, a, b) {
  const r = (Math.sqrt(5) - 1) / 2;
  let c = b - r * (b - a);
  let d = a + r * (b - a);
  for (let i = 0; i < 120; i++) {
    if (g(c) < g(d)) b = d;
    else a = c;
    c = b - r * (b - a);
    d = a + r * (b - a);
  }
  return (a + b) / 2;
}

/** 定義域：回傳數個區段 [{ lo, hi, loOpen: 端點是否在定義域外, ... }]，lo/hi 可為 ±Infinity */
export function domainRuns(f) {
  const runs = [];
  let cur = null;
  for (let i = 0; i < GRID.length; i++) {
    const x = GRID[i];
    const defined = ok(f(x));
    if (defined && !cur) {
      if (i === 0) cur = { lo: -Infinity, loPt: null, loDef: false };
      else {
        const sn = snap(f, bisectDefined(f, x, GRID[i - 1]).inside);
        cur = { lo: sn.at, loPt: sn.pt, loDef: sn.defined };
      }
      cur.first = i;
    }
    if (!defined && cur) {
      const sn = snap(f, bisectDefined(f, GRID[i - 1], x).inside);
      cur.hi = sn.at;
      cur.hiPt = sn.pt;
      cur.hiDef = sn.defined;
      cur.last = i - 1;
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) {
    cur.hi = Infinity;
    cur.hiPt = null;
    cur.hiDef = false;
    cur.last = GRID.length - 1;
    runs.push(cur);
  }
  return runs;
}

/** 找 f 的所有實根（含重根），回傳由小到大的數值 */
export function findRoots(f) {
  const roots = [];
  const poles = [];
  const push = (arr, r) => {
    if (!arr.some((s) => Math.abs(s - r) < 1e-7 * Math.max(1, Math.abs(r)))) arr.push(r);
  };
  for (const run of domainRuns(f)) {
    const xs = GRID.slice(run.first, run.last + 1);
    if (run.loPt !== null) xs.unshift(run.loPt);
    if (run.hiPt !== null) xs.push(run.hiPt);
    const ys = xs.map(f);
    const scale = Math.max(1, ...ys.filter(ok).map(Math.abs).slice(0, 50));
    for (let i = 0; i < xs.length; i++) {
      if (ys[i] === 0) push(roots, xs[i]);
      if (i > 0 && ok(ys[i]) && ok(ys[i - 1]) && ys[i] * ys[i - 1] < 0) {
        const r = bisectRoot(f, xs[i - 1], xs[i]);
        if (r === null) continue;
        const fr = Math.abs(f(r));
        if (fr < 1e-6 * scale) push(roots, r);
        else push(poles, r); // 變號但值很大：斷點
      }
      // 碰到橫軸但不變號（重根）
      if (i > 0 && i < xs.length - 1) {
        const a = Math.abs(ys[i - 1]), b = Math.abs(ys[i]), c = Math.abs(ys[i + 1]);
        if (b <= a && b <= c && b < 1e-2 && ys[i - 1] * ys[i + 1] > 0) {
          const m = goldenMin((t) => Math.abs(f(t)), xs[i - 1], xs[i + 1]);
          if (Math.abs(f(m)) < 1e-11) push(roots, m);
        }
      }
    }
    // 定義域端點剛好是根
    for (const [e, def] of [[run.lo, run.loDef], [run.hi, run.hiDef]]) if (def && Math.abs(f(e)) < 1e-9) push(roots, e);
  }
  roots.sort((a, b) => a - b);
  poles.sort((a, b) => a - b);
  return { roots, poles };
}

/**
 * f(x) rel 0 的解：回傳區段 [{ lo, hi, loC, hiC }]（數值），以及分段測試紀錄
 * 端點分類：根、斷點、定義域端點
 */
export function signSolve(f, rel) {
  const holds = (v) => ({ '<': v < 0, '<=': v <= 0, '>': v > 0, '>=': v >= 0 })[rel];
  const strict = rel === '<' || rel === '>';
  const runs = domainRuns(f);
  const { roots, poles } = findRoots(f);
  const pieces = [];
  const tests = [];
  for (const run of runs) {
    const cuts = [...roots, ...poles].filter((r) => r > run.lo + 1e-12 && r < run.hi - 1e-12);
    const pts = [run.lo, ...cuts, run.hi];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const mid = !Number.isFinite(a) ? (Number.isFinite(b) ? b - 1 : 0) : !Number.isFinite(b) ? a + 1 : (a + b) / 2;
      const v = f(mid);
      tests.push({ lo: a, hi: b, at: mid, value: v });
      if (!holds(v)) continue;
      const endOk = (e) => Number.isFinite(e) && ok(f(e)) && holds(f(e)) && !poles.some((p) => Math.abs(p - e) < 1e-9);
      pieces.push({ lo: a, hi: b, loC: endOk(a), hiC: endOk(b) });
    }
    if (!strict) for (const r of roots) if (r >= run.lo && r <= run.hi) pieces.push({ lo: r, hi: r, loC: true, hiC: true });
  }
  return { pieces: mergePieces(pieces), roots, poles, runs, tests };
}

function mergePieces(ps) {
  const xs = ps.slice().sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const out = [];
  const eq = (a, b) => a === b || Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a));
  for (const p of xs) {
    const last = out[out.length - 1];
    if (last && (p.lo < last.hi - 1e-12 || (eq(p.lo, last.hi) && (p.loC || last.hiC)))) {
      if (p.hi > last.hi || eq(p.hi, last.hi)) {
        last.hiC = eq(p.hi, last.hi) ? last.hiC || p.hiC : p.hiC;
        last.hi = Math.max(last.hi, p.hi);
      }
      if (eq(p.lo, last.lo)) last.loC = last.loC || p.loC;
    } else out.push({ ...p });
  }
  return out;
}

/** 極值位置在平坦處只能找到約 1e-8 精度；若附近有簡單精確值且函數值一樣好，就用它 */
function snapExt(f, m) {
  const id = identify(m, 1e-6);
  if (!id || id.approx) return m;
  const v = id.value();
  return Math.abs(f(v) - f(m)) <= 1e-12 * Math.max(1, Math.abs(f(m))) ? v : m;
}

/**
 * 最值：在 [lo, hi]（可無限、可開閉）上找 f 的最大最小值
 * 回傳 { min: { value, at, attained } | null, max: ... }
 */
export function extrema(f, { lo = -Infinity, hi = Infinity, loC = false, hiC = false } = {}) {
  const runs = domainRuns(f).map((r) => ({ ...r, lo: Math.max(r.lo, lo), hi: Math.min(r.hi, hi) })).filter((r) => r.lo < r.hi);
  const cands = [];
  const sups = []; // 取不到的邊界值（極限）
  for (const run of runs) {
    const xs = GRID.filter((t) => t > run.lo && t < run.hi);
    const ys = xs.map(f);
    for (let i = 1; i < xs.length - 1; i++) {
      if (!ok(ys[i - 1]) || !ok(ys[i]) || !ok(ys[i + 1])) continue;
      if (ys[i] <= ys[i - 1] && ys[i] <= ys[i + 1]) {
        const m = snapExt(f, goldenMin(f, xs[i - 1], xs[i + 1]));
        cands.push({ at: m, value: f(m) });
      }
      if (ys[i] >= ys[i - 1] && ys[i] >= ys[i + 1]) {
        const m = snapExt(f, goldenMin((t) => -f(t), xs[i - 1], xs[i + 1]));
        cands.push({ at: m, value: f(m) });
      }
    }
    const loClosed = run.lo === lo ? loC && ok(f(lo)) : run.loDef;
    const hiClosed = run.hi === hi ? hiC && ok(f(hi)) : run.hiDef;
    for (const [e, closed] of [[run.lo, loClosed], [run.hi, hiClosed]]) {
      if (!Number.isFinite(e)) {
        const far = e > 0 ? LIMIT : -LIMIT;
        const near = e > 0 ? LIMIT / 2 : -LIMIT / 2;
        const vf = f(far), vn = f(near);
        // 往無限遠處持續變大或變小，代表沒有界
        if (ok(vf) && ok(vn)) sups.push({ value: Math.abs(vf - vn) > 1e-6 ? (vf > vn ? Infinity : -Infinity) : vf });
        continue;
      }
      const v = f(e);
      if (closed && ok(v)) cands.push({ at: e, value: v });
      else {
        const inner = e === run.lo ? e + 1e-9 : e - 1e-9;
        const vi = f(inner);
        sups.push({ value: ok(vi) ? (Math.abs(vi) > 1e8 ? (vi > 0 ? Infinity : -Infinity) : vi) : NaN });
      }
    }
  }
  const pick = (better) => {
    if (!cands.length) return null;
    const best = cands.reduce((m, c) => (better(c.value, m.value) ? c : m));
    const beaten = sups.some((s) => better(s.value, best.value));
    return { value: best.value, at: best.at, attained: !beaten };
  };
  return { min: pick((a, b) => a < b - 1e-12), max: pick((a, b) => a > b + 1e-12), runs };
}
