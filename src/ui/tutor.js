// 老師模式：每一階段先問學生、學生作答後判斷對錯並給提示；每一步都可以按「我不懂」追問
import concepts from '../../data/concepts.json';
import { GOALS, TYPES, GENERAL } from '../engine/index.js';
import { diagnose } from '../core/diagnose.js';
import { answerFollowUp, INTENTS, LESSON } from '../tutor/followup.js';
import * as llm from '../tutor/llm.js';
import { validateDiagram } from '../core/diagram.js';
import { explainGraph } from '../tutor/graph.js';

const CONCEPTS = concepts.concepts;
const CONCEPT_NAME = new Map(CONCEPTS.map((c) => [c.id, c.name]));
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const MAX_TRIES = 3;

/** 建立一題的老師模式狀態 */
export function newTutorState(result) {
  return {
    stage: 0, // 0 審題、1 已知、2 觀念、3 推導、4 答案
    goal: { pick: null, tries: 0, done: false },
    known: { revealed: false },
    concept: { picks: new Set(), checked: false, options: conceptOptions(result.data) },
    stepIdx: 0,
    steps: result.data.extension.map(() => ({ tries: 0, solved: false, revealed: false, input: '', feedback: null, hint: false })),
    final: { input: '', feedback: null, revealed: false },
    chats: {}, // key → [{ q, a, ai, pending }]
    openAsk: null,
  };
}

function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

/** 觀念選擇題：正確觀念 + 幾個其他單元的干擾選項，順序固定但打散 */
function conceptOptions(data) {
  const right = data.concepts.slice(0, 4).map((c) => c.id);
  const units = new Set(right.map((id) => CONCEPTS.find((c) => c.id === id)?.unit));
  const wrong = CONCEPTS.filter((c) => !right.includes(c.id) && !units.has(c.unit))
    .sort((a, b) => hash(a.id + data.problem) - hash(b.id + data.problem))
    .slice(0, 3)
    .map((c) => c.id);
  return [...right, ...wrong].sort((a, b) => hash(a + data.problem) - hash(b + data.problem)).map((id) => ({ id, right: right.includes(id) }));
}

// ---------- 畫面 ----------

function askPanel(key, ts) {
  const open = ts.openAsk === key;
  const chat = ts.chats[key] || [];
  let html = `<button type="button" class="link small" data-act="toggle-ask" data-key="${key}">${open ? '收起追問' : '我不懂'}</button>`;
  if (!open && !chat.length) return html;
  html += '<div class="ask-panel">';
  for (const m of chat) {
    html += `<div class="bubble me">${esc(m.q)}</div>`;
    if (m.a) {
      html += `<div class="bubble tutor"><b>${esc(m.a.title)}</b>${m.a.paras.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`;
      if (!m.a.understood && !m.ai && !m.pending) {
        html += `<div class="chips">${m.a.follow.map((f) => `<button type="button" class="chip-s" data-act="intent" data-key="${key}" data-intent="${f.id}">${esc(f.label)}</button>`).join('')}</div>`;
      }
    }
    if (m.pending) html += '<div class="bubble tutor mini">本機 AI 思考中…</div>';
    if (m.ai) {
      html += `<div class="bubble tutor ai"><span class="tag">AI 解釋</span>${m.ai.text.split('\n').filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('')}${m.ai.warning ? `<p class="warn-text">${esc(m.ai.warning)}</p>` : ''}</div>`;
    }
  }
  if (open) {
    html += `<div class="chips">${INTENTS.map((f) => `<button type="button" class="chip-s" data-act="intent" data-key="${key}" data-intent="${f.id}">${esc(f.label)}</button>`).join('')}</div>
      <div class="row ask-row"><input class="inp" data-input="ask-${key}" placeholder="或直接打字問，例如：−5 怎麼來的？" autocomplete="off" />
      <button type="button" class="ghost" data-act="ask-text" data-key="${key}">問</button></div>`;
  }
  return html + '</div>';
}

