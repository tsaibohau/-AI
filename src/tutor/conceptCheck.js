// 「你知道這個概念嗎？」：每一步用到定義或導出的概念時，先問學生知不知道
// - 知道 → 直接往下
// - 不知道、是「定義」→ 給定義就好（定義就是定義，沒什麼好解釋）
// - 不知道、是「導出」→ 解釋為什麼會這樣（推導），再接著問推導裡用到的概念
import { getDefinition, getDefinitionEntry } from '../core/definitions.js';

/** 一步的概念檢查狀態：queue 是還沒問的概念 id；shown 是已經講過的內容 */
export function startCheck(defs = [], known = new Set()) {
  return { queue: defs.filter((id) => getDefinitionEntry(id) && !known.has(id)), shown: [] };
}

export const currentConcept = (st) => st.queue[0] || null;
export const checkDone = (st) => st.queue.length === 0;

/** 問句 */
export function conceptQuestion(id) {
  const d = getDefinitionEntry(id);
  return d ? `你知道「${d.name}」嗎？` : null;
}

/**
 * 不知道時要講的內容：{ id, name, kind, paras: string[] }
 * level 是學生的年級（預設高中）
 */
export function explainConcept(id, level = '高中') {
  const d = getDefinition(id, level);
  if (!d) return null;
  const paras = [];
  if (d.kind === 'definition') {
    paras.push(`定義：${d.text}`);
    paras.push('這是定義，記住它就好。');
  } else {
    paras.push(`結論：${d.text}`);
    if (d.derivation) paras.push(`為什麼會這樣：${d.derivation}`);
    paras.push('這是導出來的，不用硬背，懂了推導就會了。');
  }
  if (d.missing && d.fix) paras.push(`（${d.level}的說法少講了：${d.missing}${d.fix}）`);
  return { id, name: d.name, kind: d.kind, paras };
}

/**
 * 學生回答知不知道目前的概念。
 * 不知道導出的概念時，把推導裡用到、還沒確認過的概念排到前面接著問。
 * 回傳新的狀態（不改原物件）
 */
export function answerCheck(st, knows, known = new Set(), level = '高中') {
  const id = currentConcept(st);
  if (!id) return st;
  const rest = st.queue.slice(1);
  known.add(id);
  if (knows) return { queue: rest, shown: st.shown };
  const ex = explainConcept(id, level);
  const uses = (getDefinitionEntry(id).uses || []).filter((u) => !known.has(u) && !rest.includes(u));
  return { queue: [...uses, ...rest], shown: [...st.shown, ex] };
}
