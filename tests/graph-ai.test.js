import { describe, it, expect } from 'vitest';
import { solve } from '../src/engine/index.js';
import { validateDiagram, describeDiagram } from '../src/core/diagram.js';
import { explainGraph } from '../src/tutor/graph.js';
import { classify, answerFollowUp } from '../src/tutor/followup.js';
import { cleanText, buildMessages } from '../src/tutor/llm.js';
import { toolGraphSpec } from '../src/engine/tools.js';

describe('AI 輸出清理：不能出現 LaTeX 與 Markdown 符號', () => {
  it.each([
    ['分母 \\( x + 2 \\neq 0 \\)', '分母 x + 2 ≠ 0'],
    ['\\( x \\leq 3 \\) 且 \\( x \\geq -1 \\)', 'x ≤ 3 且 x ≥ -1'],
    ['\\( \\frac{x-1}{x+2} \\)', '(x-1)/(x+2)'],
    ['\\( \\frac{1}{2} \\)', '1/2'],
    ['\\( \\sqrt{2} \\) 與 \\( \\sqrt{x+1} \\)', '√2 與 √(x+1)'],
    ['\\( x^{2} \\) 和 $x^2$', 'x² 和 x²'],
    ['\\(\\log_{2} 8\\)', 'log₂ 8'],
    ['**分子為正**：x > 1', '分子為正：x > 1'],
    ['### 重點\n- 第一點', '重點\n・第一點'],
    ['\\[ x \\in \\mathbb{R} \\]', 'x ∈ R'],
    ['顯然成立', '可以看出成立'],
  ])('%s', (raw, want) => expect(cleanText(raw)).toBe(want));

  it('減號不會被當成清單符號', () => {
    expect(cleanText('分子 x - 1 和分母 x + 2')).toBe('分子 x - 1 和分母 x + 2');
    expect(cleanText('接著： - 分子 x - 1 - 分母 x + 2')).toContain('\n・分子 x - 1');
  });

  it('清理後不殘留反斜線、錢字號、星號', () => {
    const out = cleanText('**注意** \\( \\left( x \\right) \\cdot 2 \\) $a$ \\text{真數} \\quad \\alpha');
    expect(out).not.toMatch(/[\\$*{}]/);
  });

  it('提示詞要求不用 LaTeX 與 Markdown，並附上圖解說明', () => {
    const m = buildMessages({ question: '為什麼圖是彎的', problem: 'p', graph: '這是拋物線' });
    expect(m[0].content).toContain('不要用 LaTeX');
    expect(m[0].content).toContain('Markdown');
    expect(m[1].content).toContain('圖解說明：這是拋物線');
  });
});

describe('問圖形的追問', () => {
  it.each(['為什麼圖是彎的', '這條曲線怎麼畫的', '圖為什麼斷開', '為什麼不是直線'])('%s → graph', (q) => expect(classify(q).intent).toBe('graph'));

  it('用圖上的點解釋形狀', () => {
    const r = solve('解 (x − 1)/(x + 2) ≥ 0');
    const spec = validateDiagram(r.data.diagram).spec;
    const a = answerFollowUp('為什麼圖是彎的', { step: r.data.extension[0], diagram: spec });
    expect(a.title).toBe('用圖看看');
    const text = a.paras.join();
    expect(text).toContain('x = 0 時 y = −1/2');
    expect(text).toContain('分母等於 0');
  });

  it('二次函數說明拋物線、對數求值說明圖上的點', () => {
    const q = explainGraph(validateDiagram(solve('解不等式 x² − x − 6 < 0').data.diagram).spec).join();
    expect(q).toContain('拋物線');
    expect(q).toContain('−2、3');
    const l = explainGraph(validateDiagram(solve('求 log₂ 8 + log₂ 4 的值').data.diagram).spec).join();
    expect(l).toContain('點 (3, 8) 代表 log₂(8) = 3');
  });
});

describe('計算工具：畫出任何算式', () => {
  it.each([
    ['x² − 3x + 2', ['1', '2']],
    ['2^x = 5', ['log₂ 5']],
    ['t^3 - t', ['−1', '0', '1']],
  ])('%s', (expr, roots) => {
    const g = toolGraphSpec(expr);
    const v = validateDiagram(g.spec);
    expect(v.ok, v.error).toBe(true);
    const desc = describeDiagram(v.spec).join();
    for (const r of roots) expect(desc).toContain(r);
  });
  it('沒有變數時也有圖', () => expect(validateDiagram(toolGraphSpec('log 100').spec).spec.type).toBe('function_graph'));
  it('畫不出來時給原因、不丟例外', () => {
    expect(toolGraphSpec('AB − 3').error).toContain('多個變數');
    expect(toolGraphSpec(')(').error).toBeTruthy();
  });
});
