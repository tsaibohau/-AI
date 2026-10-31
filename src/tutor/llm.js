// 本機 AI 助教（選用）：用 WebLLM 在瀏覽器裡跑開源小模型，只負責「聽懂追問、用口語解釋」。
// 數學內容一律來自解題引擎；AI 回覆中出現步驟裡沒有的數字時會標示提醒。
// 模型只在使用者按下「下載」後才載入；問題不會傳到任何伺服器。

// 我們自己訓練的老師（第二階段，見 training/chat/）：權重放在使用者的 Hugging Face（公開），
// 架構和官方 Qwen2.5 一樣，直接用官方編譯好的網頁執行檔，只換權重網址
const tutorOf = (size) => ({
  id: `math-tutor-qwen2.5-${size}-q4f16_1-MLC`,
  url: `https://huggingface.co/HauHau2010/math-tutor-qwen2.5-${size}-q4f16_1-MLC`,
  base: `Qwen2.5-${size.toUpperCase()}-Instruct-q4f16_1-MLC`,
});
export const TUTORS = [tutorOf('1.5b'), tutorOf('0.5b')];
export const TUTOR_MODEL_ID = TUTORS[0].id;
export const TUTOR_SMALL_ID = TUTORS[1].id;

export const MODELS = [
  { id: TUTOR_MODEL_ID, label: '數學解惑老師（我們訓練的，約 1 GB）', vramMB: 1630 },
  { id: TUTOR_SMALL_ID, label: '數學解惑老師・小（我們訓練的，約 0.3 GB，舊手機用）', vramMB: 950 },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: '標準（約 1 GB，手機可用）', vramMB: 1630 },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: '輕量（約 0.4 GB，較快、較不準）', vramMB: 950 },
  { id: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC', label: '輕量・相容版（約 0.5 GB，iPhone 跑不動時試這個）', vramMB: 1060 },
  { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: '進階（約 2 GB，建議電腦或新手機）', vramMB: 2505 },
  { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', label: '最強（約 5 GB，只適合有獨立顯示卡的電腦）', vramMB: 5107 },
];

/** 直接用已載入的本機模型對話（給 AI 對話頁用） */
export async function chatRaw(messages, { maxTokens = 700, temperature = 0.2 } = {}) {
  if (!engine) throw new Error('本機 AI 尚未載入，請先到設定下載並啟用');
  const ask = async () => (await engine.chat.completions.create({ messages, temperature, max_tokens: maxTokens })).choices?.[0]?.message?.content || '';
  try {
    return await ask();
  } catch (e) {
    if (!isGpuLost(e) || !loadedId) throw e;
    // 手機切到別的 App 或記憶體不夠時，系統會收回 GPU，模型就失效了：從手機裡的檔案重新載入（不用重新下載）再試一次
    const id = loadedId;
    engine = null;
    loadedId = null;
    try {
      await loadModel(id);
    } catch {
      throw new Error(`${gpuGoneMessage(id)}（技術訊息：${String(e?.message || e).slice(0, 80)}${lastLost ? `；GPU：${lastLost.slice(0, 160)}` : ''}）`);
    }
    return await ask();
  }
}

const GPU_GONE = '手機把 GPU 收回去了（通常是記憶體不夠）。請把網頁完全關掉再打開；如果常常這樣，改選「數學解惑老師・小」。';
const GPU_GONE_SMALL = '這支手機的記憶體跑不動本機 AI（連最小的模型也被收回 GPU）。可以先用上方的「老師帶我做」（不需要 AI），或把其他 App 和分頁都關掉再試一次。';

/** GPU 被收回時給的建議：已經是小模型就不要再叫人選小的 */
export function gpuGoneMessage(id) {
  const small = MODELS.find((m) => m.id === id)?.vramMB <= 1000;
  return small ? GPU_GONE_SMALL : GPU_GONE;
}

/** 設定裡顯示用的模型名稱（括號前那段） */
export const modelName = (id) => MODELS.find((m) => m.id === id)?.label.replace(/（.*$/, '') || '';

/** GPU 被系統收回的錯誤（WebLLM／TVM 的訊息） */
export const isGpuLost = (e) => /disposed|device (was |is )?lost|GPUDevice|destroyed|compatible GPU/i.test(String(e?.message || e));

export const loadedModel = () => loadedId;

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

/** WebLLM 的模型清單：官方的＋我們訓練的老師（純函式，可測試） */
export function appConfigFor(webllm) {
  const list = webllm.prebuiltAppConfig.model_list;
  const ours = TUTORS.flatMap((t) => {
    const base = list.find((m) => m.model_id === t.base);
    return base ? [{ ...base, model: t.url, model_id: t.id }] : [];
  });
  const ids = new Set(ours.map((m) => m.model_id));
  return { ...webllm.prebuiltAppConfig, model_list: [...list.filter((m) => !ids.has(m.model_id)), ...ours] };
}

export const isReady = () => engine !== null;

/** 下載（第一次）並載入模型；onProgress({ progress: 0~1, text }) */
export async function loadModel(id, onProgress = () => {}) {
  if (engine && loadedId === id) return engine;
  watchDeviceLost();
  const webllm = await import('@mlc-ai/web-llm');
  engine = await createEngine(webllm, id, onProgress);
  shrinkPrefill(engine, id);
  loadedId = id;
  saveModel(id);
  return engine;
}


/** 記下 GPU 被收回的原因（iPhone 除錯用；WebLLM 只寫在 console，手機看不到） */
let lastLost = '';
let watching = false;
function watchDeviceLost() {
  const A = typeof GPUAdapter === 'undefined' ? null : GPUAdapter;
  if (watching || !A?.prototype?.requestDevice) return;
  watching = true;
  const orig = A.prototype.requestDevice;
  A.prototype.requestDevice = async function (...args) {
    const dev = await orig.apply(this, args);
    dev.lost?.then?.((info) => {
      lastLost = `${info?.reason || ''} ${info?.message || ''}`.trim();
    });
    return dev;
  };
}
export const lastDeviceLost = () => lastLost;

/** iPhone／iPad（iPadOS 會假裝是 Mac） */
export const isAppleMobile = (nav = typeof navigator === 'undefined' ? null : navigator) =>
  !!nav && (/iPhone|iPad|iPod/.test(nav.userAgent || '') || (/Macintosh/.test(nav.userAgent || '') && nav.maxTouchPoints > 1));

/**
 * iOS Safari 一次送太多運算給 GPU 會把 GPU 弄丟（跟記憶體大小無關）。
 * WebLLM 的分段大小寫死在模型程式裡（1024 字），設定檔改不到，只能載入後調小：
 * 只會變慢一點，不影響答案。
 */
export const IOS_PREFILL_CHUNK = 128;
export function shrinkPrefill(eng, id, nav) {
  if (!isAppleMobile(nav)) return false;
  const p = eng?.loadedModelIdToPipeline?.get?.(id);
  if (!p || !(p.prefillChunkSize > IOS_PREFILL_CHUNK)) return false;
  p.prefillChunkSize = IOS_PREFILL_CHUNK;
  return true;
}

async function createEngine(webllm, id, onProgress) {
  try {
    return await webllm.CreateMLCEngine(id, { appConfig: appConfigFor(webllm), initProgressCallback: (r) => onProgress({ progress: r.progress ?? 0, text: r.text || '' }) });
  } catch (e) {
    if (/compatible GPU/i.test(String(e?.message))) throw new Error(gpuGoneMessage(id));
    if (/Response is not OK/i.test(String(e?.message))) {
      throw new Error(TUTORS.some((t) => t.id === id) ? '這個模型還沒準備好（可能還在訓練或上傳中），先選別的模型。' : '下載失敗，請檢查網路再試一次。');
    }
    throw e;
  }
}

/** 這台裝置是否已經下載過模型 */
export async function isDownloaded(id) {
  try {
    const webllm = await import('@mlc-ai/web-llm');
    return await webllm.hasModelInCache(id, appConfigFor(webllm));
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
  await webllm.deleteModelAllInfoInCache(id, appConfigFor(webllm));
  saveModel(null);
}

const SYSTEM = `你是台灣高中數學家教，學生對一題數學題有疑問。
請遵守：
1. 只根據「題目資料」解釋，不要自己做新的計算，不要改動任何數字或答案。
2. 學生還沒看到答案時，不要說出最後答案。
3. 只回答學生問的那一件事。學生問圖形，就用「圖上的點」來說明（例如 x = 0 時 y 是多少），不要重講整題。
4. 用繁體中文口語回答，最多 3 句、100 字以內，最後可以問學生一個小問題。
5. 數學式直接用一般文字與符號寫，例如 x ≠ −2、x² − 1、√2、≤、≥。
   絕對不要用 LaTeX（不要寫反斜線、\\( \\)、$ 符號），也不要用 Markdown（不要寫 **、#、- 開頭的清單）。
6. 不要寫「顯然」。`;

/** 組出給模型的訊息（純函式，可測試） */
export function buildMessages({ question, problem, step, lesson, graph, answerShown, history = [] }) {
  const ctx = [
    `題目：${problem}`,
    step ? `目前這一步：${step.step}` : '',
    step?.reason ? `這一步的理由：${step.reason}` : '',
    step?.detail ? `計算細節：${step.detail}` : '',
    lesson ? `相關觀念：${lesson}` : '',
    graph ? `圖解說明：${graph}` : '',
    answerShown ? `最後答案（學生已看過）：${answerShown}` : '學生還沒看到最後答案。',
  ]
    .filter(Boolean)
    .join('\n');
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `【題目資料】\n${ctx}` },
    { role: 'assistant', content: '好的，我會只根據這些資料，用一般文字回答。' },
    ...history.slice(-4),
    { role: 'user', content: question },
  ];
}

