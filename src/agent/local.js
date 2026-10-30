// 本機模型（WebLLM）：小模型不一定支援標準的工具呼叫，所以用簡單的文字協定：
//   模型要計算時輸出 <tool>{"name": "...", "args": {...}}</tool>，程式執行後把結果用 <result> 回給它
import { chatRaw, isReady, loadedModel } from '../tutor/llm.js';

/** 把工具清單寫成文字說明（純函式，可測試） */
export function toolGuide(tools) {
  const lines = tools.map((t) => {
    const props = Object.entries(t.parameters?.properties || {})
      .map(([k, v]) => `${k}${(t.parameters.required || []).includes(k) ? '' : '（可省略）'}：${v.description || (v.enum ? v.enum.join(' 或 ') : v.type)}`)
      .join('；');
    return `・${t.name}：${t.description} 參數：${props || '無'}`;
  });
  return `你可以使用下列工具：
${lines.join('\n')}

要使用工具時，可以先用一句話說明要算什麼，再另起一行輸出工具指令（工具指令那一行不要有其他文字）：
<tool>{"name": "工具名稱", "args": {"參數": "值"}}</tool>
例如：<tool>{"name": "slope", "args": {"p1": "(2,1)", "p2": "(3,5)"}}</tool>
收到 <result> 之後再繼續，可以再呼叫工具，算完再用一般文字回答學生。`;
}

/** 從模型輸出找出工具呼叫（純函式，可測試）；回傳 { text, toolCalls } */
export function parseToolCalls(raw) {
  const calls = [];
  let text = String(raw || '');
  const grab = (json) => {
    try {
      const o = JSON.parse(json);
      if (o && typeof o.name === 'string') calls.push({ id: `${o.name}-${calls.length}`, name: o.name, args: o.args || o.arguments || {} });
      return true;
    } catch {
      return false;
    }
  };
  text = text.replace(/<tool>\s*([\s\S]*?)\s*<\/tool>/g, (m, json) => (grab(json) ? '' : m));
  // 小模型有時會寫成 ```json {...} ``` 或 <tool_call>
  text = text.replace(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g, (m, json) => (grab(json) ? '' : m));
  if (!calls.length) {
    text = text.replace(/```(?:json)?\s*(\{[\s\S]*?"name"[\s\S]*?\})\s*```/g, (m, json) => (grab(json) ? '' : m));
  }
  // 小模型常把工具指令寫壞（例如少了大括號）：認不出來的一律藏起來，不讓學生看到亂碼
  const before = text;
  text = text
    .replace(/```[a-z]*\s*[\s\S]*?(tool|"name"|"args")[\s\S]*?```/gi, '')
    .replace(/<\/?tool[^>]*>/gi, '')
    .replace(/^.*(\btool\s*>|"name"\s*:|"args"\s*:).*$/gim, '')
    .replace(/```[a-z]*/gi, '')
    .replace(/\n{3,}/g, '\n\n');
  return { text: text.trim(), toolCalls: calls, garbled: !calls.length && text !== before };
}

/**
 * 小模型常把系統提示詞的規則原封不動念給學生（例如「學生問為什麼時，先用 concept 工具查…」）。
 * 回覆裡跟提示詞有一長段完全一樣的句子就刪掉（純函式，可測試）。
 */
export function stripPromptEcho(text, prompt, minLen = 14) {
  const norm = (t) => String(t).replace(/\s+/g, '');
  const p = norm(prompt);
  const echoes = (sentence) => {
    const s = norm(sentence);
    if (s.length < minLen) return false;
    for (let i = 0; i + minLen <= s.length; i += 4) if (p.includes(s.slice(i, i + minLen))) return true;
    return false;
  };
  return String(text || '')
    .split('\n')
    .map((line) => line.split(/(?<=[。！？；])/).filter((x) => !echoes(x)).join(''))
    .filter((line, i, all) => line.trim() || (i > 0 && all[i - 1].trim()))
    .join('\n')
    .trim();
}

/** 通用訊息 → WebLLM 對話格式（純函式，可測試） */
export function toChat(system, tools, messages) {
  const out = [{ role: 'system', content: `${system}\n\n${toolGuide(tools)}` }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.text || '' });
    else if (m.role === 'assistant') out.push({ role: 'assistant', content: m.raw || m.text || '' });
    else out.push({ role: 'user', content: m.results.map((r) => `<result name="${r.name}">${JSON.stringify(r.result)}</result>`).join('\n') });
  }
  return out;
}

export function localProvider() {
  return {
    name: 'local',
    get label() {
      return `本機 AI（${(loadedModel() || '').replace(/-q4f16_1-MLC$/, '') || '未載入'}）`;
    },
    vision: false,
    ready: () => isReady(),
    async complete({ system, messages, tools }) {
      const raw = await chatRaw(toChat(system, tools, messages));
      const { text, toolCalls } = parseToolCalls(raw);
      return { text: stripPromptEcho(text, `${system}\n${toolGuide(tools)}`), toolCalls, raw };
    },
  };
}
