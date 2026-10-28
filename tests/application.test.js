import { describe, it, expect } from 'vitest';
import { solve } from '../src/engine/index.js';
import { diagnose } from '../src/core/diagnose.js';
import { validateDiagram } from '../src/core/diagram.js';
import { getDefinitionEntry } from '../src/core/definitions.js';
import { SCRIPTS, startDialogue, reply, matchAnswer, optionsOf } from '../src/tutor/dialogue.js';
import { newTutorState, handleTutorClick, stucksOf } from '../src/ui/tutor.js';

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

describe('引導式對話', () => {
  const r = solve(EX);
  const talkOf = (script) => r.data.extension.find((s) => s.talk?.script === script).talk;

  it('劇本格式正確：每個 next 都存在，每個問題都有兜底答案，文字沒有 LaTeX 或 Markdown', () => {
    for (const [id, sc] of Object.entries(SCRIPTS)) {
      expect(sc.nodes[sc.start], id).toBeTruthy();
      expect(getDefinitionEntry(sc.concept), `${id} 的概念`).toBeTruthy();
      for (const [nid, n] of Object.entries(sc.nodes)) {
        if (n.end) continue;
        expect(n.answers.some((a) => a.else), `${id}.${nid} 要有 else`).toBe(true);
        for (const a of n.answers) expect(sc.nodes[a.next], `${id}.${nid} → ${a.next}`).toBeTruthy();
      }
      expect(JSON.stringify(sc)).not.toMatch(/\$|\*\*|\\\\[a-z]/);
    }
  });

  it('每段對話的變數都由引擎帶齊（沒有留下 {變數}）', () => {
    for (const s of r.data.extension.filter((x) => x.talk)) {
      const st = startDialogue(s.talk.script, s.talk.vars);
      const sc = SCRIPTS[s.talk.script];
      for (const n of Object.values(sc.nodes)) {
        const texts = [n.say, ...(n.answers || []).flatMap((a) => [a.say, a.label])].filter(Boolean);
        for (const t of texts) expect(t.replace(/\{(\w+)\}/g, (m, k) => (k in st.vars ? '' : m)), `${s.talk.script}：${t}`).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('斜率：自己算對三題，這一步就算解出', () => {
    const st = startDialogue('slope', talkOf('slope').vars);
    reply(st, '6');
    reply(st, '12');
    reply(st, '2');
    expect(st.done).toBe(true);
    expect(st.lastOk).toBe(true);
    expect(st.stucks).toEqual([]);
  });

  it('斜率：上下顛倒會被診斷出來，並給解釋', () => {
    const st = startDialogue('slope', talkOf('slope').vars);
    reply(st, '6');
    reply(st, '12');
    reply(st, '1/2');
    expect(st.stucks).toContain('Δx、Δy 上下顛倒');
    expect(st.log.at(-2).text).toContain('不是倒過來');
  });

  it('垂直：用轉手機帶出 −1；忘了變號會被抓到', () => {
    const st = startDialogue('perp', talkOf('perp').vars);
    expect(st.log[0].text).toContain('往右 1、往上 2');
    reply(st, '往上');
    reply(st, '左邊');
    reply(st, '1/2');
    expect(st.stucks).toContain('只取倒數、忘了變號');
    reply(st, '-1');
    expect(st.done).toBe(true);
  });

  it('等距：用自己的話回答也聽得懂，「不一樣」不會被當成「一樣」', () => {
    const st = startDialogue('equidistant', talkOf('equidistant').vars);
    reply(st, '我覺得只有正中間那一個');
    expect(st.stucks).toContain('只想到中點，沒想到一整條線');
    reply(st, '應該不一樣吧');
    expect(st.stucks).toContain('以為離開中點就不等距');
    expect(st.log.at(-2).text).toContain('對稱');
  });

  it('聽不懂時請學生點選項', () => {
    const st = startDialogue('point', talkOf('point').vars);
    expect(matchAnswer(st, '嗯嗯嗯')).toBeNull();
    reply(st, '嗯嗯嗯');
    expect(st.pick).toBe(true);
    expect(optionsOf(st)).toContain('一個點');
  });

  it('點斜式：打出含 x 的式子也能比對', () => {
    const st = startDialogue('pointslope', talkOf('pointslope').vars);
    reply(st, 'x - 0');
    reply(st, 'y-4');
    reply(st, 'x + 2y = 8');
    expect(st.done && st.lastOk).toBe(true);
  });
});

describe('老師模式流程', () => {
  it('第一步先對話；聊完才看到整理，卡點記在老師的筆記', () => {
    const r = solve(EX);
    const ts = newTutorState(r);
    expect(ts.steps[0].talk.script).toBe('point');
    const out = { querySelector: (sel) => ({ value: sel.includes('talk-0') ? input : '' }) };
    let input = '';
    const click = (data) => handleTutorClick({ dataset: data }, r, ts, out, () => {});
    input = '還是一大片區域';
    click({ act: 'talk-send', i: '0' });
    click({ act: 'talk-pick', i: '0', o: '0' });
    click({ act: 'talk-pick', i: '0', o: '0' });
    expect(ts.steps[0].talk.done).toBe(true);
    expect(stucksOf(ts)).toContain('把地點當成有大小的區域');
    click({ act: 'next-step' });
    expect(ts.steps[1].talk.script).toBe('equidistant');
  });
});
