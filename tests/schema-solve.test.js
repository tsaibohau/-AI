import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createValidator, parseModelJson } from '../src/core/schema.js';
import { solveProblem } from '../src/core/solve.js';
import { GeminiError } from '../src/core/gemini.js';

const concepts = JSON.parse(readFileSync('data/concepts.json', 'utf8'));
const validate = createValidator(concepts);

const good = {
  problem: '求最小值',
  knowns: { explicit: ['f(x)=x^2'], implicit: [] },
  concepts: [{ id: 'quad.max_min', why: '開口向上' }],
  extension: [{ step: '看頂點', reason: '頂點是最低點', expr: '0^2 = 0' }],
  diagram: null,
  answer: '0',
  check: '代回',
  uncertain: [],
};

describe('schema 驗證', () => {
  it('合法輸出通過', () => expect(validate(good)).toEqual({ ok: true, errors: [] }));
  it('概念不在清單中', () => {
    const r = validate({ ...good, concepts: [{ id: 'calculus.derivative', why: '' }] });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain('不在概念清單');
  });
  it('缺欄位、多欄位', () => {
    const { uncertain, ...rest } = good;
    expect(validate(rest).errors.join()).toContain('uncertain');
    expect(validate({ ...good, extra: 1 }).ok).toBe(false);
  });
  it('禁止「顯然」', () => {
    const r = validate({ ...good, extension: [{ step: '顯然成立', reason: '', expr: '' }] });
    expect(r.errors.join()).toContain('顯然');
  });
  it('解析圍欄中的 JSON', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseModelJson('沒有 JSON').ok).toBe(false);
  });
});

/** 假的 fetch：依序回傳給定的模型文字 */
function fakeFetch(texts, calls = []) {
  return async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const text = texts[calls.length - 1];
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
  };
}

describe('解題流程', () => {
  it('第一次就合法：只呼叫一次，金鑰放在標頭不放網址', async () => {
    const calls = [];
    const r = await solveProblem({ apiKey: 'test-key', concepts, text: '題目', fetchImpl: fakeFetch([JSON.stringify(good)], calls) });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).not.toContain('test-key');
    expect(calls[0].init.headers['x-goog-api-key']).toBe('test-key');
  });

  it('格式錯會自動重試一次，並把錯誤告訴模型', async () => {
    const calls = [];
    const r = await solveProblem({ apiKey: 'k', concepts, text: '題目', fetchImpl: fakeFetch(['{壞掉', JSON.stringify(good)], calls) });
    expect(r.ok).toBe(true);
    expect(r.attempts).toHaveLength(2);
    const last = calls[1].body.contents.at(-1).parts[0].text;
    expect(last).toContain('不符合規定');
  });

  it('重試後仍錯就放棄，不無限重試', async () => {
    const calls = [];
    const r = await solveProblem({ apiKey: 'k', concepts, text: '題目', fetchImpl: fakeFetch(['x', 'y', 'z'], calls) });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it('沒有金鑰、額度用完會給中文錯誤', async () => {
    await expect(solveProblem({ apiKey: '', concepts, text: '題' })).rejects.toThrow('尚未設定金鑰');
    const f429 = async () => new Response('{}', { status: 429 });
    await expect(solveProblem({ apiKey: 'k', concepts, text: '題', fetchImpl: f429 })).rejects.toThrow(GeminiError);
  });

  it('附圖片時送出 inlineData', async () => {
    const calls = [];
    await solveProblem({ apiKey: 'k', concepts, image: { mimeType: 'image/png', base64: 'AAAA' }, fetchImpl: fakeFetch([JSON.stringify(good)], calls) });
    expect(calls[0].body.contents[0].parts[0].inlineData).toEqual({ mimeType: 'image/png', data: 'AAAA' });
  });
});
