// AI 對話頁：像聊天一樣問數學，AI 規劃解題、呼叫精確的計算工具，並畫圖
import { runAgent } from '../agent/agent.js';
import { geminiProvider, listGeminiModels, DEFAULT_GEMINI_MODEL } from '../agent/gemini.js';
import { localProvider } from '../agent/local.js';
import { cleanText } from '../tutor/llm.js';
import * as llm from '../tutor/llm.js';
import { createDiagram } from './diagram.js';
import { mountAI } from './ai-settings.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const KEY = { provider: 'mt.agent.provider.v1', gkey: 'mt.gemini.key.v1', gmodel: 'mt.gemini.model.v1', log: 'mt.agent.log.v1' };
const get = (k, d = null) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const set = (k, v) => {
  try {
    if (v === null || v === '') localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* 存不了就算了 */
  }
};

const TOOL_LABEL = {
  calculate: '計算',
  solve: '解題',
  solve_linear_system: '解聯立方程式',
  slope: '求斜率',
  line: '求直線',
  line_relation: '平行／垂直線',
  perpendicular_bisector: '中垂線',
  intersect: '求交點',
  measure: '量測',
  translate_line: '直線平移',
  triangle_centers: '外心與重心',
  draw: '畫圖',
};

// 範例皆為自創題
const EXAMPLES = [
  '已知 A(1, 3)、B(4, 9)，求直線 AB 的方程式與斜率',
  '求通過 (2, −1) 且與 3x − y + 4 = 0 垂直的直線',
  '三個點 A(8, 6)、B(0, 2)、C(4, −2)，求到三點等距離的點，並畫圖',
  '直線 y = mx + 2m − 4 恆過哪一點？',
];

