// 第三輪補強（第二輪考試 20/21 後發現的毛病），可以重複跑（會先移除舊的第三輪資料）
//   node training/chat/round3/apply.mjs
// - disc-tools.jsonl：判別式求參數（重根、相異實根、沒實根）→ 先列 b² − 4ac 再交給 solve，不准自己猜 k
// - chat.jsonl：嗆聲、髒話、稱讚、撒嬌 → 不要誤當成數學名詞（「三小就是 a²」）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTool } from '../../../src/agent/tools.js';
import { checkConversation } from '../build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const read = (p) => readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const write = (p, rows) => writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const WHY = '第三輪：';

const chat = read(join(DATA, 'chat.jsonl')).filter((o) => o.round !== 3);
const tools = read(join(DATA, 'tools.jsonl')).filter((o) => !o.id.startsWith('r3-'));
const pairs = read(join(DATA, 'pairs.jsonl')).filter((o) => !o.why?.startsWith(WHY));
const problems = [];
const digits = (t) => String(t).normalize('NFKC').match(/\d+/g) || [];

for (const o of read(join(HERE, 'chat.jsonl'))) {
  const row = { category: o.category, round: 3, messages: [{ role: 'user', content: o.user }, { role: 'assistant', content: o.chosen }] };
  const bad = checkConversation(row, 80);
  if (bad) problems.push(`「${o.user}」：${bad}`);
  chat.push(row);
  pairs.push({ category: o.category, prompt: row.messages.slice(0, 1), chosen: o.chosen, rejected: o.rejected, why: WHY + '嗆聲、稱讚不是數學名詞，回一句就拉回題目' });
}

for (const o of read(join(HERE, 'disc-tools.jsonl'))) {
  const args = { problem: o.problem };
  const result = runTool('solve', args);
  if (result.error) problems.push(`${o.id}：工具出錯 ${result.error}`);
  const call = `${o.lead}\n<tool>${JSON.stringify({ name: 'solve', args })}</tool>`;
  const messages = [
    { role: 'user', content: o.user },
    { role: 'assistant', content: call },
    { role: 'user', content: `<result name="solve">${JSON.stringify(result)}</result>` },
    { role: 'assistant', content: o.final },
  ];
  const seen = messages.slice(0, 3).map((m) => m.content).join(' ');
  const extra = digits(o.final).filter((n) => !digits(seen).includes(n));
  if (extra.length) problems.push(`${o.id}：出現沒給的數字 ${extra.join('、')}`);
  if (o.final.length > 60) problems.push(`${o.id}：太長`);
  tools.push({ id: o.id, kind: 'param', system: 'default', messages });
  pairs.push({ category: '判別式求參數（用工具）', prompt: messages.slice(0, 1), chosen: call, rejected: o.rejected, why: WHY + '求參數要列判別式交給工具，不能自己猜' });
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
write(join(DATA, 'chat.jsonl'), chat);
write(join(DATA, 'tools.jsonl'), tools);
write(join(DATA, 'pairs.jsonl'), pairs);
console.log(`閒聊 ${chat.length} 段、工具 ${tools.length} 段、好壞對照 ${pairs.length} 組`);
