import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { solve } from '../src/engine/index.js';
import { createValidator } from '../src/core/schema.js';
import { compareAnswer } from '../src/core/answer.js';
import { evalReal } from '../src/core/math.js';
import { identify } from '../src/engine/general/identify.js';
import { findRoots, signSolve, extrema } from '../src/engine/general/numeric.js';

const concepts = JSON.parse(readFileSync('data/concepts.json', 'utf8'));
const validate = createValidator(concepts);

function exprHolds(expr) {
  const [l, r, ...rest] = expr.split(/(?<![<>!])=/);
  if (rest.length || r === undefined) return false;
  for (let i = 0; i < 5; i++) {
    const scope = { x: Math.random() * 6 - 3, k: Math.random() * 6 - 3, t: Math.random() * 5 + 0.1 };
    const a = evalReal(l, scope);
    const b = evalReal(r, scope);
    if (Number.isNaN(a) && Number.isNaN(b)) continue; // 隨機代值落在定義域外
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a))) return false;
  }
  return true;
}

const CASES = [
  // 指數模板
  ['解方程式 4^x − 6·2^x + 8 = 0', 'exp.equation', { type: 'set', value: '{1, 2}' }],
  ['解 2^(x+1) = 8', 'exp.equation', { type: 'set', value: '{2}' }],
  ['解 2^x = 3', 'exp.equation', { type: 'set', value: '{log(3, 2)}' }],
  ['解 9^x − 2·3^x − 3 = 0', 'exp.equation', { type: 'set', value: '{1}' }],
  ['解 2^(x+1) > 8', 'exp.inequality', { type: 'interval', value: '(2, inf)' }],
  ['解 (1/2)^x ≥ 4', 'exp.inequality', { type: 'interval', value: '(-inf, -2]' }],
  ['解 9^x − 4·3^x + 3 < 0', 'exp.inequality', { type: 'interval', value: '(0, 1)' }],
  // 對數模板
  ['解方程式 log₂(x − 1) + log₂(x + 1) = 3', 'log.equation', { type: 'set', value: '{3}' }],
  ['解 log(x) + log(x − 3) = 1', 'log.equation', { type: 'set', value: '{5}' }],
  ['解 2log₃(x) = log₃(x + 6)', 'log.equation', { type: 'set', value: '{3}' }],
  ['解 log₂(x) + log₂(x − 2) ≤ 3', 'log.inequality', { type: 'interval', value: '(2, 4]' }],
  ['解 log_(1/2)(x − 1) > −2', 'log.inequality', { type: 'interval', value: '(1, 5)' }],
  ['求 log₂ 8 + log₂ 4 的值', 'log.evaluate', { type: 'number', value: '5' }],
  ['log 2 + log 5', 'log.evaluate', { type: 'number', value: '1' }],
  ['log₂3 · log₃8', 'log.evaluate', { type: 'number', value: '3' }],
  ['log₄ 8', 'log.evaluate', { type: 'number', value: '3/2' }],
  // 通用解法
  ['解 x³ − 6x² + 11x − 6 = 0', 'general', { type: 'set', value: '{1, 2, 3}' }],
  ['解 √(x+2) = x', 'general', { type: 'set', value: '{2}' }],
  ['解 (x−1)/(x+2) ≥ 0', 'general', { type: 'interval', value: '(-inf, -2) U [1, inf)' }],
  ['求 x + 1/x 在 x > 0 的最小值', 'general', { type: 'number', value: '2' }],
  ['解 log_4(x) + log_2(x) = 6', 'general', { type: 'set', value: '{16}' }],
  ['解 x^4 − 5x^2 + 4 < 0', 'general', { type: 'interval', value: '(-2, -1) U (1, 2)' }],
];

describe('B2：指數、對數模板與通用解法', () => {
  for (const [text, type, gold] of CASES) {
    it(text, () => {
      const r = solve(text);
      expect(r.ok, r.reason).toBe(true);
      expect(r.type).toBe(type);
      expect(validate(r.data).errors).toEqual([]);
      expect(compareAnswer(gold, r.data.answer), r.data.answer).toMatchObject({ ok: true });
      for (const s of r.data.extension) if (s.expr) expect(exprHolds(s.expr), s.expr).toBe(true);
    });
  }

  it('化不成精確值時給近似值並提醒', () => {
    const r = solve('解 2^x = 3^(x−1)');
    expect(r.ok).toBe(true);
    expect(r.data.answer).toContain('≈ 2.7095');
    expect(r.data.uncertain.join()).toContain('近似值');
  });

  it('對數方程式會排除不合的根', () => {
    const r = solve('解方程式 log₂(x − 1) + log₂(x + 1) = 3');
    expect(r.data.extension.map((s) => s.step).join()).toContain('不合');
  });

  it('用不到的範圍條件會提醒', () => {
    const r = solve('已知 x > 0，解 x² − 3x < 0');
    expect(r.data.uncertain.join()).toContain('x > 0');
  });
});

describe('數值還原成精確值', () => {
  it.each([
    [7 / 3, '7/3'],
    [1 + Math.sqrt(2), '1 + √2'],
    [(3 - Math.sqrt(5)) / 2, '(3 − √5)/2'],
    [Math.log(3) / Math.log(2), 'log₂ 3'],
    [Math.cbrt(2), '∛2'],
    [Math.PI, '≈ 3.141592654'],
  ])('%f → %s', (v, s) => expect(identify(v).pretty()).toBe(s));
});

describe('數值核心', () => {
  it('找根含重根與定義域端點', () => {
    expect(findRoots((x) => (x - 2) ** 2).roots).toHaveLength(1);
    expect(findRoots((x) => (x >= 0 ? Math.sqrt(x) : NaN)).roots).toEqual([0]);
  });
  it('分式的斷點不算根', () => {
    const r = findRoots((x) => (x === 1 ? NaN : 1 / (x - 1)));
    expect(r.roots).toEqual([]);
  });
  it('log x ≥ 0 的解是 x ≥ 1，端點 0 不在定義域', () => {
    const s = signSolve((x) => (x > 0 ? Math.log10(x) : NaN), '>=');
    expect(s.pieces).toHaveLength(1);
    expect(s.pieces[0]).toMatchObject({ lo: 1, loC: true, hi: Infinity });
  });
  it('開區間取不到的端點沒有最值', () => {
    const e = extrema((x) => x * x, { lo: -1, hi: 2, loC: true, hiC: false });
    expect(e.min.value).toBeCloseTo(0);
    expect(e.max.attained).toBe(false);
  });
});
