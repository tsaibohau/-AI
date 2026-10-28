import { describe, it, expect } from 'vitest';
import data from '../data/definitions.json' with { type: 'json' };
import { getDefinition, traceBack, findByCues, getChain, LEVELS } from '../src/core/definitions.js';

const IDS = new Set(data.definitions.map((d) => d.id));

describe('定義樹資料', () => {
  it('id 不重複', () => {
    expect(IDS.size).toBe(data.definitions.length);
  });

  for (const d of data.definitions) {
    it(d.id, () => {
      expect(d.name).toBeTruthy();
      expect(['definition', 'derived']).toContain(d.kind);
      expect(LEVELS).toContain(d.intro);
      expect(d.hs.length).toBeGreaterThan(10);
      for (const p of d.prereq) expect(IDS.has(p), `prereq ${p}`).toBe(true);
      if (d.kind === 'derived') {
        expect(d.derivation, '導出的概念要寫推導').toBeTruthy();
        expect(d.uses.length).toBeGreaterThan(0);
        for (const u of d.uses) expect(IDS.has(u), `uses ${u}`).toBe(true);
      }
      // 簡化層只能放在高中以前、而且不早於第一次學到的年級
      for (const [lv, s] of Object.entries(d.simplified || {})) {
        expect(LEVELS.indexOf(lv)).toBeGreaterThanOrEqual(LEVELS.indexOf(d.intro));
        expect(lv).not.toBe('高中');
        expect(s.say && s.missing && s.fix, `${lv} 層要有 say、missing、fix`).toBeTruthy();
      }
      // 國中（含）以前就學的概念，要有簡化標記
      if (d.intro !== '高中') expect(Object.keys(d.simplified || {}).length).toBeGreaterThan(0);
      // 不可以有 LaTeX 或 Markdown 符號
      const all = JSON.stringify(d);
      expect(all).not.toMatch(/\$|\*\*|\\\\[a-z]/);
    });
  }

  it('沒有循環的先備關係', () => {
    const state = new Map();
    const byId = new Map(data.definitions.map((d) => [d.id, d]));
    const dfs = (id) => {
      if (state.get(id) === 1) throw new Error(`循環：${id}`);
      if (state.get(id) === 2) return;
      state.set(id, 1);
      byId.get(id).prereq.forEach(dfs);
      state.set(id, 2);
    };
    expect(() => data.definitions.forEach((d) => dfs(d.id))).not.toThrow();
  });

  it('2-1 鏈：每個概念的先備都排在它前面', () => {
    const chain = getChain('hs1.2-1');
    for (const id of chain.order) expect(IDS.has(id)).toBe(true);
    chain.order.forEach((id, i) => {
      for (const p of data.definitions.find((d) => d.id === id).prereq) expect(chain.order.indexOf(p), `${p} 要在 ${id} 前面`).toBeLessThan(i);
    });
    expect(chain.order).toContain(chain.goal);
  });
});

describe('依年級取定義', () => {
  it('高中取精確版與推導', () => {
    const d = getDefinition('geo.slope_perpendicular');
    expect(d.text).toContain('−1');
    expect(d.derivation).toContain('y = −x');
  });
  it('國中取簡化層，附上少講了什麼與高中修正', () => {
    const d = getDefinition('geo.circumcenter', '國中');
    expect(d.level).toBe('國中');
    expect(d.missing).toBeTruthy();
    expect(d.fix).toContain('高中');
  });
  it('還沒學到的概念標記 notYet', () => {
    expect(getDefinition('geo.slope', '國中').notYet).toBe(true);
  });
  it('國中沒有專屬說法時退回國小層', () => {
    expect(getDefinition('geo.midpoint', '國中').level).toBe('國小');
  });
});

describe('往回追與字眼對照', () => {
  it('外心往回追到點、直角', () => {
    const t = traceBack('geo.circumcenter');
    expect(t.at(-1)).toBe('geo.circumcenter');
    expect(t).toContain('geo.point');
    expect(t).toContain('geo.right_angle');
    expect(t.indexOf('geo.perp_bisector')).toBeLessThan(t.indexOf('geo.circumcenter'));
  });
  it('應用題字眼：村莊是點、到三個村莊距離相等是外心', () => {
    const ids = findByCues('平面上有三個村莊，要蓋一所學校，使學校到三個村莊距離都相等').map((h) => h.id);
    expect(ids).toContain('geo.point');
    expect(ids).toContain('geo.circumcenter');
  });
});
