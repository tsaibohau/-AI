import { describe, it, expect } from 'vitest';
import { solve } from '../src/engine/index.js';
import { diagnose } from '../src/core/diagnose.js';
import { compareExpr } from '../src/core/answer.js';
import { classify, answerFollowUp, findTerms } from '../src/tutor/followup.js';
import { buildMessages, unknownNumbers } from '../src/tutor/llm.js';
import lessons from '../data/lessons.json' with { type: 'json' };
import concepts from '../data/concepts.json' with { type: 'json' };

const PROBLEMS = [
  '求二次函數 f(x) = 2x² − 8x + 3 的最小值',
  '求 y = x² − 6x + 1 的頂點',
  '求 y = 2x² + 4x − 1 的對稱軸',
  '在 1 ≤ x ≤ 4 時，求 f(x) = x² − 2x + 3 的最大值',
  '解方程式 x² − 2x − 1 = 0',
  'x² − 4x + 5 = 0 有幾個實根',
  '解不等式 x² − x − 6 < 0',
  '解 −2x² + 3x + 2 > 0',
  '解 x² − 2x − 1 ≥ 0',
  '若對所有實數 x，不等式 x² + 2kx + 3k + 4 > 0 恆成立，求實數 k 的範圍',
  '若 (k−1)x² + 2(k−1)x + 3 > 0 對所有實數 x 恆成立，求 k 的範圍',
  '解方程式 4^x − 6·2^x + 8 = 0',
  '解 2^x = 3',
  '解 9^x − 4·3^x + 3 < 0',
  '解方程式 log₂(x − 1) + log₂(x + 1) = 3',
  '解 log₂(x) + log₂(x − 2) ≤ 3',
  '解 x³ − 6x² + 11x − 6 = 0',
  '解 (x−1)/(x+2) ≥ 0',
  '解 √(x+2) = x',
];

describe('老師模式：每個提問都能接受正確答案', () => {
  for (const text of PROBLEMS) {
    it(text, () => {
      const r = solve(text);
      expect(r.ok, r.reason).toBe(true);
      const asks = r.data.extension.filter((s) => s.ask);
      expect(asks.length, '至少要有一個提問').toBeGreaterThan(0);
      for (const s of asks) expect(diagnose(s.ask, s.ask.value), `${s.ask.q} → ${s.ask.value}`).toMatchObject({ ok: true });
      if (r.final) expect(diagnose(r.final, r.data.answer).ok).toBe(true);
      expect(r.goal).toBeTruthy();
    });
  }
});

describe('診斷錯誤', () => {
  it('數值：正負號、倒數、近似值', () => {
    const a = { type: 'number', value: '-5' };
    expect(diagnose(a, '5')).toMatchObject({ ok: false, category: '符號' });
    expect(diagnose({ type: 'number', value: '2' }, '1/2').message).toContain('倒數');
    expect(diagnose({ type: 'number', value: 'sqrt(2)' }, '1.414').message).toContain('精確值');
  });
  it('集合：根的正負號、漏解、沒檢查定義域', () => {
    const a = { type: 'set', value: '{-2, 3}' };
    expect(diagnose(a, '{2, -3}').category).toBe('符號');
    expect(diagnose(a, '3').category).toBe('延伸');
    expect(diagnose({ type: 'set', value: '{3}', domain: '(1, ∞)' }, '{-3, 3}').category).toBe('漏列條件');
  });
  it('區間：方向反了、端點開閉、沒取交集', () => {
    const a = { type: 'interval', value: '(-2, 3)' };
    expect(diagnose(a, 'x < -2 或 x > 3').message).toContain('取錯了範圍');
    expect(diagnose(a, '[-2, 3]').message).toContain('端點');
    expect(diagnose({ type: 'interval', value: '(2, 4]', domain: '(2, ∞)' }, '[-2, 4]').category).toBe('漏列條件');
  });
  it('座標順序', () => {
    expect(diagnose({ type: 'point', value: '(2, -5)' }, '(-5, 2)').message).toContain('順序');
  });
  it('算式：等價寫法、差負號、差倍數', () => {
    const a = { type: 'expr', value: '4*k^2 - 12*k - 16', var: 'k' };
    expect(diagnose(a, '(2k)^2 − 4(3k + 4)').ok).toBe(true);
    expect(diagnose(a, '-4k^2 + 12k + 16').category).toBe('符號');
    expect(diagnose(a, 'k^2 - 3k - 4').message).toContain('倍數');
    expect(diagnose({ type: 'expr_prop', value: 't^2 - 6*t + 8', var: 't' }, '2t² − 12t + 16 = 0').ok).toBe(true);
  });
  it('空白與看不懂的寫法', () => {
    expect(diagnose({ type: 'number', value: '1' }, '').message).toContain('先寫下');
    expect(diagnose({ type: 'set', value: '{1}' }, '我不知道').message).toContain('看不懂');
  });
  it('compareExpr 處理 t(t−1) 這種寫法', () => {
    expect(compareExpr('t^2 - t', 't(t-1)', 't').ok).toBe(true);
  });
});

describe('「我不懂」追問', () => {
  const r = solve('求二次函數 f(x) = 2x² − 8x + 3 的最小值');
  const step = r.data.extension[0];
  it.each([
    ['為什麼要配方？', 'why'],
    ['−5 怎麼來的', 'how'],
    ['為什麼根是正的 3？', 'how'],
    ['頂點是什麼意思', 'term'],
    ['判別式', 'term'],
    ['可以舉個例子嗎', 'example'],
    ['我配方忘了', 'prereq'],
    ['這裡要注意什麼', 'pitfall'],
    ['我覺得怪怪的', null],
  ])('%s → %s', (q, intent) => expect(classify(q).intent).toBe(intent));

  it('回答內容來自步驟與講義', () => {
    expect(answerFollowUp('−5 怎麼來的', { step }).paras.join()).toContain('k = −5');
    expect(answerFollowUp('example', { step }).paras.join()).toContain('(x + 3)²');
    expect(answerFollowUp('我配方忘了', { step }).paras.join()).toContain('配方');
  });
  it('聽不懂時反問學生', () => {
    const a = answerFollowUp('嗯嗯', { step });
    expect(a.understood).toBe(false);
    expect(a.follow.length).toBeGreaterThan(3);
  });
  it('名詞別名', () => {
    expect(findTerms('b^2-4ac 是什麼').map((t) => t.term)).toContain('判別式');
  });
  it('每個概念都有講義', () => {
    for (const c of concepts.concepts) {
      expect(lessons.lessons[c.id], c.id).toBeTruthy();
      expect(lessons.lessons[c.id].summary).toBeTruthy();
    }
  });
});

describe('本機 AI 的安全措施', () => {
  it('還沒看答案時不把答案放進提示', () => {
    const m = buildMessages({ question: '為什麼？', problem: '解 x² = 4', step: { step: '開根號', reason: '平方根' }, answerShown: null });
    expect(m[1].content).toContain('學生還沒看到最後答案');
    expect(m.at(-1)).toEqual({ role: 'user', content: '為什麼？' });
  });
  it('AI 回覆中多出的數字會被抓出來', () => {
    expect(unknownNumbers('所以答案是 7 和 3', '題目：x² − 5x + 6 = 0，兩根為 2 或 3')).toEqual(['7']);
    expect(unknownNumbers('這裡的 −2 和 3 是根', '兩根為 x = −2 或 x = 3')).toEqual([]);
  });
});
