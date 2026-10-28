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
  for (let round = 0; round < maxRounds; round++) {
    if (signal?.aborted) {
      onEvent({ type: 'done', stopped: true });
      return messages;
    }
    const resp = await provider.complete({ system: SYSTEM_PROMPT, messages, tools, signal });
    const msg = { role: 'assistant', text: resp.text || '', toolCalls: resp.toolCalls || [], raw: resp.raw };
    messages.push(msg);
    onEvent({ type: 'assistant', message: msg });
    if (!msg.toolCalls.length) {
      onEvent({ type: 'done' });
      return messages;
    }
    const results = msg.toolCalls.map((call) => {
      const result = runTool(call.name, call.args);
      // 圖解規格只給畫面用，不必回傳給模型
      const { __diagram, ...forModel } = result || {};
      onEvent({ type: 'tool', call, result: forModel, diagram: __diagram || null });
      return { id: call.id, name: call.name, result: forModel };
    });
    messages.push({ role: 'tool', results });
  }
  onEvent({ type: 'done', truncated: true });
  return messages;
}
