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
  [/！[^！]*！/, '驚嘆號太多'],
];
// AI 味的空話：出現兩個以上就退回（使用者回饋：看似親切卻沒重點）
const EMPTY = /一起搞定|免驚|有我在|太棒了|你可以的|隨時都在|我都在|儘管丟|丟過來|丟出來|端上來|亮出來|大魔王|過關斬將|破關|紙老虎|王道|綽綽有餘/g;

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
      if ((m.content.match(EMPTY) || []).length >= 2) return 'AI 味空話';
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
  const pairsAdded = [];
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
    // 好壞對照：壞版本存進 pairs.jsonl，訓練時用來修正方向（DPO）
    if (typeof o.rejected === 'string' && o.rejected.trim()) {
      pairsAdded.push({ category: o.category || '', prompt: o.messages.slice(0, -1), chosen: o.messages.at(-1).content.trim(), rejected: o.rejected.trim(), why: 'Gemini 寫的 AI 味壞版本' });
    }
  }
  const all = [...old, ...added];
  writeFileSync(out, all.map((o) => JSON.stringify(o)).join('\n') + '\n');
  if (pairsAdded.length) {
    const pp = join(HERE, 'data', 'pairs.jsonl');
    const before = existsSync(pp) ? readFileSync(pp, 'utf8') : '';
    writeFileSync(pp, before + pairsAdded.map((o) => JSON.stringify(o)).join('\n') + '\n');
  }
  console.log(`新增 ${added.length} 段，共 ${all.length} 段；好壞對照新增 ${pairsAdded.length} 組`);
  console.log('略過：', Object.entries(skipped).map(([k, v]) => `${k} ${v}`).join('、') || '無');
  const cats = {};
  for (const o of all) cats[o.category] = (cats[o.category] || 0) + 1;
  console.log(Object.entries(cats).map(([k, v]) => `${k} ${v}`).join('、'));
}

/**
 * 第 2 批：把 Gemini 寫的「拿到工具結果後的回應」和題目、工具呼叫、結果組成完整對話，寫進 data/tools.jsonl
 * 對話格式和網站的本機 AI 一樣（src/agent/local.js 的 toChat）：
 *   學生 → 老師（說明＋<tool>…</tool>）→ <result>…</result>（放在 user）→ 老師回應
 * system 欄位寫 "default"，訓練時換成 SYSTEM_PROMPT＋工具說明
 */
function tools(file) {
  const items = new Map(JSON.parse(readFileSync(join(HERE, 'data', 'tools-items.json'), 'utf8')).map((i) => [i.id, i]));
  const out = join(HERE, 'data', 'tools.jsonl');
  const old = existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const done = new Set(old.map((o) => o.id));
  const skipped = {};
  const added = [];
  const pairs = [];
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
    const it = items.get(o.id);
    let why = !it ? '題目代號不存在' : done.has(o.id) ? '重複' : typeof o.reply !== 'string' ? '格式不對' : null;
    const resultText = it ? `<result name="${it.call.name}">${JSON.stringify(it.result)}</result>` : '';
    const messages = it
      ? [
          { role: 'user', content: it.question },
          { role: 'assistant', content: `${it.lead ? `${it.lead}\n` : ''}<tool>${JSON.stringify(it.call)}</tool>` },
          { role: 'user', content: resultText },
          { role: 'assistant', content: String(o.reply || '').trim() },
        ]
      : [];
    // 只檢查最後的回應：數字必須出現在題目或工具結果裡
    if (!why) why = checkConversation({ messages: [{ role: 'user', content: `${it.question} ${resultText}` }, messages[3]] }, 140);
    if (why) {
      skipped[why] = (skipped[why] || 0) + 1;
      continue;
    }
    done.add(o.id);
    added.push({ id: o.id, kind: it.kind, system: 'default', messages });
    if (typeof o.rejected === 'string' && o.rejected.trim()) pairs.push({ category: `工具：${it.kind}`, system: 'default', prompt: messages.slice(0, 3), chosen: messages[3].content, rejected: o.rejected.trim(), why: 'Gemini 寫的 AI 味壞版本' });
  }
  writeFileSync(out, [...old, ...added].map((o) => JSON.stringify(o)).join('\n') + '\n');
  if (pairs.length) {
    const pp = join(HERE, 'data', 'pairs.jsonl');
    writeFileSync(pp, (existsSync(pp) ? readFileSync(pp, 'utf8') : '') + pairs.map((o) => JSON.stringify(o)).join('\n') + '\n');
  }
  console.log(`新增 ${added.length} 段工具對話，共 ${old.length + added.length} / ${items.size}；好壞對照新增 ${pairs.length} 組`);
  console.log('略過：', Object.entries(skipped).map(([k, v]) => `${k} ${v}`).join('、') || '無');
  const missing = [...items.keys()].filter((id) => !done.has(id));
  if (missing.length && missing.length < 40) console.log('還沒有回應的題目：', missing.join('、'));
}

const [cmd, arg, name] = process.argv.slice(2);
if (cmd === 'check' && arg) check(arg, name);
else if (cmd === 'tools' && arg) tools(arg);
else if (cmd) console.log('用法：node training/chat/build.mjs check <檔案> [輸出檔名] | tools <檔案>');
