// 「聽懂學生的話」小模型（自己訓練，見 training/nlu/）：在瀏覽器裡判斷學生的回答最接近哪個選項
// 只在學生按下啟用後才下載（模型約 23 MB，加上執行程式），之後瀏覽器會快取；數學內容與講解不經過模型
const NONE = '和題目無關、看不懂'; // 訓練時「無關」選項的文字，要一致
const PREF = 'mt.nlu.enabled.v1';
let model = null;
let tokenizer = null;
let loading = null;

export const isReady = () => model !== null;

export function wanted() {
  try {
    return localStorage.getItem(PREF) === '1';
  } catch {
    return false;
  }
}

/** 載入模型；base 是放 models/ 的位置（瀏覽器用網站路徑，node 測試用檔案路徑） */
export async function load(base = new URL('models/', document.baseURI).pathname) {
  if (model) return;
  loading ||= (async () => {
    const { env, AutoTokenizer, AutoModelForSequenceClassification } = await import('@huggingface/transformers');
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = base;
    tokenizer = await AutoTokenizer.from_pretrained('nlu');
    model = await AutoModelForSequenceClassification.from_pretrained('nlu', { dtype: 'q8' });
    try {
      localStorage.setItem(PREF, '1');
    } catch {
      /* 忽略 */
    }
  })();
  try {
    await loading;
  } finally {
    loading = null;
  }
}

/**
 * 判斷學生的話最接近哪個選項。
 * 回傳 { index, scores }：index 是 options 的位置；-1 代表和題目無關或看不懂
 */
export async function classify(options, reply) {
  if (!model) throw new Error('小模型還沒載入');
  const opts = [NONE, ...options];
  const inputs = await tokenizer(opts, { text_pair: opts.map(() => reply), padding: true, truncation: true, max_length: 64 });
  const { logits } = await model(inputs);
  const scores = Array.from(logits.data);
  const best = scores.indexOf(Math.max(...scores));
  return { index: best - 1, scores };
}
