// 主畫面：輸入題目 → 四階段逐步提示 → 最後才看答案
import concepts from '../../data/concepts.json';
import { solve, TYPES } from '../engine/index.js';

const CONCEPT_NAME = new Map(concepts.concepts.map((c) => [c.id, c.name]));

const KEYS = [
  ['x²', 'x²'], ['²', '²'], ['³', '³'], ['√', '√('], ['(', '('], [')', ')'],
  ['≤', ' ≤ '], ['≥', ' ≥ '], ['<', ' < '], ['>', ' > '], ['=', ' = '], ['≠', ' ≠ '],
  ['−', ' − '], ['+', ' + '], ['·', '·'], ['/', '/'], ['x', 'x'], ['k', 'k'],
];

// 範例皆為自創題
const EXAMPLES = [
  '求二次函數 f(x) = 2x² − 8x + 3 的最小值',
  '解不等式 x² − x − 6 < 0',
  '在 1 ≤ x ≤ 4 時，求 f(x) = −x² + 2x + 5 的最大值與最小值',
  '若對所有實數 x，x² + 2kx + 3k + 4 > 0 恆成立，求 k 的範圍',
];

const STAGES = [
  { key: 'problem', title: '一、審題', ask: '先想想：這題到底要求什麼？' },
  { key: 'knowns', title: '二、已知條件', ask: '題目給了哪些條件？有沒有題目沒明說、但一定要注意的條件？' },
  { key: 'concepts', title: '三、用到的觀念', ask: '要用哪些觀念或公式才能把條件和要求連起來？' },
  { key: 'extension', title: '四、一步一步推導', ask: '試著自己算算看，卡住再看下一步。' },
];

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const state = { text: '', result: null, shown: 0, showAnswer: false, chosenType: null };

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
        ${KEYS.map(([label, ins]) => `<button type="button" class="key" data-ins="${esc(ins)}">${esc(label)}</button>`).join('')}
      </div>
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
      const ins = b.dataset.ins;
      const s = ta.selectionStart ?? ta.value.length;
      const e = ta.selectionEnd ?? ta.value.length;
      ta.value = ta.value.slice(0, s) + ins + ta.value.slice(e);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + ins.length;
    }),
  );
  root.querySelectorAll('.chip').forEach((b) =>
    b.addEventListener('click', () => {
      ta.value = b.dataset.ex;
      run(root, ta.value);
    }),
  );
  root.querySelector('#solve').addEventListener('click', () => run(root, ta.value));
  root.querySelector('#clear').addEventListener('click', () => {
    ta.value = '';
    Object.assign(state, { text: '', result: null, shown: 0, showAnswer: false, chosenType: null });
    render(root);
    ta.focus();
  });
}

function run(root, text, type) {
  Object.assign(state, { text, result: solve(text, { type }), shown: 1, showAnswer: false, chosenType: type || null });
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
    out.innerHTML = renderFailure(r);
    out.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => run(root, state.text, b.dataset.type)));
    return;
  }
  out.innerHTML = renderStages(r);
  out.querySelector('#next')?.addEventListener('click', () => {
    if (state.shown < STAGES.length) state.shown++;
    else state.showAnswer = true;
    render(root);
    out.querySelector('.stage:last-of-type, .answer')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  out.querySelector('#retype')?.addEventListener('click', () => {
    state.result = { ok: false, needType: true, reason: '請選擇這題屬於哪一種題型', uncertain: [] };
    render(root);
  });
}

function renderFailure(r) {
  let html = `<div class="card warn"><p>${esc(r.reason)}</p>`;
  if (r.uncertain?.length) html += `<ul>${r.uncertain.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>`;
  html += '</div>';
  if (r.needType) html += renderTypePicker();
  return html;
}

function renderTypePicker() {
  const units = [...new Set(TYPES.map((t) => t.unit))];
  return `<div class="card"><p class="label">這題屬於哪一種？</p>${units
    .map(
      (u) => `<div class="unit"><span class="unit-name">${esc(u)}</span>${TYPES.filter((t) => t.unit === u)
        .map((t) => `<button type="button" class="chip" data-type="${t.id}" ${t.solve ? '' : 'disabled'}>${esc(t.label)}${t.solve ? '' : '（開發中）'}</button>`)
        .join('')}</div>`,
    )
    .join('')}</div>`;
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
  const type = TYPES.find((t) => t.id === r.type);
  let html = `<div class="meta">題型：${esc(type?.unit)}・${esc(type?.label)} <button type="button" id="retype" class="link">不對？改選題型</button></div>`;
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
