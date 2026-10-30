// 第二輪資料：把老師的話全部改成「快、狠、準」（見 docs/老師個性.md）
//   node training/chat/round2/apply.mjs training/chat/round2（只能跑一次：它會改寫 data/）
// 改寫資料夾裡要有：
//   chat-new.txt    「編號 新回答」，編號是 chat.jsonl 的「第幾段.第幾句」
//   tools-new.txt   「id|開場白|最後的講解」，開場白空白代表只輸出工具指令
//   extra-chat.jsonl、extra-tools.jsonl   補強弱點的新對話（附壞例子）
// 產生：data/chat.jsonl、data/tools.jsonl（改寫後）、data/pairs.jsonl（新＝好、舊＝壞）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTool } from '../../../src/agent/tools.js';
import { checkConversation } from '../build.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(HERE, 'data');
const SRC = process.argv[2];
if (!SRC) throw new Error('用法：node training/chat/round2/apply.mjs training/chat/round2（只能跑一次：它會改寫 data/）');

const readJsonl = (p) => readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const writeJsonl = (p, rows) => writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const lines = (p) => readFileSync(p, 'utf8').split('\n').filter((l) => l.trim());

const pairs = [];
const problems = [];

// ---------- 閒聊對話 ----------
const chat = readJsonl(join(DATA, 'chat.jsonl'));
const newChat = new Map(lines(join(SRC, 'chat-new.txt')).map((l) => {
  const i = l.indexOf(' ');
  return [l.slice(0, i), l.slice(i + 1).trim()];
}));
chat.forEach((o, i) => {
  o.messages.forEach((m, j) => {
    if (m.role !== 'assistant') return;
    const key = `${i}.${j}`;
    const t = newChat.get(key);
    if (!t) return problems.push(`閒聊 ${key} 沒有新回答`);
    pairs.push({ category: o.category, prompt: o.messages.slice(0, j).map((x, k) => (x.role === 'assistant' ? { ...x, content: newChat.get(`${i}.${k}`) } : x)), chosen: t, rejected: m.content, why: '第二輪：太長、客套，不夠快狠準' });
    m.content = t;
  });
  const bad = checkConversation(o, 80);
  if (bad) problems.push(`閒聊 ${i}：${bad}｜${o.messages.at(-1).content}`);
});
for (const o of readJsonl(join(SRC, 'extra-chat.jsonl'))) {
  const conv = { category: o.category, messages: [{ role: 'user', content: o.user }, { role: 'assistant', content: o.chosen }] };
  const bad = checkConversation(conv, 80);
  if (bad) problems.push(`新閒聊「${o.user}」：${bad}`);
  chat.push(conv);
  pairs.push({ category: o.category, prompt: [{ role: 'user', content: o.user }], chosen: o.chosen, rejected: o.rejected, why: '第二輪：補強弱點（壞例子取自第一輪模型的回答或 AI 味寫法）' });
}

// ---------- 用工具的對話 ----------
const tools = readJsonl(join(DATA, 'tools.jsonl'));
const newTools = new Map(lines(join(SRC, 'tools-new.txt')).map((l) => {
  const [id, lead, final] = l.split('|');
  return [id, { lead: lead.trim(), final: final.trim() }];
}));
const toolLine = (content) => content.split('\n').find((l) => l.startsWith('<tool>'));
for (const o of tools) {
  const t = newTools.get(o.id);
  if (!t) {
    problems.push(`工具 ${o.id} 沒有新回答`);
    continue;
  }
  const [, call, result, last] = o.messages;
  call.content = (t.lead ? t.lead + '\n' : '') + toolLine(call.content);
  pairs.push({ category: `工具：${o.kind}`, prompt: o.messages.slice(0, 3), chosen: t.final, rejected: last.content, why: '第二輪：講解太長' });
  last.content = t.final;
  // 最後的講解只能用學生給的數字和工具結果裡的數字
  const seen = (o.messages[0].content + result.content + call.content).normalize('NFKC');
  const extra = (t.final.normalize('NFKC').match(/\d+/g) || []).filter((n) => !(seen.match(/\d+/g) || []).includes(n));
  if (extra.length) problems.push(`工具 ${o.id}：出現沒給的數字 ${extra.join('、')}`);
}
for (const o of readJsonl(join(SRC, 'extra-tools.jsonl'))) {
  const args = { equations: o.equations };
  const res = runTool('solve_linear_system', args);
  const sol = res.solution || {};
  if (sol.x !== o.x || sol.y !== o.y) problems.push(`工具 ${o.id}：引擎算出 ${JSON.stringify(res)}，跟資料不符`);
  const messages = [
    { role: 'user', content: o.user },
    { role: 'assistant', content: `${o.lead}\n<tool>${JSON.stringify({ name: 'solve_linear_system', args })}</tool>` },
    { role: 'user', content: `<result name="solve_linear_system">${JSON.stringify(res)}</result>` },
    { role: 'assistant', content: o.final },
  ];
  tools.push({ id: o.id, kind: o.kind, system: 'default', messages });
  // 壞例子：沒用工具、自己亂講
  pairs.push({ category: `工具：${o.kind}`, prompt: [{ role: 'user', content: o.user }], chosen: messages[1].content, rejected: o.rejected, why: '第二輪：恆過定點要用工具，不能自己代數字' });
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
writeJsonl(join(DATA, 'chat.jsonl'), chat);
writeJsonl(join(DATA, 'tools.jsonl'), tools);
writeJsonl(join(DATA, 'pairs.jsonl'), pairs);
console.log(`閒聊 ${chat.length} 段、工具 ${tools.length} 段、好壞對照 ${pairs.length} 組`);