/** 安全的簡易排版：先把 LaTeX 轉成一般符號，再處理粗體與條列 */
export function renderRich(text) {
  const t = cleanText(text, { keepBold: true });
  const lines = t.split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    const li = line.match(/^(?:・|[-*•]\s+|\d+[.)、]\s*)(.*)$/);
    const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    if (li && line) {
      if (!inList) html += '<ul>';
      inList = true;
      html += `<li>${inline(li[1])}</li>`;
      continue;
    }
    if (inList) html += '</ul>';
    inList = false;
    if (line) html += `<p>${inline(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}

function shortResult(r) {
  if (!r) return '';
  if (r.error) return `失敗：${r.error}`;
  const v = r.answer ?? r.point ?? r.equation ?? r.slope ?? r.exact ?? r.circumcenter ?? r.distance ?? r.midpoint ?? r.area ?? r.result ?? r.relation;
  if (v !== undefined) return typeof v === 'string' ? v : JSON.stringify(v);
  if (r.approx !== undefined) return `≈ ${r.approx}`;
  if (r.ok) return '已畫出';
  return '';
}

async function resizeImage(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.85);
    return { mimeType: 'image/jpeg', base64: dataUrl.split(',')[1], preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function mountChat(root, { onTeach } = {}) {
  const st = {
    provider: get(KEY.provider, 'local'),
    history: [], // 給模型的對話
    log: [], // 畫面上的紀錄
    images: [],
    busy: false,
    abort: null,
    models: [],
  };
  try {
    const saved = JSON.parse(get(KEY.log, 'null'));
    if (saved?.log && saved?.history) Object.assign(st, { log: saved.log, history: saved.history });
  } catch {
    /* 忽略 */
  }

  root.innerHTML = `
    <section class="card chat-settings" id="chat-settings"></section>
    <section id="chat-log" class="chat-log" aria-live="polite"></section>
    <section class="composer card">
      <div class="img-previews" id="img-previews"></div>
      <textarea id="chat-input" rows="2" placeholder="問一題數學，或拍考卷（需要 Gemini）" autocomplete="off"></textarea>
      <div class="row composer-row">
        <label class="ghost file-btn" id="img-label" title="拍照或選圖片">照片<input type="file" id="img-input" accept="image/*" capture="environment" hidden /></label>
        <button type="button" id="chat-new" class="ghost">新對話</button>
        <button type="button" id="chat-send" class="primary">送出</button>
      </div>
      <p class="mini" id="chat-hint"></p>
    </section>`;

  const logEl = root.querySelector('#chat-log');
  const input = root.querySelector('#chat-input');
  const settingsEl = root.querySelector('#chat-settings');

  const provider = () => {
    if (st.provider === 'gemini') return geminiProvider({ apiKey: get(KEY.gkey), model: get(KEY.gmodel, DEFAULT_GEMINI_MODEL) });
    return localProvider();
  };
  const canUse = () => (st.provider === 'gemini' ? !!get(KEY.gkey) : llm.isReady());

  const save = () => {
    // 圖片不存，避免塞爆手機空間
    const strip = (m) => (m.images ? { ...m, images: [] } : m);
    set(KEY.log, JSON.stringify({ log: st.log.slice(-80).map(strip), history: st.history.slice(-60).map(strip) }));
  };

  // ---------- 設定 ----------
  let aiCard = null;
  function renderSettings() {
    const g = st.provider === 'gemini';
    const ready = canUse();
    settingsEl.innerHTML = `<details ${ready ? '' : 'open'}><summary class="label">AI 大腦：${esc(g ? `Gemini（${get(KEY.gmodel, DEFAULT_GEMINI_MODEL)}）` : '本機 AI')} ${ready ? '' : '（尚未設定）'}</summary>
      <div class="opts">
        <button type="button" class="opt ${!g ? 'picked' : ''}" data-prov="local">本機 AI（免費、離線、不讀照片）</button>
        <button type="button" class="opt ${g ? 'picked' : ''}" data-prov="gemini">Gemini（免費額度、能讀照片、較聰明）</button>
      </div>
      <div id="prov-body"></div></details>`;
    const body = settingsEl.querySelector('#prov-body');
    if (g) {
      const key = get(KEY.gkey, '');
      body.innerHTML = `
        <p class="mini warn-text">注意：免費額度的內容可能被 Google 用於改進產品。不要輸入姓名、學校、聯絡方式等個資；拍考卷前請遮住姓名與座號。</p>
        <ol class="mini"><li>用 Google 帳號登入 <a href="https://aistudio.google.com/" target="_blank" rel="noopener">Google AI Studio</a></li><li>按「Get API key」→「Create API key」</li><li>把金鑰貼到下面（只存在這台裝置）</li></ol>
        <div class="row ask-row"><input id="gkey" class="inp" type="password" autocomplete="off" placeholder="貼上 Gemini API 金鑰" value="${esc(key)}" />
        <button type="button" class="ghost" id="gkey-save">儲存</button></div>
        <div class="row ask-row"><select id="gmodel" class="inp">${(st.models.length ? st.models : [{ id: get(KEY.gmodel, DEFAULT_GEMINI_MODEL), name: get(KEY.gmodel, DEFAULT_GEMINI_MODEL) }])
          .map((m) => `<option value="${esc(m.id)}" ${m.id === get(KEY.gmodel, DEFAULT_GEMINI_MODEL) ? 'selected' : ''}>${esc(m.name)}（${esc(m.id)}）</option>`)
          .join('')}</select><button type="button" class="ghost" id="gmodels">列出可用模型</button></div>
        <p class="mini" id="gmsg">${key ? '金鑰已儲存。' : ''}</p>
        ${key ? '<button type="button" class="link small" id="gkey-del">刪除金鑰</button>' : ''}`;
    } else {
      body.innerHTML = '<p class="mini">本機 AI 在你的裝置上執行，不用金鑰、不會上傳；但小模型的推理能力有限，複雜的題目可能解不完整，也不能讀照片。電腦上可以選「進階」或「最強」模型。</p><div id="local-ai"></div>';
      aiCard = document.createElement('section');
      aiCard.className = 'card inner';
      body.querySelector('#local-ai').appendChild(aiCard);
      mountAI(aiCard, { onReady: () => renderAll() });
    }
    updateHint();
  }

  settingsEl.addEventListener('click', async (e) => {
    const prov = e.target.closest('[data-prov]')?.dataset.prov;
    if (prov) {
      st.provider = prov;
      set(KEY.provider, prov);
      renderSettings();
      return;
    }
    if (e.target.id === 'gkey-save') {
      const v = settingsEl.querySelector('#gkey').value.trim();
      set(KEY.gkey, v);
      renderSettings();
    }
    if (e.target.id === 'gkey-del') {
      set(KEY.gkey, null);
      renderSettings();
    }
    if (e.target.id === 'gmodels') {
      const msg = settingsEl.querySelector('#gmsg');
      msg.textContent = '查詢中…';
      try {
        st.models = await listGeminiModels(get(KEY.gkey));
        renderSettings();
      } catch (err) {
        msg.textContent = err.message;
      }
    }
  });
  settingsEl.addEventListener('change', (e) => {
    if (e.target.id === 'gmodel') {
      set(KEY.gmodel, e.target.value);
      renderSettings();
    }
  });

  function updateHint() {
    const hint = root.querySelector('#chat-hint');
    const imgLabel = root.querySelector('#img-label');
    const vision = st.provider === 'gemini';
    imgLabel.classList.toggle('disabled', !vision);
    hint.textContent = !canUse()
      ? st.provider === 'gemini'
        ? '請先在上方設定貼上 Gemini 金鑰。'
        : '請先在上方設定下載並啟用本機 AI，或改用 Gemini。'
      : vision
        ? 'AI 的每一個數字都由計算工具算出；可以拍照上傳題目或你的作答。'
        : 'AI 的每一個數字都由計算工具算出。本機 AI 不能讀照片，請用打字的。';
  }

  // ---------- 對話紀錄 ----------
  function itemHTML(it, i) {
    if (it.type === 'user') {
      return `<div class="bubble me">${it.images?.length ? `<div class="thumbs">${it.images.map((src) => `<img src="${esc(src)}" alt="上傳的圖片" />`).join('')}</div>` : ''}${esc(it.text).replace(/\n/g, '<br />')}</div>`;
    }
    if (it.type === 'assistant') return it.text ? `<div class="bubble tutor rich">${renderRich(it.text)}</div>` : '';
    if (it.type === 'tool') {
      const label = TOOL_LABEL[it.name] || it.name;
      const res = shortResult(it.result);
      return `<details class="tool-card ${it.result?.error ? 'bad' : ''}"><summary><span class="tool-name">工具・${esc(label)}</span> ${esc(res).slice(0, 80)}</summary>
        <pre>${esc(JSON.stringify(it.args, null, 1))}\n→ ${esc(JSON.stringify(it.result, null, 1))}</pre></details>
        ${it.diagram ? `<div class="chat-diagram" data-diag="${i}"></div>` : ''}
        ${it.teach ? `<button type="button" class="link small" data-teach="${esc(it.teach)}">用「老師帶我做」一步一步練這題</button>` : ''}`;
    }
    if (it.type === 'error') return `<div class="card warn"><p>${esc(it.text)}</p></div>`;
    return '';
  }

  const diagCache = new Map();
  function renderLog() {
    if (!st.log.length) {
      logEl.innerHTML = `<div class="card welcome"><h2>AI 數學老師</h2>
        <p>用聊天的方式問數學。AI 會先想解題方向，再呼叫精確的計算工具，所以數字不會算錯；也會畫圖讓你看懂。</p>
        <p class="mini">可以說「直接給我解答」或「一步一步帶我做」。試試看：</p>
        ${EXAMPLES.map((e) => `<button type="button" class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join('')}</div>`;
      return;
    }
    logEl.innerHTML = st.log.map(itemHTML).join('') + (st.busy ? '<div class="bubble tutor mini thinking">思考中…（AI 正在規劃並呼叫計算工具）<button type="button" class="link small" id="chat-stop">停止</button></div>' : '');
    logEl.querySelectorAll('[data-diag]').forEach((slot) => {
      const i = Number(slot.dataset.diag);
      let card = diagCache.get(i);
      if (!card) {
        card = createDiagram(st.log[i].diagram);
        if (card) card.setVisible(() => true);
        diagCache.set(i, card);
      }
      if (card) slot.appendChild(card.el);
    });
  }

  function renderAll() {
    renderSettings();
    renderLog();
  }

  logEl.addEventListener('click', (e) => {
    const ex = e.target.closest('[data-ex]')?.dataset.ex;
    if (ex) {
      input.value = ex;
      send();
    }
    const teach = e.target.closest('[data-teach]')?.dataset.teach;
    if (teach) onTeach?.(teach);
    if (e.target.id === 'chat-stop') st.abort?.abort();
  });

  // ---------- 圖片 ----------
  const previews = root.querySelector('#img-previews');
  const renderPreviews = () => {
    previews.innerHTML = st.images.map((im, i) => `<span class="img-chip"><img src="${im.preview}" alt="待上傳圖片" /><button type="button" data-rm="${i}" aria-label="移除">×</button></span>`).join('');
  };
  previews.addEventListener('click', (e) => {
    const i = e.target.dataset?.rm;
    if (i !== undefined) {
      st.images.splice(Number(i), 1);
      renderPreviews();
    }
  });
  root.querySelector('#img-input').addEventListener('change', async (e) => {
    if (st.provider !== 'gemini') {
      e.target.value = '';
      return;
    }
    for (const f of e.target.files) {
      try {
        st.images.push(await resizeImage(f));
      } catch {
        /* 讀不了就略過 */
      }
    }
    e.target.value = '';
    renderPreviews();
  });

  // ---------- 送出 ----------
  async function send() {
    const text = input.value.trim();
    if ((!text && !st.images.length) || st.busy) return;
    if (!canUse()) {
      updateHint();
      settingsEl.querySelector('details')?.setAttribute('open', '');
      return;
    }
    const images = st.provider === 'gemini' ? st.images : [];
    st.log.push({ type: 'user', text, images: images.map((im) => im.preview) });
    input.value = '';
    st.images = [];
    renderPreviews();
    st.busy = true;
    st.abort = new AbortController();
    renderLog();
    logEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    try {
      st.history = await runAgent({
        provider: provider(),
        history: st.history,
        user: { text: text || '請看圖片中的題目', images: images.map(({ mimeType, base64 }) => ({ mimeType, base64 })) },
        signal: st.abort.signal,
        onEvent: (ev) => {
          if (ev.type === 'assistant' && ev.message.text) st.log.push({ type: 'assistant', text: ev.message.text });
          if (ev.type === 'tool') {
            st.log.push({
              type: 'tool',
              name: ev.call.name,
              args: ev.call.args,
              result: ev.result,
              diagram: ev.diagram,
              teach: ev.call.name === 'solve' && !ev.result?.error ? ev.call.args?.problem : null,
            });
          }
          if (ev.type === 'done' && ev.truncated) st.log.push({ type: 'error', text: '這題需要的步驟比較多，AI 先停在這裡。可以回覆「繼續」讓它接著做。' });
          renderLog();
          logEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        },
      });
    } catch (err) {
      st.log.push({ type: 'error', text: err.name === 'AbortError' ? '已停止。' : err.message });
    }
    st.busy = false;
    st.abort = null;
    save();
    renderLog();
  }

  root.querySelector('#chat-send').addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  root.querySelector('#chat-new').addEventListener('click', () => {
    if (st.busy) return;
    Object.assign(st, { history: [], log: [] });
    diagCache.clear();
    save();
    renderLog();
  });

  renderAll();
}
