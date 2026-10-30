import { describe, it, expect } from 'vitest';
import { runAgent, MAX_ROUNDS } from '../src/agent/agent.js';
import { runTool, toolDeclarations, TOOLS } from '../src/agent/tools.js';
import { geminiProvider, toContents, fromResponse } from '../src/agent/gemini.js';
import { parseToolCalls, toChat, toolGuide } from '../src/agent/local.js';
import { renderRich } from '../src/ui/chat.js';
import { validateDiagram } from '../src/core/diagram.js';
import { compareAnswer } from '../src/core/answer.js';

// 以下皆為改編題（數字與原題不同），用來確認工具能算出正確答案
describe('工具：直線與斜率（改編題）', () => {
  const t = (name, args) => {
    const r = runTool(name, args);
    expect(r.error, JSON.stringify(r)).toBeUndefined();
    return r;
  };
  it('含參數的斜率與平行、垂直條件', () => {
    expect(t('slope', { p1: '(1,2)', p2: '(2,5)' }).slope).toBe('3');
    expect(t('slope', { p1: '(0,1)', p2: '(3,a)' }).slope).toBe('(a − 1)/3');
    expect(compareAnswer({ type: 'interval', value: '(-inf, 10)' }, t('solve', { problem: '(a-1)/3 < 3' }).answer).ok).toBe(true);
    expect(t('solve', { problem: '(a-1)/3 = 3' }).answer).toBe('{10}');
    expect(t('solve', { problem: '3 * (a-1)/3 = -1' }).answer).toBe('{0}');
  });
  it('斜率與三角形面積求直線', () => {
    expect(t('solve', { problem: 'b^2/4 = 16' }).answer).toBe('{−8, 8}');
  });
  it('平移：平移後的直線反推原直線', () => {
    expect(t('translate_line', { line: 'x - 2y = 0', right: '-2', up: '3' }).equation).toBe('x − 2y + 8 = 0');
  });
  it('到兩點等距離且在直線上的點', () => {
    const pb = t('perpendicular_bisector', { p1: '(0,2)', p2: '(4,6)' });
    expect(pb.equation).toBe('x + y − 6 = 0');
    expect(t('intersect', { line1: pb.equation, line2: 'x - 2y + 1 = 0' }).point).toBe('(11/3, 7/3)');
  });
  it('外心到三頂點等距離', () => {
    const c = t('triangle_centers', { a: '(8,6)', b: '(0,2)', c: '(4,-2)' }).circumcenter;
    const d = ['(8,6)', '(0,2)', '(4,-2)'].map((p) => t('measure', { kind: 'distance', points: [c, p] }).distance);
    expect(new Set(d).size).toBe(1);
  });
  it('三直線不能圍成三角形：平行或共點', () => {
    expect(t('intersect', { line1: 'x - y - 1 = 0', line2: 'x + 2y - 4 = 0' }).point).toBe('(2, 1)');
    expect(t('solve', { problem: '2a + 1 - 3 = 0' }).answer).toBe('{1}');
    expect(t('line', { mode: 'equation', equation: 'ax + y - 3 = 0' }).slope).toBe('−a');
  });
  it('恆過定點：聯立求解', () => {
    expect(t('solve_linear_system', { equations: ['x + 2 = 0', 'y + 4 = 0'] }).solution).toEqual({ x: '−2', y: '−4' });
  });
  it('含絕對值的面積條件', () => {
    const r = t('solve', { problem: '(1/2)*abs((2m-4)^2/m) = 8' });
    expect(compareAnswer({ type: 'set', value: '{4-2*sqrt(3), 4+2*sqrt(3)}' }, r.answer).ok).toBe(true);
  });
  it('平分矩形面積的直線過中心', () => {
    expect(t('line', { mode: 'two_points', p1: '(3,2)', p2: '(5,5)' }).equation).toBe('3x − 2y − 5 = 0');
  });
  it('點到直線距離、多邊形面積、中點', () => {
    expect(t('measure', { kind: 'point_line_distance', points: ['(1,1)'], line: '3x + 4y - 2 = 0' }).distance).toBe('1');
    expect(t('measure', { kind: 'area', points: ['(0,0)', '(4,0)', '(4,3)'] }).area).toBe('6');
    expect(t('measure', { kind: 'midpoint', points: ['(1,5)', '(7,-1)'] }).midpoint).toBe('(4, 2)');
  });
  it('計算：角度與三角函數', () => {
    expect(t('calculate', { expression: 'tan(45°)' }).exact).toBe('1');
    expect(t('calculate', { expression: 'tan(72°)' }).approx).toBeGreaterThan(t('calculate', { expression: 'tan(36°)' }).approx);
  });
  it('畫圖產生合法的圖解規格', () => {
    const r = runTool('draw', { points: ['A(8,6)', 'B(0,2)', 'C(4,-2)'], polygons: ['ABC'], lines: ['x + y - 6 = 0'], functions: ['x^2/4'] });
    expect(r.error).toBeUndefined();
    expect(validateDiagram(r.__diagram).ok).toBe(true);
  });
  it('錯誤會回給 AI，不會丟例外', () => {
    expect(runTool('calculate', { expression: 'k + 1' }).error).toContain('未知數');
    expect(runTool('intersect', { line1: 'x + ay = 1', line2: 'x = 2' }).error).toContain('參數');
    expect(runTool('nope', {}).error).toContain('沒有這個工具');
    expect(runTool('draw', { points: ['A(1,a)'] }).error).toContain('參數');
  });
  it('工具宣告都有名稱、說明與參數格式', () => {
    for (const d of toolDeclarations()) {
      expect(d.name).toMatch(/^[a-z_]+$/);
      expect(d.description.length).toBeGreaterThan(5);
      expect(d.parameters.type).toBe('object');
    }
    expect(TOOLS.length).toBeGreaterThanOrEqual(12);
  });
});

