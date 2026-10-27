import { describe, it, expect } from 'vitest';
import { compareAnswer, parseIntervals } from '../src/core/answer.js';

const ok = (gold, ans) => compareAnswer(gold, ans).ok;

describe('答案比對：數值', () => {
  const g = { type: 'number', value: '-5' };
  it('等價寫法都算對', () => {
    expect(ok(g, '-5')).toBe(true);
    expect(ok(g, '−5')).toBe(true);
    expect(ok(g, '最小值為 -5')).toBe(true);
    expect(ok(g, '-10/2')).toBe(true);
  });
  it('錯的答案或無法解析', () => {
    expect(ok(g, '5')).toBe(false);
    expect(compareAnswer(g, '不知道').reason).toBe('模型答案無法解析');
  });
  it('根號、對數', () => {
    expect(ok({ type: 'number', value: 'sqrt(2)/2' }, '1/√2')).toBe(true);
    expect(ok({ type: 'number', value: 'log(3, 2)' }, 'log(3)/log(2)')).toBe(true);
  });
});

describe('答案比對：集合', () => {
  const g = { type: 'set', value: '{1, 2}' };
  it('順序與寫法不影響', () => {
    expect(ok(g, '{2, 1}')).toBe(true);
    expect(ok(g, 'x = 1 或 x = 2')).toBe(true);
    expect(ok(g, '1、2')).toBe(true);
  });
  it('多或少一個解都算錯', () => {
    expect(ok(g, '{1}')).toBe(false);
    expect(ok(g, '{1, 2, 3}')).toBe(false);
  });
  it('補充說明的全形括號被忽略', () => {
    expect(ok({ type: 'set', value: '{3}' }, 'x = 3（x = -3 不合）')).toBe(true);
  });
  it('無解', () => {
    expect(ok({ type: 'set', value: '無解' }, '空集合')).toBe(true);
  });
});

describe('答案比對：區間', () => {
  it('區間記號與不等式寫法等價', () => {
    const g = { type: 'interval', value: '(-2, 3)' };
    expect(ok(g, '-2 < x < 3')).toBe(true);
    expect(ok(g, '3 > x > -2')).toBe(true);
    expect(ok(g, '[-2, 3)')).toBe(false); // 端點開閉不同
  });
  it('聯集', () => {
    const g = { type: 'interval', value: '(-inf, -1) U (3, inf)' };
    expect(ok(g, 'x < -1 或 x > 3')).toBe(true);
    expect(ok(g, '(-∞, -1) ∪ (3, ∞)')).toBe(true);
    expect(ok(g, 'x ≠ 1')).toBe(false);
  });
  it('相接的區間會合併', () => {
    expect(parseIntervals('[0, 1] U (1, 2]')).toEqual([{ lo: 0, hi: 2, loClosed: true, hiClosed: true }]);
  });
  it('全體實數與無解', () => {
    expect(ok({ type: 'interval', value: 'R' }, '所有實數')).toBe(true);
    expect(ok({ type: 'interval', value: '無解' }, '∅')).toBe(true);
  });
});

describe('答案比對：座標點', () => {
  it('順序有意義', () => {
    const g = { type: 'point', value: '(2, -5)' };
    expect(ok(g, '（2，-5）')).toBe(true);
    expect(ok(g, '(-5, 2)')).toBe(false);
  });
});

describe('安全性', () => {
  it('停用危險的 mathjs 函式', () => {
    expect(compareAnswer({ type: 'number', value: '1' }, 'import({}, {})').ok).toBe(false);
    expect(compareAnswer({ type: 'number', value: '1' }, 'evaluate("1")').ok).toBe(false);
  });
});
