// 恆過定點改用 fixed_point 工具（一次算完），取代先自己整理再呼叫 solve_linear_system
//   node training/chat/round2/param-apply.mjs（可重複跑）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTool } from '../../../src/agent/tools.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = (p) => readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const write = (p, rows) => writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const EQ = {
  'param-1': 'y = kx + 3k − 2', 'param-2': '(m + 1)x + y − 2m = 0', 'param-3': 'ax − y + 2a + 1 = 0', 'param-4': 'y − 4 = t(x − 1)',
  'param-5': 'y = kx − k + 3', 'param-6': '(k + 2)x − y + 3k = 0', 'param-7': 'y − 1 = m(x + 4)', 'param-8': 'kx + y − 2k − 1 = 0',
  'param-9': '(a − 1)x + (a + 1)y − 2a = 0',
};
const LEAD = ['恆過定點，按參數整理。', '按參數分組，每組都等於零。', '恆過，來。', '', '提參數出來，算。'];
const tools = read(join(DATA, 'tools.jsonl'));
const pairs = read(join(DATA, 'pairs.jsonl'));
const key = (msgs) => msgs.map((m) => m.content).join('|');
let n = 0;
for (const o of tools) {
  if (!EQ[o.id]) continue;
  const [user, call, result, final] = o.messages;
  const oldPrefix = [user, call, result].map((m) => m.content);
  const args = { equation: EQ[o.id] };
  const r = runTool('fixed_point', args);
  if (!r.point || !final.content.includes(r.point)) throw new Error(`${o.id}：工具算出 ${JSON.stringify(r)}，跟講解「${final.content}」不符`);
  const lead = LEAD[n++ % LEAD.length];
  const newCall = `${lead ? lead + '\n' : ''}<tool>${JSON.stringify({ name: 'fixed_point', args })}</tool>`;
  const oldCall = call.content;
  call.content = newCall;
  result.content = `<result name="fixed_point">${JSON.stringify(r)}</result>`;
  // 好壞對照跟著換：提示換成新的前文、「好的工具呼叫」換成新的
  for (const p of pairs) {
    if (p.prompt.length >= 3 && key(p.prompt.slice(0, 3)) === oldPrefix.join('|')) p.prompt = o.messages.slice(0, 3);
    if (p.prompt.length === 1 && p.prompt[0].content === user.content && p.chosen === oldCall) p.chosen = newCall;
  }
}
write(join(DATA, 'tools.jsonl'), tools);
write(join(DATA, 'pairs.jsonl'), pairs);
console.log(`恆過定點改用 fixed_point：${n} 題`);