function stepView(s, i, ts, current) {
  const st = ts.steps[i];
  const showBody = !s.ask || st.solved || st.revealed;
  let html = `<li class="${current ? 'current' : ''}">`;
  if (!showBody) {
    html += `<div class="q">${esc(s.ask.q)}</div>
      <div class="row ask-row"><input class="inp" data-input="step-${i}" value="${esc(st.input)}" placeholder="寫下你的答案" autocomplete="off" spellcheck="false" />
      <button type="button" class="primary small" data-act="check-step" data-i="${i}">檢查</button></div>`;
    if (st.feedback) html += `<p class="fb ${st.feedback.ok ? 'ok' : 'bad'}">${esc(st.feedback.message)}${st.feedback.category ? `<span class="cat">${esc(st.feedback.category)}</span>` : ''}</p>`;
    if (st.hint) html += `<p class="reason">提示：${esc(s.reason)}</p>`;
    html += `<div class="row tools">${st.hint ? '' : `<button type="button" class="link small" data-act="hint" data-i="${i}">給我提示</button>`}
      <button type="button" class="link small" data-act="reveal-step" data-i="${i}">${st.tries >= MAX_TRIES ? '看這一步怎麼做' : '直接看這一步'}</button></div>`;
  } else {
    if (st.solved) html += '<p class="fb ok">你自己算出來了！</p>';
    html += `<div>${esc(s.step)}</div><div class="reason">為什麼：${esc(s.reason)}</div>`;
    if (s.detail) html += `<details class="expr"><summary>計算細節</summary><p>${esc(s.detail)}</p></details>`;
    if (s.expr) html += `<details class="expr"><summary>驗算式</summary><code>${esc(s.expr)}</code></details>`;
  }
  html += askPanel(`s${i}`, ts);
  if (current && showBody) html += `<button type="button" class="primary next" data-act="next-step">${i === ts.steps.length - 1 ? '推導完了，寫答案' : '下一步'}</button>`;
  return html + '</li>';
}

