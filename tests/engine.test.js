import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { solve, TYPES } from '../src/engine/index.js';
import { normalizeProblem, analyze } from '../src/engine/parse.js';
import { Q, Surd, quadRoots } from '../src/engine/num.js';
import { createValidator } from '../src/core/schema.js';
import { compareAnswer } from '../src/core/answer.js';
import { evalReal } from '../src/core/math.js';

const concepts = JSON.parse(readFileSync('data/concepts.json', 'utf8'));
const validate = createValidator(concepts);

/** 驗算式「左 = 右」在隨機代值下必須相等 */
function exprHolds(expr) {
  const [l, r, ...rest] = expr.split('=');
  if (rest.length || r === undefined) return false;
  for (let i = 0; i < 5; i++) {
    const scope = { x: Math.random() * 6 - 3, k: Math.random() * 6 - 3 };
    const a = evalReal(l, scope);
    const b = evalReal(r, scope);
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a))) return false;
  }
  return true;
}

const CASES = [
  // [題目, 題型, 標準答案]
  ['求二次函數 f(x) = 2x² − 8x + 3 的最小值。', 'quad.extreme', { type: 'number', value: '-5' }],
  ['求 f(x) = −x² + 4x + 1 的最大值', 'quad.extreme', { type: 'number', value: '5' }],
  ['f(x)=(1/2)x^2 - x 的最小值', 'quad.extreme', { type: 'number', value: '-1/2' }],
  ['求 y = x² − 6x + 1 的頂點', 'quad.vertex', { type: 'point', value: '(3, -8)' }],
  ['求 y = 2x² + 4x − 1 的對稱軸', 'quad.vertex', { type: 'number', value: '-1' }],
  ['在 1 ≤ x ≤ 4 時，求 f(x) = x² − 2x + 3 的最大值', 'quad.range_extreme', { type: 'number', value: '11' }],
  ['在 −1 ≤ x ≤ 2 時，求 f(x) = x² − 2x + 3 的最小值', 'quad.range_extreme', { type: 'number', value: '2' }],
  ['解方程式 x(x+1) = 6', 'quad.roots', { type: 'set', value: '{-3, 2}' }],
  ['解方程式 x² − 2x − 1 = 0', 'quad.roots', { type: 'set', value: '{1-sqrt(2), 1+sqrt(2)}' }],
  ['x² − 4x + 5 = 0 有幾個實根', 'quad.roots', { type: 'number', value: '0' }],
  ['解不等式 x² − x − 6 < 0。', 'qineq.solve', { type: 'interval', value: '(-2, 3)' }],
  ['解 −2x² + 3x + 2 > 0', 'qineq.solve', { type: 'interval', value: '(-1/2, 2)' }],
  ['解 x² − 2x − 1 ≥ 0', 'qineq.solve', { type: 'interval', value: '(-inf, 1-sqrt(2)] U [1+sqrt(2), inf)' }],
  ['解 x² + 2x + 5 > 0', 'qineq.solve', { type: 'interval', value: 'R' }],
  ['解 x² − 4x + 4 ≤ 0', 'qineq.solve', { type: 'interval', value: '[2, 2]' }],
  ['解 x² − 4x + 4 > 0', 'qineq.solve', { type: 'interval', value: '(-inf, 2) U (2, inf)' }],
  ['解 x² + 1 < 0', 'qineq.solve', { type: 'interval', value: '無解' }],
  ['解 x² < 3x + 4', 'qineq.solve', { type: 'interval', value: '(-1, 4)' }],
  ['若對所有實數 x，不等式 x² + 2kx + 3k + 4 > 0 恆成立，求實數 k 的範圍。', 'qineq.always', { type: 'interval', value: '(-1, 4)' }],
  ['若 (k−1)x² + 2(k−1)x + 3 > 0 對所有實數 x 恆成立，求 k 的範圍', 'qineq.always', { type: 'interval', value: '[1, 4)' }],
  ['若 −x² + 2kx − 4 ≤ 0 對所有實數 x 恆成立，求 k 的範圍', 'qineq.always', { type: 'interval', value: '[-2, 2]' }],
];

describe('解題引擎：各題型', () => {
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
});

describe('解題引擎：無法作答時', () => {
  it('找不到算式', () => {
    const r = solve('這題我不會');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('找不到算式');
  });
  it('判斷不出題型就請學生選，選了之後能解', () => {
    const r = solve('x^2 - 4x + 3');
    expect(r).toMatchObject({ ok: false, needType: true });
    const r2 = solve('x^2 - 4x + 3', { type: 'quad.vertex' });
    expect(r2.ok).toBe(true);
    expect(r2.data.answer).toBe('(2, −1)');
  });
  it('沒寫到的題型改用通用解法', () => {
    const r = solve('解 x^3 - 1 > 0');
    expect(r).toMatchObject({ ok: true, type: 'general' });
    expect(r.data.answer).toBe('(1, ∞)');
  });
  it('通用解法也不行時進入引導思考模式', () => {
    const r = solve('三角形 ABC 中，AB = 3，AC = 4，∠A = 90°，求 BC');
    expect(r.ok).toBe(false);
    expect(r.guided.stages).toHaveLength(4);
    expect(r.guided.stages[3].hints.join()).toContain('幾何');
  });
  it('11 種題型都有列出', () => expect(TYPES).toHaveLength(11));
});

describe('題目文字分析', () => {
  it('上標、全形、特殊符號', () => {
    expect(normalizeProblem('x² − 3x ≤ 4，')).toBe('x^2 - 3x <= 4,');
    expect(normalizeProblem('2⁻¹')).toBe('2^(-1)');
  });
  it('抓出範圍限制與參數', () => {
    const an = analyze('在 0 ≤ x < 3 時，f(x) = x² + kx 的最小值');
    expect(an.range).toMatchObject({ var: 'x', loC: true, hiC: false });
    expect(an.param).toBe('k');
  });
});

describe('精確數值', () => {
  it('有理數', () => {
    expect(Q.parse('0.25').pretty()).toBe('1/4');
    expect(new Q(6n, -4n).pretty()).toBe('−3/2');
  });
  it('二次根式化簡', () => {
    const [r1, r2] = quadRoots(new Q(2n), new Q(-6n), new Q(2n));
    expect(r1.pretty()).toBe('(3 − √5)/2');
    expect(r2.value()).toBeCloseTo((3 + Math.sqrt(5)) / 2);
    expect(new Surd(0n, 4n, 8n, 2n).r).toBe(8n); // 建構子不負責化簡根號內，由 quadRoots 處理
    expect(quadRoots(new Q(1n), new Q(0n), new Q(-8n)).map((r) => r.pretty())).toEqual(['−2√2', '2√2']);
  });
});
