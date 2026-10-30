// 追加對話到第二輪資料（不改寫既有資料，可以重複跑：已有的會略過）
//   node training/chat/round2/append.mjs training/chat/round2/extra-why.jsonl
// 每行：{ category, messages, rejected: [對應每一句老師回答的壞例子] }
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkConversation } from '../build.mjs';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = (p) => readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const chat = read(join(DATA, 'chat.jsonl'));
const pairs = read(join(DATA, 'pairs.jsonl'));
const key = (msgs) => msgs.map((m) => m.content).join('|');
const have = new Set(chat.map((o) => key(o.messages)));
let added = 0;
const problems = [];
for (const o of read(process.argv[2])) {
  if (have.has(key(o.messages))) continue;
  const bad = checkConversation(o, 80);
  if (bad) {
    problems.push(`「${o.messages[0].content}」：${bad}`);
    continue;
  }
  chat.push({ category: o.category, messages: o.messages });
  let n = 0;
  o.messages.forEach((m, i) => {
    if (m.role !== 'assistant') return;
    const rejected = o.rejected?.[n++];
    if (rejected) pairs.push({ category: o.category, prompt: o.messages.slice(0, i), chosen: m.content, rejected, why: '第二輪：基本觀念要講出為什麼，追問就往下挖一層' });
  });
  added++;
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
const write = (p, rows) => writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
write(join(DATA, 'chat.jsonl'), chat);
write(join(DATA, 'pairs.jsonl'), pairs);
console.log(`新增 ${added} 段；閒聊共 ${chat.length} 段、好壞對照共 ${pairs.length} 組`);
