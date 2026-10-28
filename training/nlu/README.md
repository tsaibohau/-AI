# 訓練「聽懂學生的話」的小模型

計畫見 `docs/AI訓練計劃書.md` 第一階段。全部資料自創，不含任何學生的真實對話。

## 基準（2026-10，64 句自創測試題）

| 做法 | 答對 |
|---|---|
| 關鍵字比對（目前網站） | 56 |
| 現成模型 BAAI/bge-small-zh-v1.5 算相似度（門檻 0.5） | 50 |
| 關鍵字優先、聽不懂才用模型 | 60 |

現成模型分不出正反（「只有一個」被判成「不只一個」），所以要訓練。

## 流程

1. `node training/nlu/build.mjs prompts`：從 `data/dialogues.json` 產生
   - `prompts/*.md`：給 Gemini 的提示詞（4 批），整份貼給 Gemini
   - `nodes.json`：要聽懂的問題與選項
   - `test.json`：測試題（**不可拿來訓練**）
2. 把 Gemini 的輸出存成文字檔，`node training/nlu/build.mjs check <檔案>`：
   檢查格式、去掉重複與和測試題相同的句子，合併進 `data/train.jsonl`
3. 在 Colab 用 `data/train.jsonl` 訓練，用 `test.json` 評估（之後補 Colab 筆記本）

劇本改了選項之後要重跑第 1 步。
