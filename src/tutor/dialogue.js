// 引導式對話：照劇本（data/dialogues.json）一問一答，從學生的回答判斷卡在哪裡，用比喻帶回來
// 不需要 AI；本機 AI 已啟用時，只用來把學生打的字對應到劇本選項（聽懂，不負責講）
import data from '../../data/dialogues.json' with { type: 'json' };
import { compareAnswer, compareExpr } from '../core/answer.js';

export const SCRIPTS = data.scripts;

const fill = (s, vars) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
const hasMissing = (s) => /\{\w+\}/.test(s);
const norm = (t) => String(t || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();

/** 開始一段對話；回傳狀態 { script, node, vars, log, done, stucks, okCount, lastOk, pick } */
export function startDialogue(scriptId, vars = {}) {
  const sc = SCRIPTS[scriptId];
  if (!sc) throw new Error(`沒有這個對話劇本：${scriptId}`);
  const st = { script: scriptId, node: sc.start, vars, log: [], done: false, stucks: [], okCount: 0, lastOk: false, pick: false };
  st.log.push({ who: 't', text: fill(sc.nodes[sc.start].say, vars) });
  return st;
}

/** 目前節點可用的答案（變數缺少的答案略過，例如水平線沒有「倒數」） */
export function answersOf(st) {
  const node = SCRIPTS[st.script].nodes[st.node];
  return (node.answers || []).filter((a) => !(a.value && hasMissing(fill(a.value, st.vars))));
}

/** 給學生點的選項（有 label 的答案） */
export const optionsOf = (st) => answersOf(st).filter((a) => a.label).map((a) => fill(a.label, st.vars));

function typedOk(a, text, vars) {
  const value = fill(a.value, vars);
  try {
    if (a.type === 'expr') return compareExpr(value, text, a.var || 'x').ok;
    return compareAnswer({ type: a.type, value }, text).ok;
  } catch {
    return false;
  }
}

/**
 * 不用 AI，把學生的話對應到答案；對不上回傳 null。
 * 順序：有 type 的答案 → keys（取最長的命中字）→ 看起來像在作答（有數字或 x、y）就走 else
 */
export function matchAnswer(st, text) {
  const as = answersOf(st);
  const t = norm(text);
  if (!t) return null;
  const label = as.find((a) => a.label && norm(fill(a.label, st.vars)) === t);
  if (label) return label;
  const typed = as.find((a) => a.type && typedOk(a, text, st.vars));
  if (typed) return typed;
  let best = null;
  let len = 0;
  for (const a of as) {
    for (const k of a.keys || []) {
      const kk = norm(k);
      if (kk && t.includes(kk) && kk.length > len) [best, len] = [a, kk.length];
    }
  }
  if (best) return best;
  if (as.some((a) => a.type) && /[0-9xy]/i.test(t)) return as.find((a) => a.else) || null;
  return null;
}

/** 本機 AI 用的提示：把學生的話對應到選項編號 */
export function classifyPrompt(st, text) {
  const opts = optionsOf(st);
  const q = st.log.filter((m) => m.who === 't').at(-1)?.text || '';
  return [
    { role: 'system', content: '你是數學老師的助手。判斷學生的回答最接近哪一個選項。只回答一個數字；都不像就回答 0。' },
    { role: 'user', content: `老師問：${q}\n學生回答：${text}\n選項：\n${opts.map((o, i) => `${i + 1}. ${o}`).join('\n')}` },
  ];
}

/** 解析 AI 的回覆，回傳對應的答案或 null */
export function fromClassify(st, reply) {
  const n = Number(String(reply).match(/\d+/)?.[0]);
  const withLabel = answersOf(st).filter((a) => a.label);
  return n >= 1 && n <= withLabel.length ? withLabel[n - 1] : null;
}

/** 走到某個答案：老師回應、記錄卡點、換到下一個節點 */
export function applyAnswer(st, a) {
  const vars = st.vars;
  st.pick = false;
  if (a.say) st.log.push({ who: 't', text: fill(a.say, vars) });
  if (a.stuck && !st.stucks.includes(a.stuck)) st.stucks.push(a.stuck);
  st.lastOk = !!a.ok;
  if (a.ok) st.okCount++;
  const next = SCRIPTS[st.script].nodes[a.next];
  st.node = a.next;
  if (next.say) st.log.push({ who: 't', text: fill(next.say, vars) });
  if (next.end) st.done = true;
  return st;
}

/**
 * 學生回話（打字或點選項）。
 * 回傳 { matched: boolean }；沒對上時老師會請學生從選項挑（st.pick = true）
 */
export function reply(st, text, matched = matchAnswer(st, text)) {
  if (st.done || !String(text).trim()) return { matched: false };
  st.log.push({ who: 's', text: String(text).trim() });
  if (!matched) {
    st.log.push({ who: 't', text: '我想確定一下你的意思，比較接近下面哪一個？' });
    st.pick = true;
    return { matched: false };
  }
  applyAnswer(st, matched);
  return { matched: true };
}