export function renderTutor(r, ts) {
  const d = r.data;
  let html = '';
  // 一、審題
  html += '<article class="card stage"><h2>一、審題</h2>';
  if (!ts.goal.done) {
    html += `<p>先讀一遍題目，這題要你做什麼？</p><div class="opts">${GOALS.map((g) => `<button type="button" class="opt ${ts.goal.pick === g ? 'picked' : ''}" data-act="goal" data-goal="${esc(g)}">${esc(g)}</button>`).join('')}</div>`;
    if (ts.goal.pick && ts.goal.pick !== r.goal) html += `<p class="fb bad">再看一次題目最後問的是什麼。${ts.goal.tries >= 2 ? `答案是「${esc(r.goal)}」。` : ''}</p>`;
    if (ts.goal.tries >= 2) html += `<button type="button" class="link small" data-act="goal" data-goal="${esc(r.goal)}">好，我知道了</button>`;
  } else {
    html += `<p class="fb ok">對，這題要「${esc(r.goal)}」。</p><p>${esc(d.problem)}</p>`;
  }
  html += askPanel('problem', ts) + '</article>';
  if (ts.stage < 1) return html;

  // 二、已知
  html += `<article class="card stage"><h2>二、已知條件</h2><p class="mini">題目明寫的：</p><ul>${d.knowns.explicit.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>`;
  if (d.knowns.implicit.length) {
    if (!ts.known.revealed) {
      html += '<p>還有沒有題目沒說出口、但一定要注意的條件？先想一想（例如變數的範圍、式子有沒有意義）。</p><button type="button" class="ghost" data-act="reveal-known">我想好了，對答案</button>';
    } else {
      html += `<p class="mini">容易漏掉的：</p><ul>${d.knowns.implicit.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>`;
    }
  }
  html += askPanel('knowns', ts);
  if (ts.stage === 1 && (ts.known.revealed || !d.knowns.implicit.length)) html += '<button type="button" class="primary next" data-act="to-stage" data-stage="2">下一階段：觀念</button>';
  html += '</article>';
  if (ts.stage < 2) return html;

  // 三、觀念
  html += '<article class="card stage"><h2>三、用到的觀念</h2>';
  if (!ts.concept.checked) {
    html += `<p>這題會用到哪些觀念？可以選好幾個。</p><div class="opts">${ts.concept.options
      .map((o) => `<button type="button" class="opt ${ts.concept.picks.has(o.id) ? 'picked' : ''}" data-act="concept" data-id="${o.id}">${esc(CONCEPT_NAME.get(o.id))}</button>`)
      .join('')}</div><button type="button" class="primary next" data-act="check-concepts">檢查</button>`;
  } else {
    const right = ts.concept.options.filter((o) => o.right);
    const hit = right.filter((o) => ts.concept.picks.has(o.id)).length;
    const wrong = ts.concept.options.filter((o) => !o.right && ts.concept.picks.has(o.id));
    html += `<p class="fb ${hit === right.length && !wrong.length ? 'ok' : 'bad'}">你選對了 ${hit} / ${right.length} 個${wrong.length ? `，「${wrong.map((o) => CONCEPT_NAME.get(o.id)).join('、')}」這題用不到` : ''}。</p>`;
    html += `<ul>${d.concepts.map((c) => `<li><b>${esc(CONCEPT_NAME.get(c.id))}</b>${ts.concept.picks.has(c.id) ? ' ✓' : '（漏選）'}：${esc(c.why)}</li>`).join('')}</ul>`;
    if (ts.stage === 2) html += '<button type="button" class="primary next" data-act="to-stage" data-stage="3">開始推導</button>';
  }
  html += askPanel('concepts', ts) + '</article>';
  if (ts.stage < 3) return html;

  // 四、推導
  const last = ts.stage === 3 ? ts.stepIdx : d.extension.length - 1;
  html += `<article class="card stage"><h2>四、一步一步推導</h2><p class="mini">每一步先自己試，卡住可以要提示或按「我不懂」。</p><ol class="steps">${d.extension
    .slice(0, last + 1)
    .map((s, i) => stepView(s, i, ts, ts.stage === 3 && i === ts.stepIdx))
    .join('')}</ol></article>`;
  if (ts.stage < 4) return html;

  // 答案
  html += '<article class="card answer"><h2>最後答案</h2>';
  if (r.final && !ts.final.revealed && !ts.final.feedback?.ok) {
    html += `<p>${esc(r.final.q)}</p><div class="row ask-row"><input class="inp" data-input="final" value="${esc(ts.final.input)}" placeholder="寫下你的答案" autocomplete="off" spellcheck="false" />
      <button type="button" class="primary small" data-act="check-final">檢查</button></div>`;
    if (ts.final.feedback) html += `<p class="fb bad">${esc(ts.final.feedback.message)}${ts.final.feedback.category ? `<span class="cat">${esc(ts.final.feedback.category)}</span>` : ''}</p>`;
    html += '<button type="button" class="link small" data-act="reveal-final">看答案</button>';
  } else {
    if (ts.final.feedback?.ok) html += '<p class="fb ok">完全正確！你自己做出來了。</p>';
    html += `<p class="ans">${esc(d.answer)}</p><p class="mini">怎麼檢查：</p><p>${esc(d.check)}</p>`;
  }
  html += askPanel('answer', ts) + '</article>';
  return html;
}

// ---------- 互動 ----------

function stageContext(key, r, ts) {
  const d = r.data;
  const diagram = validateDiagram(d.diagram).spec || null;
  if (key.startsWith('s')) {
    const step = d.extension[Number(key.slice(1))];
    return { step, concept: step.concept || d.concepts[0]?.id, diagram };
  }
  const text = {
    problem: d.problem,
    knowns: [...d.knowns.explicit, ...d.knowns.implicit].join('；'),
    concepts: d.concepts.map((c) => `${CONCEPT_NAME.get(c.id)}：${c.why}`).join('；'),
    answer: `${d.answer}；${d.check}`,
  }[key];
  return { concept: d.concepts[0]?.id, stageText: text, diagram };
}

