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

## 方向修正（使用者回饋：AI 味太重）

第一版 Gemini 資料「看似親切卻沒重點」，而且被問是不是真人時會迴避。修正：
- 好回答的規則：每句要有一個具體的東西（能馬上做的建議、能找出卡點的問題、常見情況的小故事）；
  被問身分時誠實說是 AI；不編自己的經歷；情緒優先時不硬拉回數學；驚嘆號最多一個；不用空話。
- 前 80 段由 Claude 依新規則重寫（`chat.jsonl`），Gemini 原稿存成壞例子（`pairs.jsonl`）。
- 之後的提示詞（`prompts/1-chat.md` 第 2 版）請 Gemini 每段同時寫好、壞兩版。
- 訓練分兩步：先用 `chat.jsonl` 做一般微調（SFT），再用 `pairs.jsonl` 做偏好訓練（DPO），讓模型學會避開 AI 味。
- `build.mjs check` 會退回驚嘆號太多、兩個以上空話的回答。

## 考題

`exam.json`：20 題固定考題，訓練前後各考一次。