/** 照劇本回答的假模型 */
function scripted(replies) {
  const seen = [];
  return {
    seen,
    async complete(req) {
      seen.push(JSON.parse(JSON.stringify(req.messages)));
      return replies.shift() || { text: '（沒有劇本了）', toolCalls: [] };
    },
  };
}

describe('對話流程', () => {
  it('呼叫工具後把結果交回模型，最後回答', async () => {
    const p = scripted([
      { text: '我先算斜率。', toolCalls: [{ id: '1', name: 'slope', args: { p1: '(2,1)', p2: '(3,5)' } }] },
      { text: '斜率是 4。', toolCalls: [] },
    ]);
    const events = [];
    const history = await runAgent({ provider: p, history: [], user: { text: '求斜率' }, onEvent: (e) => events.push(e) });
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(history[2].results[0].result).toEqual({ slope: '4' });
    expect(p.seen[1].at(-1).role).toBe('tool');
    expect(events.map((e) => e.type)).toEqual(['assistant', 'tool', 'assistant', 'done']);
  });

  it('畫圖結果只給畫面，不回傳給模型', async () => {
    const p = scripted([{ text: '', toolCalls: [{ id: '1', name: 'draw', args: { points: ['A(1,1)'] } }] }, { text: '好了' }]);
    const events = [];
    const h = await runAgent({ provider: p, history: [], user: { text: '畫' }, onEvent: (e) => events.push(e) });
    expect(events.find((e) => e.type === 'tool').diagram.type).toBe('geometry');
    expect(JSON.stringify(h[2])).not.toContain('__diagram');
  });

  it('超過回合上限會停下來', async () => {
    const loop = { async complete() { return { text: '', toolCalls: [{ id: 'x', name: 'calculate', args: { expression: '1+1' } }] }; } };
    const events = [];
    await runAgent({ provider: loop, history: [], user: { text: 'loop' }, onEvent: (e) => events.push(e), maxRounds: 3 });
    expect(events.at(-1)).toMatchObject({ type: 'done', truncated: true });
    expect(MAX_ROUNDS).toBeGreaterThan(3);
  });
});

describe('Gemini 介接', () => {
  it('工具呼叫來回：保留模型的 parts（含 thoughtSignature）、金鑰不放網址', async () => {
    const calls = [];
    const replies = [
      { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'slope', args: { p1: '(2,1)', p2: '(3,5)' } }, thoughtSignature: 'sig-123' }] } }] },
      { candidates: [{ content: { role: 'model', parts: [{ text: '斜率是 **4**。' }] } }] },
    ];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(replies.shift()), { status: 200 });
    };
    const provider = geminiProvider({ apiKey: 'test-key', model: 'm', fetchImpl });
    const h = await runAgent({ provider, history: [], user: { text: '求 AB 斜率', images: [{ mimeType: 'image/jpeg', base64: 'AAAA' }] } });
    expect(h.at(-1).text).toBe('斜率是 **4**。');
    expect(calls[0].url).not.toContain('test-key');
    expect(calls[0].init.headers['x-goog-api-key']).toBe('test-key');
    expect(calls[0].body.tools[0].functionDeclarations.length).toBe(TOOLS.length);
    expect(calls[0].body.contents[0].parts[0].inlineData).toEqual({ mimeType: 'image/jpeg', data: 'AAAA' });
    const second = calls[1].body.contents;
    expect(second[1].parts[0].thoughtSignature).toBe('sig-123');
    expect(second[2].parts[0].functionResponse).toEqual({ name: 'slope', response: { result: { slope: '4' } } });
  });

  it('額度用完給中文錯誤', async () => {
    const provider = geminiProvider({ apiKey: 'k', fetchImpl: async () => new Response('{}', { status: 429 }) });
    await expect(provider.complete({ system: '', messages: [{ role: 'user', text: 'hi' }], tools: [] })).rejects.toThrow('額度');
  });
  it('沒有金鑰', async () => {
    await expect(geminiProvider({ apiKey: '' }).complete({ system: '', messages: [], tools: [] })).rejects.toThrow('金鑰');
  });
  it('思考內容不顯示給學生', () => {
    expect(fromResponse({ candidates: [{ content: { parts: [{ text: '內部思考', thought: true }, { text: '答案' }] } }] }).text).toBe('答案');
    expect(toContents([{ role: 'tool', results: [{ name: 'x', result: { a: 1 } }] }])[0].role).toBe('user');
  });
});

