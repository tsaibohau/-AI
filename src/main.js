import './style.css';

// 網站更新後，還開著的舊頁面會找不到改過名字的程式檔：自動重新整理一次換成新版
window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem('mt.reloaded')) return;
    sessionStorage.setItem('mt.reloaded', '1');
  } catch {
    return;
  }
  location.reload();
});
import { mountApp } from './ui/app.js';
import { mountChat } from './ui/chat.js';

const root = document.querySelector('#app');
root.innerHTML = `
  <header class="top">
    <h1>數學解惑</h1>
    <nav class="tabs" role="tablist">
      <button type="button" role="tab" class="tab on" data-tab="chat" aria-selected="true">AI 對話</button>
      <button type="button" role="tab" class="tab" data-tab="engine" aria-selected="false">老師帶我做</button>
    </nav>
  </header>
  <section id="panel-chat"></section>
  <section id="panel-engine" hidden></section>`;

const panels = { chat: root.querySelector('#panel-chat'), engine: root.querySelector('#panel-engine') };
function show(tab) {
  for (const [k, el] of Object.entries(panels)) el.hidden = k !== tab;
  root.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('on', b.dataset.tab === tab);
    b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  });
  try {
    localStorage.setItem('mt.tab.v1', tab);
  } catch {
    /* 忽略 */
  }
}
root.querySelector('.tabs').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]')?.dataset.tab;
  if (t) show(t);
});

const engine = mountApp(panels.engine);
mountChat(panels.chat, {
  onTeach(problem) {
    show('engine');
    engine.loadProblem(problem);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
});
try {
  const t = localStorage.getItem('mt.tab.v1');
  if (t === 'engine') show('engine');
} catch {
  /* 忽略 */
}