const LATEX = [
  [/\\neq|\\ne(?![a-z])/g, '≠'],
  [/\\leq?(?![a-z])/g, '≤'],
  [/\\geq?(?![a-z])/g, '≥'],
  [/\\times/g, '×'],
  [/\\cdot/g, '·'],
  [/\\div/g, '÷'],
  [/\\pm/g, '±'],
  [/\\infty/g, '∞'],
  [/\\cup/g, '∪'],
  [/\\cap/g, '∩'],
  [/\\in(?![a-z])/g, '∈'],
  [/\\Rightarrow|\\implies/g, '⇒'],
  [/\\Leftrightarrow|\\iff/g, '⇔'],
  [/\\to|\\rightarrow/g, '→'],
  [/\\pi/g, 'π'],
  [/\\theta/g, 'θ'],
  [/\\Delta/g, 'Δ'],
  [/\\log_\{?(\w+)\}?/g, 'log_$1'],
  [/\\(log|ln|sin|cos|tan)/g, '$1'],
  [/\\left|\\right/g, ''],
  [/\\[,;!: ]/g, ' '],
  [/\\quad|\\qquad/g, ' '],
];
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', n: 'ⁿ', x: 'ˣ' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };

/** 把 AI 輸出的 LaTeX、Markdown 轉成一般文字（純函式，可測試） */
export function cleanText(raw, { keepBold = false } = {}) {
  let t = String(raw || '');
  // 分數與根號（由內而外處理幾次，應付巢狀）
  for (let i = 0; i < 3; i++) {
    t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => `${/^[\w.]+$/.test(a) ? a : `(${a})`}/${/^[\w.]+$/.test(b) ? b : `(${b})`}`);
    t = t.replace(/\\sqrt\{([^{}]*)\}/g, (_, a) => (/^[\w.]+$/.test(a) ? `√${a}` : `√(${a})`));
  }
  for (const [re, rep] of LATEX) t = t.replace(re, rep);
  // 上下標
  t = t.replace(/\^\{([0-9nx-]+)\}|\^([0-9nx])(?![0-9])/g, (_, a, b) => [...(a || b)].map((c) => SUP[c] ?? c).join(''));
  t = t.replace(/_\{(\d+)\}|log_(\d+)/g, (m, a, b) => (b ? `log${[...b].map((c) => SUB[c]).join('')}` : [...a].map((c) => SUB[c]).join('')));
  // 拿掉數學模式的括號與錢字號、剩下的反斜線指令
  t = t.replace(/\\\(|\\\)|\\\[|\\\]/g, '').replace(/\$+/g, '');
  t = t.replace(/\\(text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, '$2').replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '');
  // Markdown：粗體、標題、清單符號
  if (!keepBold) t = t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*\*/g, '');
  t = t.replace(/^#+\s*/gm, '').replace(/^\s*[-*]\s+/gm, '・');
  // 句中的「 - 分子…」也是清單；但「x - 1」的 - 是減號，只有後面接中文才當清單
  t = t.replace(/(^|\s)-\s+(?=[\u3400-\u9fff])/g, '\n・');
  t = t.replace(/顯然/g, '可以看出');
  return t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
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
  const res = await engine.chat.completions.create({ messages, temperature: 0.2, max_tokens: 200 });
  const choice = res.choices?.[0];
  let text = cleanText(choice?.message?.content || '');
  // 被長度截斷時，切在最後一個完整句子
  if (choice?.finish_reason === 'length') {
    const cut = Math.max(text.lastIndexOf('。'), text.lastIndexOf('？'), text.lastIndexOf('！'));
    text = cut > 20 ? text.slice(0, cut + 1) : `${text}…`;
  }
  const ctxText = messages.slice(0, 2).map((m) => m.content).join('\n');
  const bad = unknownNumbers(text, ctxText);
  return {
    text,
    warning: bad.length ? `提醒：AI 提到的數字 ${bad.join('、')} 沒有出現在解題步驟中，請以上面的步驟為準。` : null,
  };
}
