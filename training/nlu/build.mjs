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

/** 補強：很短的回答、很短的無關話、正反對照（第一版模型最弱的地方） */
function promptBoost(nodes, tests) {
  const banned = [...new Set(tests.map((t) => t.reply))];
  return `# 任務：補強訓練資料（很短的回答、正反對照）

延續之前的任務（台灣高中數學家教，判斷學生的回答最接近哪個選項）。第一版模型在下面三種情況最容易錯，請專門補這些：

## 規則

1. **很短的回答**：每個選項產生 8 句 1～4 個字的回答（例如「點啊」「一樣ㄚ」「不同」「上」）。
2. **很短的無關話**：每個問題產生 8 句 1～5 個字、跟題目無關或只是語助詞的回答，option 填 0（例如「哈哈哈」「喔」「好睏」「？？」「...」「隨便」「ok」）。
3. **正反對照**：有意思相反的選項時（例如「一樣遠」和「不一樣」、「只有一個」和「不只一個」、「兩個都要」和「一個就好」），每個選項再產生 8 句**用字很像但意思相反**的句子，兩邊都要寫，盡量用同樣的字只差一兩個字（例如「應該一樣吧」和「應該不一樣吧」、「會相等」和「會不相等」、「就一個」和「不只一個」）。
4. 「不知道」選項不要用「不」開頭的反義句混淆：像「不一樣」「不同」是在回答內容，不是不知道。
5. 不要寫出「禁止使用的句子」，也不要只在它們後面加標點。
6. 只輸出 JSON Lines，一行一筆，不要有其他說明文字，不要用程式碼區塊：
{"node": "問題代號", "option": 選項編號, "reply": "學生的回答"}

## 問題與選項

${nodes
  .map(
    (n) => `### ${n.id}
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
  writeFileSync(join(HERE, 'prompts', `${BATCHES.length + 1}-boost.md`), promptBoost(nodes, tests));
  writeFileSync(join(HERE, 'nodes.json'), JSON.stringify(nodes, null, 1) + '\n');
  writeFileSync(join(HERE, 'test.json'), JSON.stringify(tests, null, 1) + '\n');
  console.log(`問題 ${nodes.length} 個、選項 ${nodes.reduce((s, n) => s + n.options.length, 0)} 個、測試題 ${tests.length} 句；提示詞 ${BATCHES.length + 1} 份`);
}

/** 檢查 Gemini 的輸出並合併 */
function check(file) {
  const nodes = new Map(listNodes().map((n) => [n.id, n]));
  const tests = new Set(testSet([...nodes.values()]).map((t) => norm(t.reply)));
  const trainPath = join(HERE, 'data', 'train.jsonl');
  const old = existsSync(trainPath) ? readFileSync(trainPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const seen = new Set(old.map((r) => `${r.node}|${norm(r.reply)}`));
  // 標成「無關」但其實在說聽不懂的，改標成「不知道」（老師對這兩種的反應不同）
  const CONFUSED = /不知道|不懂|一頭霧水|一臉問號/;
  let relabeled = 0;
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
      if (r.option === 0 && CONFUSED.test(r.reply)) {
        const idk = n.options.indexOf('不知道');
        if (idk >= 0) {
          r.option = idk + 1;
          relabeled++;
        }
      }
      seen.add(`${r.node}|${norm(r.reply)}`);
      added.push({ node: r.node, option: r.option, reply: r.reply.trim() });
    }
  }
  const all = [...old, ...added];
  mkdirSync(dirname(trainPath), { recursive: true });
  writeFileSync(trainPath, all.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`新增 ${added.length} 句，訓練資料共 ${all.length} 句（其中 ${relabeled} 句從「無關」改標成「不知道」）`);
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
