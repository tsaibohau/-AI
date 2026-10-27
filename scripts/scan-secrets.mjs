#!/usr/bin/env node
// 掃描疑似 API 金鑰字串。
//   node scripts/scan-secrets.mjs --staged   只掃 git 暫存區（pre-commit 用）
//   node scripts/scan-secrets.mjs --all      掃所有被 git 追蹤的檔案（CI 用）
//   node scripts/scan-secrets.mjs 檔案...     掃指定檔案
// 若某行確定是安全的示範字串，可在同一行加上註解「secret-scan: allow」。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RULES = [
  { name: 'Google API 金鑰', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'OpenAI 類金鑰', re: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/ },
  { name: 'GitHub 權杖', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/ },
  { name: 'AWS 存取金鑰', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'Slack 權杖', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: '私鑰區塊', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  {
    name: '疑似寫死的金鑰設定',
    re: /\b(?:api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token|password)\b["']?\s*[:=]\s*["'][A-Za-z0-9_\-+/=.]{16,}["']/i,
  },
];

const ALLOW = /secret-scan:\s*allow/;
const SKIP_FILE = /(^|\/)(package-lock\.json)$|\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip)$/i;

export function scanText(text, file = '<text>') {
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (ALLOW.test(line)) return;
    for (const rule of RULES) {
      const m = line.match(rule.re);
      if (m) hits.push({ file, line: i + 1, rule: rule.name, sample: mask(m[0]) });
    }
  });
  return hits;
}

function mask(s) {
  return s.length <= 8 ? '****' : `${s.slice(0, 4)}…${s.slice(-2)}（共 ${s.length} 字元）`;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function listFiles(mode, argv) {
  if (mode === 'staged') {
    return git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).split('\0').filter(Boolean);
  }
  if (mode === 'all') return git(['ls-files', '-z']).split('\0').filter(Boolean);
  return argv;
}

function readContent(mode, file) {
  // 暫存模式讀暫存區內容（實際要提交的版本），而非工作目錄
  return mode === 'staged' ? git(['show', `:${file}`]) : readFileSync(file, 'utf8');
}

function main() {
  const argv = process.argv.slice(2);
  const mode = argv.includes('--staged') ? 'staged' : argv.includes('--all') ? 'all' : 'files';
  const files = listFiles(mode, argv.filter((a) => !a.startsWith('--')));
  const hits = [];
  for (const f of files) {
    if (SKIP_FILE.test(f)) continue;
    let content;
    try {
      content = readContent(mode, f);
    } catch {
      continue; // 已刪除或無法讀取
    }
    if (content.includes('\0')) continue; // 二進位檔
    hits.push(...scanText(content, f));
  }
  if (hits.length) {
    console.error('偵測到疑似金鑰：');
    for (const h of hits) console.error(`  ${h.file}:${h.line}  [${h.rule}]  ${h.sample}`);
    process.exit(1);
  }
  console.log(`金鑰掃描通過（${files.length} 個檔案）`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
