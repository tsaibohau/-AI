#!/usr/bin/env node
// AI 對話評測：讓 AI（目前用 Gemini）透過工具解題，抽出最後答案並用數學比對評分。
//   npm run eval:agent                              用公開的改編題 eval/agent-problems.json
//   npm run eval:agent -- --file private/xxx.json   用本機私有題（不會被提交）
//   npm run eval:agent -- --only a01,a05 --model gemini-flash-latest --delay 4000
// 需要 .env 裡的 GEMINI_API_KEY（.env 不會被提交）。
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgent } from '../src/agent/agent.js';
import { geminiProvider, DEFAULT_GEMINI_MODEL } from '../src/agent/gemini.js';
import { compareAnswer } from '../src/core/answer.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUFFIX = '\n\n請用工具完整解題。最後單獨一行寫「答案：」加上最終答案（多個答案用逗號分開；直線寫方程式；範圍寫區間）。';

/** 從 AI 的回覆抽出最後的「答案：」 */
export function extractAnswer(text) {
  const m = [...String(text).matchAll(/答案\s*[:：]\s*(.+)/g)].at(-1);
  return m ? m[1].replace(/\*\*/g, '').replace(/[。.]\s*$/, '').trim() : null;
}

/** 比對答案；lines 類型要每一條直線都有對到 */
export function judge(gold, ans) {
  if (ans === null) return { ok: false, reason: '沒有寫出「答案：」' };
  if (gold.type === 'lines') {
    const parts = ans.split(/或|,|，|、|;|；|\n/).map((s) => s.trim()).filter(Boolean);
    const all = gold.value.every((g) => parts.some((p) => compareAnswer({ type: 'line', value: g }, p).ok));
    return { ok: all && parts.length === gold.value.length, reason: all ? '條數不符' : '有直線不對' };
  }
  if (gold.type === 'text') return { ok: (gold.accept || [gold.value]).every((g) => ans.replace(/\s+/g, '').includes(g)), reason: '文字不符' };
  try {
    const r = compareAnswer(gold, ans);
    return r.ok ? r : { ok: false, reason: r.reason };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

function args(argv) {
  const a = { file: join(ROOT, 'eval/agent-problems.json'), delay: 4000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') a.file = resolve(argv[++i]);
    else if (argv[i] === '--only') a.only = argv[++i].split(',');
    else if (argv[i] === '--model') a.model = argv[++i];
    else if (argv[i] === '--delay') a.delay = Number(argv[++i]);
  }
  return a;
}

async function main() {
  const a = args(process.argv.slice(2));
  const envFile = join(ROOT, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('找不到 GEMINI_API_KEY。請在專案根目錄建立 .env，寫一行 GEMINI_API_KEY=你的金鑰（.env 不會被提交）。');
    process.exit(2);
  }
  const model = a.model || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const all = JSON.parse(readFileSync(a.file, 'utf8')).problems;
  const problems = a.only ? all.filter((p) => a.only.includes(p.id)) : all;
  const provider = geminiProvider({ apiKey, model });
  const rows = [];
  for (const [i, p] of problems.entries()) {
    process.stdout.write(`(${i + 1}/${problems.length}) ${p.id} … `);
    let tools = 0;
    let finalText = '';
    try {
      const h = await runAgent({
        provider,
        history: [],
        user: { text: p.text + SUFFIX },
        onEvent: (e) => {
          if (e.type === 'tool') tools++;
        },
      });
      finalText = h.filter((m) => m.role === 'assistant').map((m) => m.text).join('\n');
      const ans = extractAnswer(finalText);
      const j = judge(p.answer, ans);
      rows.push({ id: p.id, ok: j.ok, ans, tools, note: j.ok ? '' : j.reason });
      console.log(j.ok ? `✓（${tools} 次工具）` : `✗ ${ans ?? '（沒有答案）'}：${j.reason}`);
    } catch (e) {
      rows.push({ id: p.id, ok: false, ans: null, tools, note: e.message });
      console.log(`失敗：${e.message}`);
    }
    if (i < problems.length - 1) await new Promise((r) => setTimeout(r, a.delay));
  }
  const ok = rows.filter((r) => r.ok).length;
  console.log(`\n模型：${model}`);
  console.log(`答對：${ok} / ${rows.length}（${((ok / rows.length) * 100).toFixed(0)}%）`);
  console.log(`平均工具呼叫次數：${(rows.reduce((s, r) => s + r.tools, 0) / rows.length).toFixed(1)}`);
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) console.log('答錯：' + bad.map((r) => `${r.id}（${r.note}）`).join('、'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
