#!/usr/bin/env node
// 評分腳本。用法見 eval/README.md
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareAnswer } from '../src/core/answer.js';
import { createValidator } from '../src/core/schema.js';
import { checkRaw, solveProblem } from '../src/core/solve.js';
import { DEFAULT_MODEL } from '../src/core/gemini.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function loadData() {
  return {
    concepts: readJson(join(ROOT, 'data/concepts.json')),
    problems: readJson(join(ROOT, 'eval/problems.json')).problems,
  };
}

/** 檢查評測題本身：概念 id 存在、標準答案可解析、id 不重複 */
export function checkProblems(problems, concepts) {
  const ids = new Set(concepts.concepts.map((c) => c.id));
  const errors = [];
  const seen = new Set();
  for (const p of problems) {
    if (seen.has(p.id)) errors.push(`${p.id}：id 重複`);
    seen.add(p.id);
    if (!['自創', '改編'].includes(p.source)) errors.push(`${p.id}：source 必須是「自創」或「改編」`);
    for (const c of p.concepts) if (!ids.has(c)) errors.push(`${p.id}：概念 ${c} 不在 concepts.json`);
    try {
      compareAnswer(p.answer, p.answer.value);
    } catch (e) {
      errors.push(`${p.id}：${e.message}`);
    }
    if (typeof p.needs_diagram !== 'boolean') errors.push(`${p.id}：needs_diagram 必須是 true 或 false`);
  }
  return errors;
}

/** 評分一題。record: { id, attempts: [{ raw }], error? } */
export function scoreRecord(problem, record, validate) {
  const attempts = record?.attempts || [];
  const checks = attempts.map((a) => checkRaw(a.raw, validate));
  const firstOk = checks[0]?.ok === true;
  const final = checks.find((c) => c.ok);
  const r = {
    id: problem.id,
    jsonFirst: firstOk,
    jsonFinal: Boolean(final),
    answerOk: false,
    answer: null,
    conceptRecall: 0,
    conceptPrecision: 0,
    diagramMatch: false,
    note: record?.error || (final ? '' : checks.at(-1)?.errors?.join('；') || '沒有輸出'),
  };
  if (!final) return r;
  const d = final.data;
  r.answer = d.answer;
  const cmp = compareAnswer(problem.answer, d.answer);
  r.answerOk = cmp.ok;
  if (!cmp.ok) r.note = cmp.reason;
  const pred = new Set(d.concepts.map((c) => c.id));
  const hit = problem.concepts.filter((c) => pred.has(c)).length;
  r.conceptRecall = problem.concepts.length ? hit / problem.concepts.length : 1;
  r.conceptPrecision = pred.size ? hit / pred.size : 0;
  r.diagramMatch = (d.diagram !== null) === problem.needs_diagram;
  return r;
}

export function scoreRun(problems, concepts, records) {
  const validate = createValidator(concepts);
  const byId = new Map(records.map((x) => [x.id, x]));
  const targets = problems.filter((p) => byId.has(p.id));
  const rows = targets.map((p) => scoreRecord(p, byId.get(p.id), validate));
  const n = rows.length || 1;
  const avg = (f) => rows.reduce((s, r) => s + Number(f(r)), 0) / n;
  return {
    rows,
    summary: {
      count: rows.length,
      jsonValidRate: avg((r) => r.jsonFinal),
      jsonFirstTryRate: avg((r) => r.jsonFirst),
      answerAccuracy: avg((r) => r.answerOk),
      conceptHitRate: avg((r) => r.conceptRecall),
      conceptPrecision: avg((r) => r.conceptPrecision),
      diagramMatchRate: avg((r) => r.diagramMatch),
    },
  };
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const mark = (b) => (b ? '✓' : '✗');

export function formatReport({ rows, summary }) {
  const lines = ['題號   JSON  答案  概念命中  圖  備註'];
  for (const r of rows) {
    lines.push(
      `${r.id.padEnd(6)} ${mark(r.jsonFinal)}${r.jsonFirst ? ' ' : '*'}   ${mark(r.answerOk)}    ${pct(r.conceptRecall).padStart(6)}   ${mark(r.diagramMatch)}  ${r.note}`,
    );
  }
  lines.push('（* 表示首次輸出不合法、重試後才通過或仍失敗）', '');
  lines.push(`題數：${summary.count}`);
  lines.push(`JSON 合法率：${pct(summary.jsonValidRate)}（首次 ${pct(summary.jsonFirstTryRate)}）`);
  lines.push(`答案正確率：${pct(summary.answerAccuracy)}`);
  lines.push(`概念標籤命中率：${pct(summary.conceptHitRate)}（精確率 ${pct(summary.conceptPrecision)}）`);
  lines.push(`圖解需求一致率：${pct(summary.diagramMatchRate)}`);
  return lines.join('\n');
}

function parseArgs(argv) {
  const a = { delay: 4000 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--from') a.from = argv[++i];
    else if (k === '--only') a.only = argv[++i].split(',');
    else if (k === '--model') a.model = argv[++i];
    else if (k === '--delay') a.delay = Number(argv[++i]);
    else if (k === '--check') a.checkOnly = true;
  }
  return a;
}

async function runLive({ problems, concepts, model, delay }) {
  const envFile = join(ROOT, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('找不到 GEMINI_API_KEY。請複製 .env.example 成 .env 並填入金鑰，或用 --from 重新評分已存的輸出。');
    process.exit(2);
  }
  model = model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const records = [];
  for (const [i, p] of problems.entries()) {
    process.stdout.write(`(${i + 1}/${problems.length}) ${p.id} … `);
    try {
      const r = await solveProblem({ apiKey, model, concepts, text: p.text });
      records.push({ id: p.id, attempts: r.attempts });
      console.log(r.ok ? '完成' : '格式不合法');
    } catch (e) {
      records.push({ id: p.id, attempts: [], error: e.message });
      console.log(`失敗：${e.message}`);
    }
    if (i < problems.length - 1) await new Promise((res) => setTimeout(res, delay));
  }
  const dir = join(ROOT, 'eval/runs');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ model, createdAt: new Date().toISOString(), records }, null, 2));
  console.log(`\n模型輸出已存到 ${file}\n`);
  return records;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { concepts, problems: all } = loadData();
  const bad = checkProblems(all, concepts);
  if (bad.length) {
    console.error('評測題有問題：\n' + bad.map((e) => `  ${e}`).join('\n'));
    process.exit(1);
  }
  if (args.checkOnly) return console.log(`評測題檢查通過（${all.length} 題）`);
  const problems = args.only ? all.filter((p) => args.only.includes(p.id)) : all;
  const records = args.from
    ? readJson(args.from).records
    : await runLive({ problems, concepts, model: args.model, delay: args.delay });
  console.log(formatReport(scoreRun(problems, concepts, records)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
