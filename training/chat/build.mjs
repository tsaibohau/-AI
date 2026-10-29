// 第二階段訓練資料工具
//   node training/chat/build.mjs check <檔案> [輸出檔名]
// 檢查 Gemini 產生的對話（JSON Lines），合格的合併進 data/<輸出檔名>（預設 chat.jsonl）
// 規則：老師不可出現學生沒給的數字、不可有 LaTeX／Markdown、不可太長、不可用到考題
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAM = JSON.parse(readFileSync(join(HERE, 'exam.json'), 'utf8')).cases.map((c) => c.user);
const norm = (t) => String(t || '').normalize('NFKC').replace(/[\s，。,.!！?？~～、…]+/g, '').toLowerCase();
const nums = (t) => String(t).normalize('NFKC').match(/\d+/g) || [];
const BAD = [
  [/\\[a-z]+|\$/i, 'LaTeX'],
  [/^#|\*\*|```|\|.*\|/m, 'Markdown'],
  [/顯然|如你所知|作為一個\s*AI|身為\s*AI/, '禁用語'],
  [/<\/?tool|"name"\s*:/, '工具格式'],
];

export function checkConversation(o, maxLen = 120) {
  if (!o || !Array.isArray(o.messages) || !o.messages.length) return '格式不對';
  let seen = '';
  for (const [i, m] of o.messages.entries()) {
    if (m.role !== (i % 2 ? 'assistant' : 'user') || typeof m.content !== 'string' || !m.content.trim()) return '角色順序不對';
    if (m.role === 'user') {
      if (EXAM.some((e) => norm(e) === norm(m.content))) return '用到考題';
      seen += m.content;
    } else {
      if (m.content.length > maxLen) return '太長';
      for (const [re, why] of BAD) if (re.test(m.content)) return why;
      const extra = nums(m.content).filter((n) => !nums(seen).includes(n));
      if (extra.length) return '出現學生沒給的數字';
      seen += m.content;
    }
  }
  if (o.messages.at(-1).role !== 'assistant') return '最後要是老師';
  return null;
}

function check(file, outName = 'chat.jsonl') {
  const out = join(HERE, 'data', outName);
  const old = existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const key = (o) => o.messages.map((m) => norm(m.content)).join('|');
  const seen = new Set(old.map(key));
  const skipped = {};
  const added = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    let o;
    try {
      o = JSON.parse(t);
    } catch {
      skipped.看不懂 = (skipped.看不懂 || 0) + 1;
      continue;
    }
    if (o.done) continue;
    const why = checkConversation(o) || (seen.has(key(o)) ? '重複' : null);
    if (why) {
      skipped[why] = (skipped[why] || 0) + 1;
      continue;
    }
    seen.add(key(o));
    added.push({ category: o.category || '', messages: o.messages.map(({ role, content }) => ({ role, content: content.trim() })) });
  }
  const all = [...old, ...added];
  writeFileSync(out, all.map((o) => JSON.stringify(o)).join('\n') + '\n');
  console.log(`新增 ${added.length} 段，共 ${all.length} 段`);
  console.log('略過：', Object.entries(skipped).map(([k, v]) => `${k} ${v}`).join('、') || '無');
  const cats = {};
  for (const o of all) cats[o.category] = (cats[o.category] || 0) + 1;
  console.log(Object.entries(cats).map(([k, v]) => `${k} ${v}`).join('、'));
}

const [cmd, arg, name] = process.argv.slice(2);
if (cmd === 'check' && arg) check(arg, name);
else if (cmd) console.log('用法：node training/chat/build.mjs check <檔案> [輸出檔名]');
