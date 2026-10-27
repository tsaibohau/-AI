// 本機 AI 助教（選用）：用 WebLLM 在瀏覽器裡跑開源小模型，只負責「聽懂追問、用口語解釋」。
// 數學內容一律來自解題引擎；AI 回覆中出現步驟裡沒有的數字時會標示提醒。
// 模型只在使用者按下「下載」後才載入；問題不會傳到任何伺服器。

export const MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: '標準（約 1 GB，較聰明）', vramMB: 1630 },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: '輕量（約 0.4 GB，較快、較不準）', vramMB: 950 },
];

const PREF_KEY = 'mt.llm.model.v1';

export function savedModel() {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
}
function saveModel(id) {
  try {
    if (id) localStorage.setItem(PREF_KEY, id);
    else localStorage.removeItem(PREF_KEY);
  } catch {
    /* 忽略 */
  }
}

/** 瀏覽器是否支援（需要 WebGPU） */
export async function supportStatus() {
  if (typeof navigator === 'undefined' || !navigator.gpu) return { ok: false, reason: '這個瀏覽器不支援 WebGPU，無法執行本機 AI。可以改用較新版的 Chrome、Edge 或 Safari。' };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: '找不到可用的 GPU，無法執行本機 AI。' };
    return { ok: true };
  } catch {
    return { ok: false, reason: '無法啟用 GPU，無法執行本機 AI。' };
  }
}

let engine = null;
let loadedId = null;

export const isReady = () => engine !== null;

/** 下載（第一次）並載入模型；onProgress({ progress: 0~1, text }) */
export async function loadModel(id, onProgress = () => {}) {
  if (engine && loadedId === id) return engine;
  const webllm = await import('@mlc-ai/web-llm');
  engine = await webllm.CreateMLCEngine(id, { initProgressCallback: (r) => onProgress({ progress: r.progress ?? 0, text: r.text || '' }) });
  loadedId = id;
  saveModel(id);
  return engine;
}

/** 這台裝置是否已經下載過模型 */
export async function isDownloaded(id) {
  try {
    const webllm = await import('@mlc-ai/web-llm');
    return await webllm.hasModelInCache(id);
  } catch {
    return false;
  }
}

/** 刪除已下載的模型檔案，釋放手機空間 */
export async function deleteModel(id) {
  const webllm = await import('@mlc-ai/web-llm');
  try {
    await engine?.unload?.();
  } catch {
    /* 忽略 */
  }
  engine = null;
  loadedId = null;
  await webllm.deleteModelAllInfoInCache(id);
  saveModel(null);
}

const SYSTEM = `你是台灣高中數學家教，學生正在一步一步做一題數學題，現在對某一步有疑問。
請遵守：
1. 只根據下面提供的「題目資料」解釋，不要自己做新的計算，也不要改動任何數字或答案。
2. 如果學生還沒看到答案，不要直接說出最後答案。
3. 用繁體中文、口語、像老師面對面講解，簡短（150 字以內），可以反問學生一個小問題確認他懂了。
4. 先抓出學生真正卡住的點，再解釋；如果問題和這題無關，請溫和地帶回題目。
5. 不要寫「顯然」。`;

/** 組出給模型的訊息（純函式，可測試） */
export function buildMessages({ question, problem, step, lesson, answerShown, history = [] }) {
  const ctx = [
    `題目：${problem}`,
    step ? `目前這一步：${step.step}` : '',
    step?.reason ? `這一步的理由：${step.reason}` : '',
    step?.detail ? `計算細節：${step.detail}` : '',
    lesson ? `相關觀念：${lesson}` : '',
    answerShown ? `最後答案（學生已看過）：${answerShown}` : '學生還沒看到最後答案。',
  ]
    .filter(Boolean)
    .join('\n');
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `【題目資料】\n${ctx}` },
    { role: 'assistant', content: '好的，我會只根據這些資料解釋。' },
    ...history.slice(-4),
    { role: 'user', content: question },
  ];
}

const numsIn = (s) =>
  (String(s).normalize('NFKC').replace(/[−–]/g, '-').match(/\d+(?:\.\d+)?/g) || []).map((n) => String(Number(n)));

/** 檢查 AI 回覆裡的數字是否都出現在題目資料中；回傳可疑數字（純函式，可測試） */
export function unknownNumbers(reply, contextText) {
  const allowed = new Set([...numsIn(contextText), '0', '1', '2']);
  return [...new Set(numsIn(reply).filter((n) => !allowed.has(n)))];
}

/** 問 AI；回傳 { text, warning } */
export async function askLLM(args) {
  if (!engine) throw new Error('本機 AI 尚未載入');
  const messages = buildMessages(args);
  const res = await engine.chat.completions.create({ messages, temperature: 0.3, max_tokens: 320 });
  const text = (res.choices?.[0]?.message?.content || '').replace(/顯然/g, '可以看出');
  const ctxText = messages.slice(0, 2).map((m) => m.content).join('\n');
  const bad = unknownNumbers(text, ctxText);
  return {
    text,
    warning: bad.length ? `提醒：AI 提到的數字 ${bad.join('、')} 沒有出現在解題步驟中，請以上面的步驟為準。` : null,
  };
}
