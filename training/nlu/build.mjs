// 「聽懂學生的話」訓練資料工具
//   node training/nlu/build.mjs prompts          產生給 Gemini 的提示詞（prompts/*.md）與選項清單、測試題
//   node training/nlu/build.mjs check <檔案>      檢查 Gemini 產生的 JSON Lines，合併進 data/train.jsonl
// 題目與講法全部自創；測試題（test-cases.mjs）不可出現在訓練資料裡
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve } from '../../src/engine/index.js';
import { startDialogue, optionsOf } from '../../src/tutor/dialogue.js';
import { SPEC } from './test-cases.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = JSON.parse(readFileSync(join(HERE, '../../data/dialogues.json'), 'utf8')).scripts;
const EXAMPLE = '坐標平面上有三個村莊 A(−3, −2)、B(3, 10)、C(9, 4)，要蓋一所到三個村莊距離都相等的學校。(1) 求 AB 的中垂線方程式。(2) 求學校的坐標。';
// 每一批給 Gemini 的劇本
const BATCHES = [['point'], ['equidistant'], ['perp'], ['intersect']];
const PER_OPTION = 20;
const IRRELEVANT = 15;

const norm = (t) => String(t || '').normalize('NFKC').replace(/[\s，。,.!！?？~～、…]+/g, '').toLowerCase();

/** 所有要聽懂學生的話的問題（不含要學生算數字的題目） */
export function listNodes() {
  const r = solve(EXAMPLE);
  const out = [];
  for (const [sid, sc] of Object.entries(SCRIPTS)) {
    const step = r.data.extension.find((s) => s.talk?.script === sid);
    for (const [nid, n] of Object.entries(sc.nodes)) {
      if (n.end || n.answers.some((a) => a.type)) continue;
      const st = startDialogue(sid, step.talk.vars);
      st.node = nid;
      const question = n.say.replace(/\{(\w+)\}/g, (m, k) => st.vars[k] ?? m);
      out.push({ id: `${sid}.${nid}`, script: sid, question, options: optionsOf(st) });
    }
  }
  return out;
}

function testSet(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return SPEC.flatMap(([s, n, replies]) => replies.map(([reply, expect]) => ({ node: `${s}.${n}`, reply, option: expect === null ? 0 : expect + 1, options: byId.get(`${s}.${n}`).options })));
}

function promptFor(batch, nodes, tests) {
  const ns = nodes.filter((n) => batch.includes(n.script));
  const banned = [...new Set(tests.filter((t) => ns.some((n) => n.id === t.node)).map((t) => t.reply))];
  return `# 任務：產生「學生可能的回答」訓練資料

我在做一個台灣高中數學的引導式家教網站。老師會問學生一個問題，學生用自己的話回答，系統要判斷學生的意思最接近哪一個選項。
請幫我產生**台灣高中生**可能打出來的各種回答，用來訓練一個小模型。

## 規則

1. 每個選項產生 ${PER_OPTION} 句「意思是這個選項」的回答；另外每個問題產生 ${IRRELEVANT} 句**和題目無關或看不懂**的回答（option 填 0）。
2. 講法要多樣：口語、很短（一兩個字）、很長、不確定的語氣（「應該吧」「我猜」）、反問、台灣用語、常見錯字或注音文（例如「ㄅ知道」「一樣ㄉ」）、有贅字（「呃…」「就是」）。
3. **特別重要：多寫「用字很像但意思相反」的句子**，而且正反兩邊都要寫。例如「應該一樣吧」（＝一樣遠）和「應該會不同吧」（＝不一樣）；「就一個」和「不止一個喔」；「兩條都要成立」和「一條就夠」。
4. 「不知道」這個選項要包含各種不會、忘了、沒概念、不確定、看不懂題目的講法。
5. 不要寫出下面「禁止使用的句子」（那些是測試題），也不要只是在它們後面加標點。
6. 只輸出 JSON Lines，一行一筆，不要有其他說明文字，不要用程式碼區塊：
{"node": "問題代號", "option": 選項編號, "reply": "學生的回答"}

## 問題與選項

${ns
  .map(
    (n) => `### 問題代號：${n.id}
老師問：${n.question}
${n.options.map((o, i) => `- 選項 ${i + 1}：${o}`).join('\n')}
- 選項 0：和題目無關、看不懂`,
  )
  .join('\n\n')}

## 禁止使用的句子

${banned.join('、')}
`;
}

function makePrompts() {
  const nodes = listNodes();
  const tests = testSet(nodes);
  mkdirSync(join(HERE, 'prompts'), { recursive: true });
  BATCHES.forEach((b, i) => writeFileSync(join(HERE, 'prompts', `${i + 1}-${b.join('-')}.md`), promptFor(b, nodes, tests)));
  writeFileSync(join(HERE, 'nodes.json'), JSON.stringify(nodes, null, 1) + '\n');
  writeFileSync(join(HERE, 'test.json'), JSON.stringify(tests, null, 1) + '\n');
  console.log(`問題 ${nodes.length} 個、選項 ${nodes.reduce((s, n) => s + n.options.length, 0)} 個、測試題 ${tests.length} 句；提示詞 ${BATCHES.length} 份`);
}

/** 檢查 Gemini 的輸出並合併 */
function check(file) {
  const nodes = new Map(listNodes().map((n) => [n.id, n]));
  const tests = new Set(testSet([...nodes.values()]).map((t) => norm(t.reply)));
  const trainPath = join(HERE, 'data', 'train.jsonl');
  const old = existsSync(trainPath) ? readFileSync(trainPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const seen = new Set(old.map((r) => `${r.node}|${norm(r.reply)}`));
  const problems = { 看不懂: 0, 問題代號不存在: 0, 選項編號不對: 0, 和測試題重複: 0, 重複: 0, 太長: 0 };
  const added = [];
  // Gemini 偶爾會包程式碼區塊或加說明，只取像 JSON 的行
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    let r;
    try {
      r = JSON.parse(t);
    } catch {
      problems.看不懂++;
      continue;
    }
    const n = nodes.get(r.node);
    if (!n) problems.問題代號不存在++;
    else if (!Number.isInteger(r.option) || r.option < 0 || r.option > n.options.length) problems.選項編號不對++;
    else if (typeof r.reply !== 'string' || !norm(r.reply)) problems.看不懂++;
    else if (r.reply.length > 60) problems.太長++;
    else if (tests.has(norm(r.reply))) problems.和測試題重複++;
    else if (seen.has(`${r.node}|${norm(r.reply)}`)) problems.重複++;
    else {
      seen.add(`${r.node}|${norm(r.reply)}`);
      added.push({ node: r.node, option: r.option, reply: r.reply.trim() });
    }
  }
  const all = [...old, ...added];
  mkdirSync(dirname(trainPath), { recursive: true });
  writeFileSync(trainPath, all.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`新增 ${added.length} 句，訓練資料共 ${all.length} 句`);
  console.log('略過：', Object.entries(problems).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join('、') || '無');
  // 每個選項的數量，太少的要補
  for (const n of nodes.values()) {
    const counts = [0, ...n.options.map((o, i) => i + 1)].map((k) => all.filter((r) => r.node === n.id && r.option === k).length);
    if (counts.some((c) => c > 0)) console.log(`${n.id}：無關 ${counts[0]}、${n.options.map((o, i) => `${o} ${counts[i + 1]}`).join('、')}`);
  }
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'prompts') makePrompts();
else if (cmd === 'check' && arg) check(arg);
else console.log('用法：node training/nlu/build.mjs prompts | check <檔案>');
