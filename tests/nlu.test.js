import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as nlu from '../src/tutor/nlu.js';

const MODELS = fileURLToPath(new URL('../public/models/', import.meta.url));

describe('聽懂學生的話：自己訓練的小模型', () => {
  it('「無關」選項的文字和訓練時一致', () => {
    const src = readFileSync(new URL('../src/tutor/nlu.js', import.meta.url), 'utf8');
    const train = readFileSync(new URL('../training/nlu/train.py', import.meta.url), 'utf8');
    const none = src.match(/const NONE = '([^']+)'/)[1];
    expect(train).toContain(`NONE='${none}'`);
  });

  it('關鍵字聽不懂的說法也能判斷', async () => {
    await nlu.load(MODELS);
    const ask = async (options, reply) => (await nlu.classify(options, reply)).index;
    expect(await ask(['一個點', '還是一塊地', '不知道'], '我真的不曉得耶')).toBe(2);
    expect(await ask(['一樣遠', '不一樣', '不知道'], '退後就變不等長了')).toBe(1);
    expect(await ask(['同時滿足兩個方程式', '滿足其中一個就好', '不知道'], '兩條式子都要成立')).toBe(0);
    expect(await ask(['一個點', '還是一塊地', '不知道'], '哈哈哈')).toBe(-1);
  }, 60000);

  it('整份測試題至少答對 55 句（目前 58/64）', async () => {
    await nlu.load(MODELS);
    const test = JSON.parse(readFileSync(new URL('../training/nlu/test.json', import.meta.url), 'utf8'));
    let ok = 0;
    for (const t of test) ok += (await nlu.classify(t.options, t.reply)).index + 1 === t.option;
    expect(ok).toBeGreaterThanOrEqual(55);
  }, 60000);
});
