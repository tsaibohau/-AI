import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadData, checkProblems, scoreRun } from '../eval/score.mjs';

const { concepts, problems } = loadData();

describe('評測集', () => {
  it('題目資料正確（概念存在、答案可解析、來源為自創或改編）', () => {
    expect(checkProblems(problems, concepts)).toEqual([]);
  });

  it('概念清單的先備概念都存在', () => {
    const ids = new Set(concepts.concepts.map((c) => c.id));
    const units = new Set(concepts.units.map((u) => u.id));
    for (const c of concepts.concepts) {
      expect(units.has(c.unit)).toBe(true);
      for (const p of c.prereq) expect(ids.has(p)).toBe(true);
    }
  });

  it('用示範輸出算出正確的指標', () => {
    const run = JSON.parse(readFileSync('eval/fixtures/sample-run.json', 'utf8'));
    const { summary, rows } = scoreRun(problems, concepts, run.records);
    expect(summary.count).toBe(5);
    expect(summary.jsonValidRate).toBeCloseTo(0.8);
    expect(summary.jsonFirstTryRate).toBeCloseTo(0.6);
    expect(summary.answerAccuracy).toBeCloseTo(0.6);
    expect(summary.conceptHitRate).toBeCloseTo((1 + 1 + 2 / 3 + 0 + 2 / 3) / 5);
    expect(rows.find((r) => r.id === 'q004').jsonFinal).toBe(false);
  });
});