describe('本機模型的文字工具協定', () => {
  it('解析 <tool> 與 ```json``` 兩種寫法', () => {
    const a = parseToolCalls('先算。<tool>{"name": "slope", "args": {"p1": "(2,1)", "p2": "(3,5)"}}</tool>');
    expect(a.toolCalls[0]).toMatchObject({ name: 'slope', args: { p1: '(2,1)' } });
    expect(a.text).toBe('先算。');
    const b = parseToolCalls('```json\n{"name": "calculate", "args": {"expression": "1+1"}}\n```');
    expect(b.toolCalls[0].name).toBe('calculate');
    expect(parseToolCalls('<tool>{壞掉的 json</tool>').toolCalls).toEqual([]);
  });
  it('工具結果用 <result> 回給模型', () => {
    const chat = toChat('sys', toolDeclarations(), [{ role: 'user', text: 'q' }, { role: 'assistant', raw: '<tool>…</tool>' }, { role: 'tool', results: [{ name: 'slope', result: { slope: '4' } }] }]);
    expect(chat[0].content).toContain('<tool>');
    expect(chat[3].content).toBe('<result name="slope">{"slope":"4"}</result>');
    expect(toolGuide(toolDeclarations())).toContain('perpendicular_bisector');
  });
});

describe('對話排版', () => {
  it('粗體、條列、LaTeX 轉換，且會跳脫 HTML', () => {
    const html = renderRich('答案是 **(6, 2)**\n・第一步 \\( x \\neq 2 \\)\n<img src=x onerror=alert(1)>');
    expect(html).toContain('<b>(6, 2)</b>');
    expect(html).toContain('<li>第一步 x ≠ 2</li>');
    expect(html).not.toContain('<img');
  });
});

describe('本機模型寫壞的工具指令不顯示給學生', () => {
  it('少了大括號的 tool> 指令被藏起來', async () => {
    const { parseToolCalls } = await import('../src/agent/local.js');
    const r = parseToolCalls('所以 y = x − 4。\n```text\ntool>"name": "line", "args": "mode": "point_slope"\n```');
    expect(r.text).toBe('所以 y = x − 4。');
    expect(r.toolCalls).toEqual([]);
    expect(r.garbled).toBe(true);
  });
});

describe('訓練用的系統提示詞和網站一致', () => {
  it('training/chat/data/system.txt 等於 SYSTEM_PROMPT＋工具說明', async () => {
    const { readFileSync } = await import('node:fs');
    const { SYSTEM_PROMPT } = await import('../src/agent/prompt.js');
    const { toolGuide } = await import('../src/agent/local.js');
    const { toolDeclarations } = await import('../src/agent/tools.js');
    const saved = readFileSync(new URL('../training/chat/data/system.txt', import.meta.url), 'utf8');
    // 不一致時：重新產生 system.txt 再訓練（模型要學的是網站實際用的提示詞）
    expect(saved).toBe(`${SYSTEM_PROMPT}\n\n${toolGuide(toolDeclarations())}`);
  });
});

describe('calculate 可以檢查沒有未知數的等式', () => {
  it('1+1=2 對、1+1=3 錯', async () => {
    const { runTool } = await import('../src/agent/tools.js');
    expect(runTool('calculate', { expression: '1+1=2' })).toEqual({ left: '2', right: '2', correct: true });
    expect(runTool('calculate', { expression: '1+1=3' }).correct).toBe(false);
    expect(runTool('calculate', { expression: '1/2+1/3=5/6' }).correct).toBe(true);
  });
});
