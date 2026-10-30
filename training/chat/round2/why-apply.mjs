// 「為什麼」改成先查觀念工具（concept）再用比喻講：每個數學道理都要有出處
//   node training/chat/round2/why-apply.mjs training/chat/round2/why-tools.jsonl
// - 移除 extra-why.jsonl 加進去、沒用工具的「為什麼」對話（學生只打「不懂」那段保留）
// - 把 why-tools.jsonl 組成用工具的對話（工具結果由真的資料庫查），放進 tools.jsonl
// - 好壞對照：查工具再講＝好；沒查就亂講（第一輪模型的回答或 AI 味）＝壞
// 可以重複跑（會先移除舊的 why-*）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTool } from '../../../src/agent/tools.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = (p) => readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const write = (p, rows) => writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const OLD = '基本觀念的為什麼（會追問）';
const NEW = '基本觀念的為什麼（查觀念工具）';
const keepOld = (msgs) => msgs[0]?.content === '不懂';

const chat = read(join(DATA, 'chat.jsonl')).filter((o) => o.category !== OLD || keepOld(o.messages));
const pairs = read(join(DATA, 'pairs.jsonl')).filter((o) => !(o.category === OLD && !keepOld(o.prompt)) && o.category !== NEW);
const tools = read(join(DATA, 'tools.jsonl')).filter((o) => !o.id.startsWith('why-'));

const problems = [];
const digits = (t) => String(t).normalize('NFKC').match(/\d+/g) || [];
for (const item of read(process.argv[2])) {
  const messages = [];
  for (const t of item.turns) {
    messages.push({ role: 'user', content: t.user });
    const args = { name: t.query };
    const result = runTool('concept', args);
    if (result.error && !item.id.endsWith('-17')) problems.push(`${item.id}：查不到「${t.query}」`);
    const call = `${t.lead ? t.lead + '\n' : ''}<tool>${JSON.stringify({ name: 'concept', args })}</tool>`;
    pairs.push({ category: NEW, prompt: messages.slice(), chosen: call, rejected: t.rejected, why: '第二輪：問為什麼要先查觀念，不能自己講' });
    messages.push({ role: 'assistant', content: call });
    messages.push({ role: 'user', content: `<result name="concept">${JSON.stringify(result)}</result>` });
    const seen = messages.map((m) => m.content).join(' ');
    const extra = digits(t.final).filter((n) => !digits(seen).includes(n));
    if (extra.length) problems.push(`${item.id}：出現沒給的數字 ${extra.join('、')}`);
    if (t.final.length > 80) problems.push(`${item.id}：太長`);
    if (/\\[a-z]|\$|\*\*/.test(t.final)) problems.push(`${item.id}：LaTeX 或 Markdown`);
    messages.push({ role: 'assistant', content: t.final });
  }
  tools.push({ id: item.id, kind: 'concept', system: 'default', messages });
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
write(join(DATA, 'chat.jsonl'), chat);
write(join(DATA, 'pairs.jsonl'), pairs);
write(join(DATA, 'tools.jsonl'), tools);
console.log(`閒聊 ${chat.length} 段、工具 ${tools.length} 段、好壞對照 ${pairs.length} 組`);