async function askAI(r, ts, key, q, msg, rerender) {
  const ctx = stageContext(key, r, ts);
  msg.pending = true;
  rerender();
  try {
    const history = (ts.chats[key] || []).filter((m) => m !== msg && m.ai).flatMap((m) => [{ role: 'user', content: m.q }, { role: 'assistant', content: m.ai.text }]);
    msg.ai = await llm.askLLM({
      question: q,
      problem: r.data.problem,
      step: ctx.step || (ctx.stageText ? { step: ctx.stageText } : null),
      lesson: LESSON[ctx.concept]?.summary,
      graph: ctx.diagram ? explainGraph(ctx.diagram).join(' ') : null,
      answerShown: ts.stage >= 4 && (ts.final.revealed || ts.final.feedback?.ok) ? r.data.answer : null,
      history,
    });
  } catch (e) {
    msg.ai = { text: `本機 AI 發生錯誤：${e.message}`, warning: null };
  }
  msg.pending = false;
  rerender();
}

/** 處理老師模式的點擊；回傳 true 代表需要重畫 */
export function handleTutorClick(el, r, ts, out, rerender) {
  const act = el.dataset.act;
  const key = el.dataset.key;
  const i = Number(el.dataset.i);
  const val = (name) => out.querySelector(`[data-input="${name}"]`)?.value ?? '';
  switch (act) {
    case 'goal':
      ts.goal.pick = el.dataset.goal;
      if (ts.goal.pick === r.goal) {
        ts.goal.done = true;
        ts.stage = Math.max(ts.stage, 1);
      } else ts.goal.tries++;
      return true;
    case 'reveal-known':
      ts.known.revealed = true;
      return true;
    case 'to-stage':
      ts.stage = Math.max(ts.stage, Number(el.dataset.stage));
      return true;
    case 'concept':
      if (ts.concept.picks.has(el.dataset.id)) ts.concept.picks.delete(el.dataset.id);
      else ts.concept.picks.add(el.dataset.id);
      return true;
    case 'check-concepts':
      ts.concept.checked = true;
      return true;
    case 'check-step': {
      const st = ts.steps[i];
      st.input = val(`step-${i}`);
      st.feedback = diagnose(r.data.extension[i].ask, st.input);
      if (st.feedback.ok) st.solved = true;
      else if (st.input.trim()) st.tries++;
      if (st.tries >= 2) st.hint = true;
      return true;
    }
    case 'hint':
      ts.steps[i].hint = true;
      return true;
    case 'reveal-step':
      ts.steps[i].revealed = true;
      return true;
    case 'next-step':
      if (ts.stepIdx < ts.steps.length - 1) ts.stepIdx++;
      else ts.stage = 4;
      return true;
    case 'check-final':
      ts.final.input = val('final');
      ts.final.feedback = diagnose(r.final, ts.final.input);
      return true;
    case 'reveal-final':
      ts.final.revealed = true;
      return true;
    case 'toggle-ask':
      ts.openAsk = ts.openAsk === key ? null : key;
      return true;
    case 'intent': {
      const label = INTENTS.find((x) => x.id === el.dataset.intent)?.label || '';
      (ts.chats[key] ||= []).push({ q: label, a: answerFollowUp(el.dataset.intent, stageContext(key, r, ts)) });
      return true;
    }
    case 'ask-text': {
      const q = val(`ask-${key}`).trim();
      if (!q) return false;
      const a = answerFollowUp(q, stageContext(key, r, ts));
      const msg = { q, a };
      (ts.chats[key] ||= []).push(msg);
      // 本機 AI 已啟用時，自由發問一律也問 AI（關鍵字聽不懂的問題特別需要）
      if (llm.isReady()) {
        if (!a.understood) msg.a = null;
        askAI(r, ts, key, q, msg, rerender);
        return false;
      }
      if (!a.understood) a.paras.push('（想讓系統聽懂更多種問法，可以在頁面最下方啟用「本機 AI 助教」。）');
      return true;
    }
    default:
      return false;
  }
}

export function typeLabel(r) {
  const t = r.type === 'general' ? GENERAL : TYPES.find((x) => x.id === r.type);
  return `${t?.unit}・${t?.label}`;
}
