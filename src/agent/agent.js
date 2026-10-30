// 對話流程：模型規劃 → 呼叫工具 → 把結果交回模型 → 直到模型給出回答
// 與模型無關：provider 只要實作 complete({ system, messages, tools })
import { SYSTEM_PROMPT } from './prompt.js';
import { runTool, toolDeclarations } from './tools.js';

export const MAX_ROUNDS = 10;

/**
 * 訊息格式（與模型無關）：
 *  { role: 'user', text, images?: [{ mimeType, base64 }] }
 *  { role: 'assistant', text, toolCalls?: [{ id, name, args }], raw? }
 *  { role: 'tool', results: [{ id, name, result }] }
 *
 * provider.complete() 回傳 { text, toolCalls, raw }
 * onEvent({ type: 'assistant' | 'tool' | 'done' | 'error', ... })
 */
export async function runAgent({ provider, history, user, onEvent = () => {}, maxRounds = MAX_ROUNDS, signal }) {
  const messages = [...history, { role: 'user', ...user }];
  const tools = toolDeclarations();
  const tried = new Map(); // 同一個工具指令 → 上次的結果（失敗的不准重試，避免鬼打牆）
  let lastSig = null;
  let failRounds = 0;
  for (let round = 0; round < maxRounds; round++) {
    if (signal?.aborted) {
      onEvent({ type: 'done', stopped: true });
      return messages;
    }
    const resp = await provider.complete({ system: SYSTEM_PROMPT, messages, tools, signal });
    const msg = { role: 'assistant', text: resp.text || '', toolCalls: resp.toolCalls || [], raw: resp.raw };
    // 模型整段重複上一輪（同樣的話、同樣的工具）：小模型卡住了，停下來
    const sig = JSON.stringify([msg.text, msg.toolCalls.map((c) => [c.name, c.args])]);
    if (sig === lastSig) {
      onEvent({ type: 'done', looped: true });
      return messages;
    }
    lastSig = sig;
    messages.push(msg);
    onEvent({ type: 'assistant', message: msg });
    if (!msg.toolCalls.length) {
      onEvent({ type: 'done' });
      return messages;
    }
    let failed = 0;
    const results = msg.toolCalls.map((call) => {
      const key = JSON.stringify([call.name, call.args]);
      const prev = tried.get(key);
      let result;
      if (prev?.error) {
        result = { error: `這個指令剛剛已經失敗過（${prev.error}），不要重試同一個。換別的工具，或直接跟學生說明哪裡做不到。` };
      } else {
        result = runTool(call.name, call.args);
        tried.set(key, result);
      }
      if (result?.error) failed++;
      // 圖解規格只給畫面用，不必回傳給模型
      const { __diagram, ...forModel } = result || {};
      onEvent({ type: 'tool', call, result: forModel, diagram: __diagram || null });
      return { id: call.id, name: call.name, result: forModel };
    });
    messages.push({ role: 'tool', results });
    // 連續兩輪工具全部失敗：不要再試了
    failRounds = failed === results.length ? failRounds + 1 : 0;
    if (failRounds >= 2) {
      onEvent({ type: 'done', looped: true });
      return messages;
    }
  }
  onEvent({ type: 'done', truncated: true });
  return messages;
}
