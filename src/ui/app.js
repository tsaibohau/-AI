// 主畫面：輸入題目 → 四階段逐步提示 → 最後才看答案；解不出來時進入引導思考模式
import concepts from '../../data/concepts.json';
import { solve, TYPES, GENERAL } from '../engine/index.js';
import { toolEvaluate, toolRoots } from '../engine/tools.js';
import { recordUnsolved, listUnsolved, clearUnsolved, downloadJson } from './storage.js';

const CONCEPT_NAME = new Map(concepts.concepts.map((c) => [c.id, c.name]));

const KEYS = [
  ['x²', 'x²'], ['²', '²'], ['³', '³'], ['^', '^'], ['√', '√('], ['π', 'π'],
  ['log', 'log('], ['logₐ', 'log_'], ['ln', 'ln('], ['(', '('], [')', ')'], ['/', '/'],
  ['≤', ' ≤ '], ['≥', ' ≥ '], ['<', ' < '], ['>', ' > '], ['=', ' = '], ['≠', ' ≠ '],
  ['−', ' − '], ['+', ' + '], ['·', '·'], ['x', 'x'], ['k', 'k'], ['⌫', null],
];

// 範例皆為自創題
const EXAMPLES = [
  '求二次函數 f(x) = 2x² − 8x + 3 的最小值',
  '解不等式 x² − x − 6 < 0',
  '若對所有實數 x，x² + 2kx + 3k + 4 > 0 恆成立，求 k 的範圍',
  '解方程式 4^x − 6·2^x + 8 = 0',
  '解 log₂(x − 1) + log₂(x + 1) = 3',
  '解 (x − 1)/(x + 2) ≥ 0',
];

const STAGES = [
  { key: 'problem', title: '一、審題', ask: '先想想：這題到底要求什麼？' },
  { key: 'knowns', title: '二、已知條件', ask: '題目給了哪些條件？有沒有題目沒明說、但一定要注意的條件？' },
  { key: 'concepts', title: '三、用到的觀念', ask: '要用哪些觀念或公式才能把條件和要求連起來？' },
  { key: 'extension', title: '四、一步一步推導', ask: '試著自己算算看，卡住再看下一步。' },
];

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const state = { text: '', result: null, shown: 0, showAnswer: false };

