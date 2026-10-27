import { describe, it, expect } from 'vitest';
import { solve } from '../src/engine/index.js';
import { validateDiagram, describeDiagram } from '../src/core/diagram.js';

const PROBLEMS = [
  '求二次函數 f(x) = 2x² − 8x + 3 的最小值',
  '求 y = x² − 6x + 1 的頂點',
  '在 1 ≤ x ≤ 4 時，求 f(x) = −x² + 2x + 5 的最大值與最小值',
  '求 f(x)=x²−4x+3 與 x 軸的交點',
  'x² − 4x + 5 = 0 有幾個實根',
  '解不等式 x² − x − 6 < 0',
  '解 x² − 2x − 1 ≥ 0',
  '解 x² + 1 < 0',
  '若對所有實數 x，x² + 2kx + 3k + 4 > 0 恆成立，求 k 的範圍',
  '若 (k−1)x² + 2(k−1)x + 3 > 0 對所有實數 x 恆成立，求 k 的範圍',
  '解方程式 4^x − 6·2^x + 8 = 0',
  '解 2^(x+1) > 8',
  '解 (1/2)^x ≥ 4',
  '解 9^x − 4·3^x + 3 < 0',
  '解方程式 log₂(x − 1) + log₂(x + 1) = 3',
  '解 log₂(x) + log₂(x − 2) ≤ 3',
  '解 log_(1/2)(x − 1) > −2',
  '解 x³ − 6x² + 11x − 6 = 0',
  '解 (x−1)/(x+2) ≥ 0',
  '解 √(x+2) = x',
  '求 x + 1/x 在 x > 0 的最小值',
  '解 log_4(x) + log_2(x) = 6',
  'log₂3 · log₃8',
];

describe('引擎產生的圖解規格全部合法', () => {
  for (const q of PROBLEMS) {
    it(q, () => {
      const r = solve(q);
      expect(r.ok, r.reason).toBe(true);
      const v = validateDiagram(r.data.diagram);
      expect(v.ok, v.error).toBe(true);
      if (v.spec) {
        expect(describeDiagram(v.spec).length).toBeGreaterThan(0);
        // 階段要介於 1~4，讓圖可以逐步出現
        for (const e of v.spec.elements) expect([1, 2, 3, 4]).toContain(e.stage);
      }
    });
  }
});

describe('不合法的規格會被擋下，不會丟出例外', () => {
  const bad = [
    ['字串', 'garbage'],
    ['陣列', []],
    ['未知種類', { type: 'pie', elements: [] }],
    ['缺 elements', { type: 'function_graph', x: [0, 1], y: [0, 1] }],
    ['範圍顛倒', { type: 'function_graph', x: [5, 1], y: [0, 1], elements: [] }],
    ['範圍太大', { type: 'function_graph', x: [0, 1e9], y: [0, 1], elements: [] }],
    ['未知元素', { type: 'function_graph', x: [0, 1], y: [0, 1], elements: [{ kind: 'image', src: 'x' }] }],
    ['算式含其他變數', { type: 'function_graph', x: [0, 1], y: [0, 1], elements: [{ kind: 'curve', expr: 'k*x' }] }],
    ['算式看不懂', { type: 'function_graph', x: [0, 1], y: [0, 1], elements: [{ kind: 'curve', expr: ')(' }] }],
    ['算式不支援的函數', { type: 'function_graph', x: [0, 1], y: [0, 1], elements: [{ kind: 'curve', expr: 'sin(x)' }] }],
    ['範圍內沒有定義', { type: 'function_graph', x: [-5, -1], y: [0, 1], elements: [{ kind: 'curve', expr: 'sqrt(x)' }] }],
    ['錯的 sign', { type: 'function_graph', x: [0, 1], y: [0, 1], elements: [{ kind: 'shade', expr: 'x', sign: '!=0' }] }],
    ['數線區間顛倒', { type: 'number_line', x: [0, 5], elements: [{ kind: 'interval', from: 3, to: 1 }] }],
    ['幾何點沒有 id', { type: 'geometry', x: [0, 5], y: [0, 5], elements: [{ kind: 'point', x: 1, y: 1 }] }],
    ['幾何用到不存在的點', { type: 'geometry', x: [0, 5], y: [0, 5], elements: [{ kind: 'point', id: 'A', x: 0, y: 0 }, { kind: 'segment', from: 'A', to: 'Z' }] }],
    ['角少一個點', { type: 'geometry', x: [0, 5], y: [0, 5], elements: [{ kind: 'point', id: 'A', x: 0, y: 0 }, { kind: 'angle', points: ['A', 'A'] }] }],
    ['元素太多', { type: 'number_line', x: [0, 5], elements: Array.from({ length: 50 }, () => ({ kind: 'point', x: 1 })) }],
  ];
  it.each(bad)('%s', (_, spec) => {
    const v = validateDiagram(spec);
    expect(v.ok).toBe(false);
    expect(typeof v.error).toBe('string');
  });

  it('沒有圖（null）是合法的', () => expect(validateDiagram(null)).toEqual({ ok: true, spec: null }));
});

describe('合法規格的整理', () => {
  it('數值可以用算式字串、∞ 可以用 inf', () => {
    const v = validateDiagram({ type: 'number_line', x: [-5, 5], elements: [{ kind: 'interval', from: 'sqrt(2)', to: 'inf', closedFrom: true, stage: 4 }] });
    expect(v.ok).toBe(true);
    expect(v.spec.elements[0].from).toBeCloseTo(Math.SQRT2);
    expect(v.spec.elements[0].to).toBe(Infinity);
  });
  it('幾何：點、線段、圓、角', () => {
    const v = validateDiagram({
      type: 'geometry',
      x: [-1, 6],
      y: [-1, 5],
      elements: [
        { kind: 'point', id: 'A', x: 0, y: 0 },
        { kind: 'point', id: 'B', x: 4, y: 0 },
        { kind: 'point', id: 'C', x: 4, y: 3 },
        { kind: 'segment', from: 'A', to: 'B', label: '4' },
        { kind: 'circle', center: 'A', through: 'C' },
        { kind: 'angle', points: ['B', 'A', 'C'], label: 'θ' },
      ],
    });
    expect(v.ok).toBe(true);
    expect(describeDiagram(v.spec)).toContain('角 BAC = θ');
  });
  it('依階段篩選文字說明', () => {
    const r = solve('解不等式 x² − x − 6 < 0');
    const { spec } = validateDiagram(r.data.diagram);
    expect(describeDiagram(spec, (e) => e.stage <= 2)).toHaveLength(1);
    expect(describeDiagram(spec).length).toBeGreaterThan(1);
  });
});
