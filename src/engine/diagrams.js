// 沒有變數的求值題也要有圖：對數畫成指數函數上的點，其他數值畫在數線上
import { compile, containsVar, logInfo, pretty } from './general/ast.js';
import { identify } from './general/identify.js';

// 圖上的標籤用好讀的數：分數、根號照寫，對數或無法化簡的寫成約略的小數
const show = (v) => {
  const id = identify(v);
  const p = id && !id.approx ? id.pretty() : null;
  return p && !/log|ln/.test(p) ? p : `≈ ${String(Math.round(v * 1000) / 1000).replace('-', '−')}`;
};
const anyVar = (n) => ['x', 'k', 't'].some((v) => containsVar(n, v));

/**
 * 對數求值的圖：log_b(a) = c 等於「y = bˣ 的圖上，y = a 的那一點 x = c」
 * 沒有對數時，把結果畫在數線上。
 */
export function evaluateDiagram(node, value) {
  const logs = [];
  node.traverse((n) => {
    const li = logInfo(n);
    if (li && typeof li.base === 'number' && li.base > 0 && li.base !== 1 && !anyVar(n)) {
      const a = compile(li.arg)({});
      const c = Math.log(a) / Math.log(li.base);
      if (Number.isFinite(c) && a > 0) logs.push({ b: li.base, a, c, text: pretty(n) });
    }
  });
  if (logs.length) {
    const b = logs[0].b;
    const same = logs.filter((l) => Math.abs(l.b - b) < 1e-12);
    const cs = same.map((l) => l.c);
    const lo = Math.floor(Math.min(-2, ...cs)) - 1;
    const hi = Math.ceil(Math.max(2, ...cs)) + 2;
    const yMax = Math.max(4, ...same.map((l) => l.a)) * 1.15;
    const baseText = b === Math.E ? 'e' : String(b);
    return {
      type: 'function_graph',
      x: [lo, hi],
      y: [-1, Math.round(Math.min(yMax, 1e4) * 100) / 100],
      elements: [
        { kind: 'curve', expr: b === Math.E ? 'e^x' : `${b}^x`, label: `y = ${baseText}^x`, stage: 2 },
        ...same.map((l) => ({ kind: 'point', x: l.c, y: l.a, role: 'other', label: `${l.text} ${show(l.c).startsWith('≈') ? show(l.c) : `= ${show(l.c)}`}`, stage: 3 })),
      ],
    };
  }
  if (!Number.isFinite(value)) return null;
  const v = Math.max(-1e4, Math.min(1e4, value));
  return {
    type: 'number_line',
    x: [Math.floor(Math.min(0, v)) - 2, Math.ceil(Math.max(0, v)) + 2],
    elements: [{ kind: 'point', x: v, closed: true, label: show(value), stage: 4 }],
  };
}