export function mountApp(root) {
  root.innerHTML = `
    <header class="top">
      <h1>數學解惑</h1>
      <p class="sub">不只給答案，帶你一步一步想。完全離線、免費。</p>
    </header>
    <section class="card" id="input-card">
      <label for="q" class="label">輸入題目</label>
      <textarea id="q" rows="3" placeholder="例如：解不等式 x² − x − 6 < 0" autocomplete="off" spellcheck="false"></textarea>
      <div class="keys" role="group" aria-label="數學符號">
        ${KEYS.map(([label, ins]) => `<button type="button" class="key" data-ins="${esc(ins ?? '')}" ${ins === null ? 'data-back="1" aria-label="刪除"' : ''}>${esc(label)}</button>`).join('')}
      </div>
      <p class="mini">logₐ 的用法：輸入 log_2(x − 1) 代表以 2 為底；只寫 log 是以 10 為底。</p>
      <div class="row">
        <button type="button" id="solve" class="primary">開始解題</button>
        <button type="button" id="clear" class="ghost">清除</button>
      </div>
      <details class="examples">
        <summary>看範例題</summary>
        ${EXAMPLES.map((e) => `<button type="button" class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join('')}
      </details>
    </section>
    <section id="out" aria-live="polite"></section>
  `;
  const ta = root.querySelector('#q');
  root.querySelectorAll('.key').forEach((b) =>
    b.addEventListener('click', () => {
      const s = ta.selectionStart ?? ta.value.length;
      const e = ta.selectionEnd ?? ta.value.length;
      if (b.dataset.back) {
        const from = s === e ? Math.max(0, s - 1) : s;
        ta.value = ta.value.slice(0, from) + ta.value.slice(e);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = from;
        return;
      }
      const ins = b.dataset.ins;
      ta.value = ta.value.slice(0, s) + ins + ta.value.slice(e);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + ins.length;
    }),
  );
  root.querySelectorAll('.chip[data-ex]').forEach((b) =>
    b.addEventListener('click', () => {
      ta.value = b.dataset.ex;
      run(root, ta.value);
    }),
  );
  root.querySelector('#solve').addEventListener('click', () => run(root, ta.value));
  root.querySelector('#clear').addEventListener('click', () => {
    ta.value = '';
    Object.assign(state, { text: '', result: null, shown: 0, showAnswer: false });
    render(root);
    ta.focus();
  });
}

function run(root, text, type) {
  if (!text.trim()) return;
  const result = solve(text, { type });
  Object.assign(state, { text, result, shown: 1, showAnswer: false });
  if (!result.ok) recordUnsolved(text, result.reason);
  render(root);
  root.querySelector('#out').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function render(root) {
  const out = root.querySelector('#out');
  const r = state.result;
  if (!r) {
    out.innerHTML = '';
    return;
  }
  if (!r.ok) {
    out.innerHTML = renderGuided(r);
    bindGuided(root, out);
    return;
  }
  out.innerHTML = renderStages(r);
  out.querySelector('#next')?.addEventListener('click', () => {
    if (state.shown < STAGES.length) state.shown++;
    else state.showAnswer = true;
    render(root);
    const cards = out.querySelectorAll('.stage, .answer');
    cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  out.querySelector('#retype')?.addEventListener('click', () => {
    out.innerHTML = `<div class="card">${renderTypePicker()}</div>`;
    out.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => run(root, state.text, b.dataset.type)));
  });
}

function renderTypePicker() {
  const units = [...new Set(TYPES.map((t) => t.unit))];
  return `<p class="label">這題屬於哪一種？</p>${units
    .map(
      (u) => `<div class="unit"><span class="unit-name">${esc(u)}</span>${TYPES.filter((t) => t.unit === u)
        .map((t) => `<button type="button" class="chip" data-type="${t.id}">${esc(t.label)}</button>`)
        .join('')}</div>`,
    )
    .join('')}<div class="unit"><span class="unit-name">其他</span><button type="button" class="chip" data-type="general">通用解法（方程式、不等式、最值、求值）</button></div>`;
}

function renderGuided(r) {
  const g = r.guided;
  const n = listUnsolved().length;
  let html = `<div class="card warn"><p><b>這題系統還沒辦法完整解出來。</b>不過我們可以一起拆題，你自己動手會學得更多。</p>
    <details><summary class="mini">原因</summary><p class="mini">${esc(r.reason)}</p></details></div>`;
  g.stages.forEach((s) => {
    html += `<article class="card stage"><h2>${esc(s.title)}</h2><p>${esc(s.question)}</p>${
      s.hints.length
        ? `<details><summary class="hint-sum">提示（${s.hints.length}）</summary><ul>${s.hints.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></details>`
        : ''
    }</article>`;
  });
  html += `<article class="card"><h2>計算工具</h2>
    <p class="mini">輸入算式（變數用 x），可以代值或找出等於 0 的地方。</p>
    <input id="tool-expr" class="inp" value="${esc(g.expr || '')}" placeholder="例如 x² − 3x + 2" autocomplete="off" spellcheck="false" />
    <div class="row tool-row">
      <input id="tool-val" class="inp small" placeholder="x = ?" inputmode="decimal" />
      <button type="button" id="tool-eval" class="ghost">代入計算</button>
      <button type="button" id="tool-roots" class="ghost">找 = 0</button>
    </div>
    <p id="tool-out" class="tool-out" aria-live="polite"></p></article>`;
  html += `<details class="card"><summary class="label">如果你知道題型，也可以自己選</summary>${renderTypePicker()}</details>`;
  html += `<div class="card note"><p class="mini">這題已記錄在這台裝置（共 ${n} 題解不出的題目），方便之後補上新題型。資料不會上傳。</p>
    <div class="row"><button type="button" id="exp-unsolved" class="ghost">匯出紀錄</button><button type="button" id="clr-unsolved" class="ghost">清除紀錄</button></div></div>`;
  return html;
}

function bindGuided(root, out) {
  out.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => run(root, state.text, b.dataset.type)));
  const expr = out.querySelector('#tool-expr');
  const res = out.querySelector('#tool-out');
  out.querySelector('#tool-eval').addEventListener('click', () => {
    res.textContent = toolEvaluate(expr.value, out.querySelector('#tool-val').value.trim());
  });
  out.querySelector('#tool-roots').addEventListener('click', () => {
    res.textContent = toolRoots(expr.value);
  });
  out.querySelector('#exp-unsolved').addEventListener('click', () => {
    const d = new Date().toISOString().slice(0, 10);
    downloadJson(`unsolved-${d}.json`, { exportedAt: new Date().toISOString(), items: listUnsolved() });
  });
  out.querySelector('#clr-unsolved').addEventListener('click', (e) => {
    clearUnsolved();
    e.target.closest('.note').querySelector('.mini').textContent = '紀錄已清除。';
  });
}

function stageBody(key, d) {
  if (key === 'problem') return `<p>${esc(d.problem)}</p>`;
  if (key === 'knowns') {
    return `<p class="mini">題目明寫的：</p><ul>${d.knowns.explicit.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
      ${d.knowns.implicit.length ? `<p class="mini">容易漏掉的：</p><ul>${d.knowns.implicit.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}`;
  }
  if (key === 'concepts') {
    return `<ul>${d.concepts.map((c) => `<li><b>${esc(CONCEPT_NAME.get(c.id) || c.id)}</b>：${esc(c.why)}</li>`).join('')}</ul>`;
  }
  return `<ol class="steps">${d.extension
    .map(
      (s) => `<li><div>${esc(s.step)}</div><div class="reason">為什麼：${esc(s.reason)}</div>${
        s.expr ? `<details class="expr"><summary>驗算式</summary><code>${esc(s.expr)}</code></details>` : ''
      }</li>`,
    )
    .join('')}</ol>`;
}

