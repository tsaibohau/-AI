import { describe, it, expect } from 'vitest';
import { scanText } from '../scripts/scan-secrets.mjs';

// 假金鑰在執行時才組出來，避免測試檔本身被掃描擋下
const fakeGoogle = 'AI' + 'za' + 'Sy' + 'A'.repeat(33);
const fakeGh = 'gh' + 'p_' + 'b'.repeat(36);
const fakeAssign = 'api' + 'Key: "' + 'abcdefghijklmnop1234' + '"';

describe('金鑰掃描', () => {
  it('抓到 Google API 金鑰', () => {
    const hits = scanText(`const k = "${fakeGoogle}";`);
    expect(hits).toHaveLength(1);
    expect(hits[0].rule).toBe('Google API 金鑰');
    expect(hits[0].sample).not.toContain(fakeGoogle); // 輸出要遮罩
  });

  it('抓到 GitHub 權杖與寫死的 apiKey 設定', () => {
    expect(scanText(fakeGh)).toHaveLength(1);
    expect(scanText(fakeAssign)).toHaveLength(1);
  });

  it('一般程式碼與說明文字不誤報', () => {
    const text = [
      "localStorage.getItem('gemini_api_key')",
      '金鑰開頭通常是 AIza，請貼在設定頁',
      'const apiKey = input.value.trim();',
      'GEMINI_API_KEY=',
    ].join('\n');
    expect(scanText(text)).toEqual([]);
  });

  it('標註 secret-scan: allow 的行略過', () => {
    expect(scanText(`"${fakeGoogle}" // secret-scan: allow`)).toEqual([]);
  });
});
