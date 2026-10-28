import { describe, it, expect } from 'vitest';
import { solve } from '../src/engine/index.js';
import { diagnose } from '../src/core/diagnose.js';
import { validateDiagram } from '../src/core/diagram.js';
import { getDefinitionEntry } from '../src/core/definitions.js';
import { startCheck, answerCheck, currentConcept, checkDone, explainConcept } from '../src/tutor/conceptCheck.js';
import { newTutorState, handleTutorClick } from '../src/ui/tutor.js';

const EX = '坐標平面上有三個村莊 A(−3, −2)、B(3, 10)、C(9, 4)，要蓋一所到三個村莊距離都相等的學校。(1) 求 AB 的中垂線方程式。(2) 求學校的坐標。';

describe('應用問題：到三點等距（外心）', () => {
  const r = solve(EX);
  it('認得題型、答案正確', () => {
    expect(r.ok, r.reason).toBe(true);
    expect(r.type).toBe('app.circumcenter');
    expect(diagnose(r.final, '(2, 3)').ok).toBe(true);
    expect(r.goal).toBe('求點的坐標或直線方程式');
  });
  it('照使用者的順序：提取數據 → 看最後一小題 → 斜率 → 負倒數 → 中點 → 點斜式', () => {
    const steps = r.data.extension.map((s) => s.step);
    expect(steps[0]).toContain('提取關鍵數據');
    expect(steps[1]).toContain('先看最後');
    expect(steps[2]).toContain('斜率 ＝ 2');
    expect(steps[3]).toContain('−1/2');
    expect(steps[4]).toContain('(0, 4)');
    expect(steps[5]).toContain('第 (1) 小題');
  });
  it('每個提問都接受正確答案，也接受等價寫法', () => {
    for (const s of r.data.extension.filter((x) => x.ask)) expect(diagnose(s.ask, s.ask.value).ok, s.ask.q).toBe(true);
    const ab = r.data.extension[5].ask;
    expect(diagnose(ab, 'y = −1/2 x + 4').ok).toBe(true);
    expect(diagnose(ab, '2x + 4y = 16').ok).toBe(true);
    expect(diagnose(ab, '2x + y − 4 = 0').ok).toBe(false);
  });
  it('斜率忘了取負倒數會被診斷出來', () => {
    expect(diagnose(r.data.extension[3].ask, '1/2').category).toBe('符號');
  });
  it('每一步都標了定義樹裡的概念', () => {
    for (const s of r.data.extension) {
      expect(s.defs.length).toBeGreaterThan(0);
      for (const id of s.defs) expect(getDefinitionEntry(id), id).toBeTruthy();
    }
  });
  it('圖解：三點、兩條中垂線、外心、外接圓', () => {
    const v = validateDiagram(r.data.diagram);
    expect(v.ok, v.error).toBe(true);
    const kinds = r.data.diagram.elements.map((e) => e.kind);
    expect(kinds.filter((k) => k === 'line').length).toBe(2);
    expect(kinds).toContain('circle');
    expect(r.data.diagram.elements.find((e) => e.id === 'O')).toMatchObject({ x: 2, y: 3 });
  });
  it('第 (1) 小題指定 BC 時先算 BC', () => {
    const r2 = solve('三個村莊 A(0, 0)、B(4, 0)、C(0, 6)，蓋一所學校到三村距離相等。(1) 求 BC 的中垂線。(2) 求學校坐標。');
    expect(r2.ok, r2.reason).toBe(true);
    expect(r2.data.extension[2].step).toContain('BC');
    expect(diagnose(r2.final, '(2, 3)').ok).toBe(true);
  });
  it('邊是水平線或鉛直線也能做', () => {
    const r3 = solve('三個車站 A(0, 0)、B(4, 0)、C(0, 6)，找一個到三個車站距離都相等的位置');
    expect(r3.ok, r3.reason).toBe(true);
    expect(r3.data.extension.some((s) => s.step.includes('水平線'))).toBe(true);
    expect(diagnose(r3.final, '(2, 3)').ok).toBe(true);
    for (const s of r3.data.extension.filter((x) => x.ask)) expect(diagnose(s.ask, s.ask.value).ok, s.ask.q).toBe(true);
  });
  it('三點共線時說明找不到', () => {
    const r4 = solve('三個村莊 A(0, 0)、B(1, 1)、C(2, 2)，要蓋學校到三村距離相等');
    expect(r4.ok).toBe(false);
    expect(r4.reason).toContain('同一條直線');
  });
});

describe('你知道這個概念嗎？', () => {
  it('知道就往下，不重複問', () => {
    const known = new Set();
    let st = startCheck(['geo.slope', 'geo.perpendicular'], known);
    expect(currentConcept(st)).toBe('geo.slope');
    st = answerCheck(st, true, known);
    expect(currentConcept(st)).toBe('geo.perpendicular');
    st = answerCheck(st, true, known);
    expect(checkDone(st)).toBe(true);
    expect(startCheck(['geo.slope'], known).queue).toEqual([]);
  });
  it('不知道的定義：只給定義', () => {
    const ex = explainConcept('geo.slope');
    expect(ex.paras[0]).toMatch(/^定義：/);
    expect(ex.paras.join('')).not.toContain('為什麼會這樣');
  });
  it('不知道的導出概念：解釋為什麼，再接著問推導用到的概念', () => {
    const known = new Set();
    let st = startCheck(['geo.slope_perpendicular'], known);
    st = answerCheck(st, false, known);
    expect(st.shown[0].paras.join('')).toContain('為什麼會這樣');
    expect(st.queue).toEqual(expect.arrayContaining(['geo.slope', 'geo.perpendicular', 'geo.right_angle']));
  });
});

describe('老師模式流程', () => {
  it('第一步要先回答概念問題，才看得到內容', () => {
    const r = solve(EX);
    const ts = newTutorState(r);
    expect(currentConcept(ts.steps[0].check)).toBe('geo.point');
    const click = (data) => handleTutorClick({ dataset: data }, r, ts, { querySelector: () => null }, () => {});
    click({ act: 'concept-know', i: '0', v: '1' });
    click({ act: 'concept-know', i: '0', v: '0' });
    expect(checkDone(ts.steps[0].check)).toBe(true);
    expect(ts.steps[0].check.shown[0].name).toBe('直角坐標');
    click({ act: 'next-step' });
    expect(ts.steps[1].check.queue).not.toContain('geo.point');
  });
});