function renderStages(r) {
  const d = r.data;
  const type = r.type === 'general' ? GENERAL : TYPES.find((t) => t.id === r.type);
  let html = `<div class="meta">題型：${esc(type?.unit)}・${esc(type?.label)} <button type="button" id="retype" class="link">不對？改選題型</button></div>`;
  if (r.type === 'general') {
    html += `<div class="card note"><p class="mini">這題沒有專用的講解模板，改用通用解法：答案一樣經過驗算，但講解步驟比較簡略。${r.note ? `<br />${esc(r.note)}` : ''}</p></div>`;
  }
  if (d.uncertain.length) {
    html += `<div class="card warn"><p class="label">請確認</p><ul>${d.uncertain.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></div>`;
  }
  STAGES.slice(0, state.shown).forEach((s) => {
    html += `<article class="card stage"><h2>${s.title}</h2>${stageBody(s.key, d)}</article>`;
  });
  if (state.showAnswer) {
    html += `<article class="card answer"><h2>答案</h2><p class="ans">${esc(d.answer)}</p><p class="mini">怎麼檢查：</p><p>${esc(d.check)}</p></article>`;
  } else {
    const nextAsk = state.shown < STAGES.length ? STAGES[state.shown].ask : '自己算出答案了嗎？對照看看。';
    const label = state.shown < STAGES.length ? `提示：看${STAGES[state.shown].title.slice(2)}` : '看答案';
    html += `<div class="card think"><p>${esc(nextAsk)}</p><button type="button" id="next" class="primary">${esc(label)}</button></div>`;
  }
  return html;
}
