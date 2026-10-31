// 頁面最下方的「本機 AI 助教」設定卡
import * as llm from '../tutor/llm.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function mountAI(card, { onReady } = {}) {
  const st = { support: null, status: llm.isReady() ? 'ready' : 'idle', progress: 0, text: '', error: '', model: llm.loadedModel?.() || llm.savedModel() || llm.MODELS[0].id, downloaded: false };

  const render = () => {
    let body = '';
    if (st.support === null) body = '<p class="mini">檢查這台裝置能不能執行本機 AI…</p>';
    else if (!st.support.ok) body = `<p class="mini">${esc(st.support.reason)}</p><p class="mini">沒有本機 AI 也能使用全部功能，只是自由打字的追問只能聽懂常見問法。</p>`;
    else if (st.status === 'ready') {
      body = `<p class="fb ok">已啟用：${esc(llm.MODELS.find((m) => m.id === st.model)?.label)}</p>
        <p class="mini">「AI 對話」與解題引擎裡的「我不懂」都會使用本機 AI。</p>
        <button type="button" class="ghost" data-ai="delete">刪除模型，釋放空間</button>
        <button type="button" class="ghost" data-ai="test">檢測（iPhone 除錯用）</button>
        ${st.test ? `<pre class="mini" style="white-space:pre-wrap">${esc(st.test.join('\n'))}</pre>` : ''}`;
    } else if (st.status === 'loading') {
      body = `<p>${st.downloaded ? '載入中' : '下載中'}… ${Math.round(st.progress * 100)}%</p>
        <div class="bar"><div style="width:${Math.round(st.progress * 100)}%"></div></div><p class="mini">${esc(st.text)}</p>
        <p class="mini">請不要關閉這個頁面。</p>`;
    } else {
      body = `<p class="mini">啟用後，在「我不懂」裡用任何說法打字發問，AI 都會試著聽懂並用口語解釋。數學內容一律以解題步驟為準，AI 只負責解釋。</p>
        <ul class="mini">
          <li>完全在你的手機或電腦上執行，問題不會傳到任何伺服器，也不用付費</li>
          <li>第一次要下載模型檔（標準約 1 GB，建議用 Wi-Fi），之後離線也能用</li>
          <li>需要較新的裝置與瀏覽器；舊手機可能跑不動或很慢</li>
        </ul>
        <label class="mini" for="ai-model">模型：</label>
        <select id="ai-model" class="inp">${llm.MODELS.map((m) => `<option value="${m.id}" ${m.id === st.model ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select>
        ${st.downloaded ? '<p class="mini">這個模型已經下載過，啟用不需要再下載。</p>' : ''}
        <div class="row" style="margin-top:8px"><button type="button" class="primary" data-ai="load">${st.downloaded ? '啟用本機 AI' : '下載並啟用'}</button>
        ${st.downloaded ? '<button type="button" class="ghost" data-ai="delete">刪除模型</button>' : ''}
        <button type="button" class="ghost" data-ai="test">檢測</button></div>
        ${st.test ? `<pre class="mini" style="white-space:pre-wrap">${esc(st.test.join('\n'))}</pre>` : ''}
        ${st.error ? `<p class="fb bad">${esc(st.error)}</p>` : ''}`;
    }
    card.innerHTML = `<details ${st.status === 'loading' || st.status === 'ready' ? 'open' : ''}><summary class="label">本機 AI 助教（選用）</summary>${body}</details>`;
  };

  const refreshDownloaded = async () => {
    st.downloaded = await llm.isDownloaded(st.model);
    render();
  };

  card.addEventListener('change', (e) => {
    if (e.target.id === 'ai-model') {
      st.model = e.target.value;
      refreshDownloaded();
    }
  });
  card.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-ai]')?.dataset.ai;
    if (act === 'load') {
      st.status = 'loading';
      st.error = '';
      render();
      try {
        await llm.loadModel(st.model, ({ progress, text }) => {
          st.progress = progress;
          st.text = text;
          render();
        });
        st.status = 'ready';
        onReady?.();
      } catch (err) {
        st.status = 'idle';
        st.error = /module script|dynamically imported module|Failed to fetch/i.test(err.message)
          ? '網站剛更新，這個頁面還是舊版。請把網頁完全關掉再打開（或重新整理），然後再按一次。'
          : `啟用失敗：${err.message}。可以改選「輕量」模型再試一次。`;
      }
      render();
    }
    if (act === 'test') {
      st.test = ['檢測中…（第一次會先下載）'];
      render();
      const res = await llm.selfTest(st.model, (lines) => {
        st.test = [...lines, '…'];
        render();
      });
      st.test = [...res, '檢測完請把網頁完全關掉再打開。'];
      st.status = llm.isReady() ? 'ready' : 'idle';
      render();
    }
    if (act === 'delete') {
      try {
        await llm.deleteModel(st.model);
      } catch {
        /* 忽略 */
      }
      st.status = 'idle';
      st.downloaded = false;
      render();
    }
  });

  render();
  llm.supportStatus().then((s) => {
    st.support = s;
    render();
    if (s.ok) refreshDownloaded();
  });
}
