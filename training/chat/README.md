# 第二階段：有溫度、會用工具的對話模型

計畫見 `docs/AI訓練計劃書.md`。底子：Qwen2.5-1.5B-Instruct（Apache-2.0），Colab 上 LoRA 微調；
完成後的模型放在 Hugging Face 帳號 HauHau2010（上傳金鑰只放在 Colab 的密鑰，不進儲存庫）。
MLC 官方已有同架構的手機版（mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC），只要換權重，不用重新編譯。

## 資料（全部自創）

| 批次 | 內容 | 怎麼產生 |
|---|---|---|
| 1 | 不需要計算的對話：閒聊、被罵、累、題目不清楚、參數未知 | `prompts/1-chat.md` 給 Gemini |
| 2 | 會用工具的解題對話 | 我用解題引擎產生真的工具結果，Gemini 只負責把結果講得有溫度（之後補） |

`node training/chat/build.mjs check <檔案>`：檢查格式、長度、LaTeX／Markdown、老師有沒有講出學生沒給的數字、
有沒有用到考題，合格的合併進 `data/chat.jsonl`。

## 考題

`exam.json`：20 題固定考題，訓練前後各考一次。
