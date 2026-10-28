// 圖解渲染器（JSXGraph）：只畫白名單內、已驗證過的元素；元素依階段顯示或隱藏，不必重畫
import { validateDiagram, describeDiagram } from '../core/diagram.js';
import { parseText } from '../engine/poly.js';
import { compile } from '../engine/general/ast.js';
import { signSolve } from '../engine/general/numeric.js';
import '../../node_modules/jsxgraph/distrib/jsxgraph.css';

let jxgPromise = null;
const loadJXG = () => (jxgPromise ||= import('jsxgraph').then((m) => m.default || m.JXG || m));

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function colors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, d) => cs.getPropertyValue(n).trim() || d;
  return { accent: v('--accent', '#2b5fab'), ok: v('--ok', '#1e7a3c'), warn: v('--warn', '#a15c00'), bad: v('--bad', '#b3261e'), fg: v('--fg', '#1d2330'), muted: v('--muted', '#5b6475'), card: v('--card', '#fff') };
}

const ROLE_COLOR = (c) => ({ vertex: c.bad, root: c.ok, intercept: c.warn, other: c.fg });
let uid = 0;

/** 純文字退回 */
function textFallback(lines, note) {
  return `${note ? `<p class="mini">${esc(note)}</p>` : ''}${lines.length ? `<ul class="mini">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}`;
}

/**
 * 建立圖解卡片。回傳 { el, setVisible(pred), caption(text) }
 * pred(element) 決定元素是否在目前階段出現
 */
export function createDiagram(rawSpec) {
  const el = document.createElement('article');
  el.className = 'card diagram';
  const v = validateDiagram(rawSpec);
  if (v.ok && !v.spec) return null; // 這題沒有圖
  const spec = v.ok ? v.spec : null;
  const id = `jxg-${++uid}`;
  el.innerHTML = `<div class="diag-head"><h2>圖解</h2><button type="button" class="link small diag-toggle" aria-expanded="true">收起</button></div><div class="diag-body"><p class="mini cap"></p>
    ${spec ? `<div id="${id}" class="jxgbox board ${spec.type}"></div>` : ''}
    <div class="fallback"></div>
    ${spec ? '<details class="expr"><summary>圖上有什麼（文字說明）</summary><div class="desc"></div></details>' : ''}</div>`;
  const toggle = el.querySelector('.diag-toggle');
  toggle.addEventListener('click', () => {
    const hide = !el.classList.contains('collapsed');
    el.classList.toggle('collapsed', hide);
    toggle.textContent = hide ? '展開圖解' : '收起';
    toggle.setAttribute('aria-expanded', String(!hide));
  });
  const fallback = el.querySelector('.fallback');
  const desc = el.querySelector('.desc');
  let pred = () => true;
  let objs = []; // [{ stage, el: JSXGraph 物件, kind }]

  const updateDesc = () => {
    if (desc) desc.innerHTML = textFallback(describeDiagram(spec, (e) => pred(e)));
  };

  if (!spec) {
    // 規格不合法：退回純文字，不畫圖
    fallback.innerHTML = textFallback([], `這題的圖解無法顯示（${v.error}），請依照文字步驟作圖。`);
  } else {
    loadJXG()
      .then((JXG) => {
        objs = draw(JXG, id, spec);
        apply();
      })
      .catch(() => {
        el.querySelector('.board')?.remove();
        fallback.innerHTML = textFallback(describeDiagram(spec, pred), '圖解元件載入失敗，改用文字說明：');
      });
  }

  function apply() {
    for (const o of objs) {
      const vis = pred(o.spec);
      for (const x of o.els) x.setAttribute({ visible: vis });
    }
    updateDesc();
  }

  return {
    el,
    setVisible(p) {
      pred = p;
      apply();
    },
    caption(text) {
      el.querySelector('.cap').textContent = text;
    },
  };
}

function draw(JXG, id, spec) {
  const c = colors();
  const [x0, x1] = spec.x;
  const out = [];
  if (spec.type === 'number_line') return drawNumberLine(JXG, id, spec, c);
  const [y0, y1] = spec.y;
  const board = JXG.JSXGraph.initBoard(id, {
    boundingbox: [x0, y1, x1, y0],
    axis: true,
    keepAspectRatio: spec.type === 'geometry',
    showCopyright: false,
    showNavigation: false,
    pan: { enabled: false },
    zoom: { enabled: false },
    defaultAxes: { x: { strokeColor: c.muted, ticks: { strokeColor: c.muted, label: { strokeColor: c.muted } } }, y: { strokeColor: c.muted, ticks: { strokeColor: c.muted, label: { strokeColor: c.muted } } } },
  });
  const labelOpt = { display: 'internal', strokeColor: c.fg, fontSize: 13, offset: [6, 8] };

  if (spec.type === 'function_graph') {
    for (const e of spec.elements) {
      if (e.kind === 'curve') {
        const f = compile(parseText(e.expr));
        const g = board.create('functiongraph', [(t) => f({ x: t }), x0, x1], { strokeColor: c.accent, strokeWidth: 2.5, highlight: false });
        out.push({ spec: e, els: [g] });
      } else if (e.kind === 'point') {
        const color = ROLE_COLOR(c)[e.role];
        // 靠近右邊界的點，標籤改放在左邊，才不會被切掉
        const nearRight = e.x > x0 + (x1 - x0) * 0.7;
        const lab = nearRight ? { ...labelOpt, anchorX: 'right', offset: [-8, 10] } : labelOpt;
        const p = board.create('point', [e.x, e.y], { fixed: true, size: 3.5, name: esc(e.label), strokeColor: color, fillColor: color, highlight: false, withLabel: !!e.label, label: lab });
        out.push({ spec: e, els: [p] });
      } else if (e.kind === 'shade') {
        out.push({ spec: e, els: drawShade(board, e, spec, c) });
      }
    }
  } else if (spec.type === 'geometry') {
    const pts = {};
    for (const e of spec.elements.filter((x) => x.kind === 'point')) {
      pts[e.id] = board.create('point', [e.x, e.y], { fixed: true, size: 3, name: esc(e.label), strokeColor: c.fg, fillColor: c.fg, highlight: false, label: labelOpt });
      out.push({ spec: e, els: [pts[e.id]] });
    }
    for (const e of spec.elements) {
      if (e.kind === 'segment') {
        const s = board.create('segment', [pts[e.from], pts[e.to]], { strokeColor: c.accent, strokeWidth: 2.5, highlight: false, name: esc(e.label), withLabel: !!e.label, label: labelOpt });
        out.push({ spec: e, els: [s] });
      } else if (e.kind === 'circle') {
        const cc = board.create('circle', e.through ? [pts[e.center], pts[e.through]] : [pts[e.center], e.radius], { strokeColor: c.ok, strokeWidth: 2, fillOpacity: 0, highlight: false });
        out.push({ spec: e, els: [cc] });
      } else if (e.kind === 'angle') {
        const [a, b, d] = e.points.map((p) => pts[p]);
        const an = board.create('angle', [a, b, d], { radius: Math.max(0.4, (x1 - x0) / 12), fillColor: c.warn, fillOpacity: 0.25, strokeColor: c.warn, highlight: false, name: esc(e.label), withLabel: !!e.label, label: labelOpt });
        out.push({ spec: e, els: [an] });
      }
    }
  }
  return out;
}

/** 把函數值符合條件的範圍著色：曲線與 x 軸之間填色，x 軸上加粗並標出端點 */
function drawShade(board, e, spec, c) {
  const f = compile(parseText(e.expr));
  const g = (t) => f({ x: t });
  const [x0, x1] = spec.x;
  const [y0, y1] = spec.y;
  const rel = e.sign.replace('0', '');
  const { pieces } = signSolve(g, rel);
  const els = [];
  for (const p of pieces) {
    const a = Math.max(p.lo, x0);
    const b = Math.min(p.hi, x1);
    if (!(b >= a)) continue;
    if (b > a) {
      const xs = [];
      const ys = [];
      const n = 80;
      for (let i = 0; i <= n; i++) {
        const t = a + ((b - a) * i) / n;
        const v = g(t);
        if (!Number.isFinite(v)) continue;
        xs.push(t);
        ys.push(Math.max(y0, Math.min(y1, v)));
      }
      if (xs.length) {
        xs.push(xs[xs.length - 1], xs[0]);
        ys.push(0, 0);
        els.push(board.create('curve', [xs, ys], { fillColor: c.ok, fillOpacity: 0.18, strokeWidth: 0, highlight: false }));
      }
      els.push(board.create('segment', [[a, 0], [b, 0]], { strokeColor: c.ok, strokeWidth: 6, highlight: false, fixed: true }));
    }
    for (const [x, closed, inView] of [[p.lo, p.loC, p.lo >= x0], [p.hi, p.hiC, p.hi <= x1]]) {
      if (!Number.isFinite(x) || !inView) continue;
      els.push(board.create('point', [x, 0], { fixed: true, size: 4, name: '', withLabel: false, strokeColor: c.ok, fillColor: closed ? c.ok : c.card, highlight: false }));
    }
  }
  return els;
}

function drawNumberLine(JXG, id, spec, c) {
  const [x0, x1] = spec.x;
  const board = JXG.JSXGraph.initBoard(id, {
    boundingbox: [x0, 1, x1, -1],
    axis: false,
    showCopyright: false,
    showNavigation: false,
    pan: { enabled: false },
    zoom: { enabled: false },
  });
  board.create('axis', [[0, 0], [1, 0]], { strokeColor: c.muted, ticks: { strokeColor: c.muted, insertTicks: false, ticksDistance: 1, minorTicks: 0, label: { strokeColor: c.muted } } });
  // 不同階段的區間分層畫：最後階段在數線上，較早的（例如定義域）畫在上方
  const stages = [...new Set(spec.elements.filter((e) => e.kind === 'interval').map((e) => e.stage))].sort((a, b) => b - a);
  const yOf = (st) => 0.38 * stages.indexOf(st);
  const out = [];
  for (const e of spec.elements) {
    if (e.kind === 'interval') {
      const y = yOf(e.stage);
      const latest = stages.indexOf(e.stage) === 0;
      const color = latest ? c.accent : c.muted;
      const a = Math.max(e.from, x0);
      const b = Math.min(e.to, x1);
      const els = [];
      if (b > a) els.push(board.create('segment', [[a, y], [b, y]], { strokeColor: color, strokeWidth: latest ? 6 : 4, highlight: false, fixed: true, firstArrow: e.from < x0, lastArrow: e.to > x1 }));
      for (const [x, closed] of [[e.from, e.closedFrom], [e.to, e.closedTo]]) {
        if (!Number.isFinite(x) || x < x0 || x > x1) continue;
        els.push(board.create('point', [x, y], { fixed: true, size: 4.5, withLabel: false, name: '', strokeColor: color, fillColor: closed ? color : c.card, highlight: false }));
      }
      if (b === a && Number.isFinite(a)) els.push(board.create('point', [a, y], { fixed: true, size: 4.5, withLabel: false, name: '', strokeColor: color, fillColor: color }));
      out.push({ spec: e, els });
    } else if (e.kind === 'point') {
      const p = board.create('point', [e.x, 0], {
        fixed: true,
        size: 4.5,
        name: esc(e.label),
        strokeColor: e.closed ? c.ok : c.bad,
        fillColor: e.closed ? c.ok : c.card,
        highlight: false,
        label: { display: 'internal', strokeColor: e.closed ? c.ok : c.bad, fontSize: 13, offset: [-10, -18] },
      });
      out.push({ spec: e, els: [p] });
    }
  }
  return out;
}
