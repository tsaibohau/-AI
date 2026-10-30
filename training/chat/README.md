# 第二階段：有溫度、會用工具的對話模型

計畫見 `docs/AI訓練計劃書.md`。底子：Qwen2.5-1.5B-Instruct（Apache-2.0），Colab 上 LoRA 微調；
完成後的模型放在 Hugging Face 帳號 HauHau2010（上傳金鑰只放在 Colab 的密鑰，不進儲存庫）。
MLC 官方已有同架構的手機版（mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC），只要換權重，不用重新編譯。

## 資料（全部自創）

| 批次 | 內容 | 怎麼產生 |
|---|---|---|
| 1 | 不需要計算的對話：閒聊、被罵、累、題目不清楚、參數未知 | `prompts/1-chat.md` 給 Gemini |
| 2 | 會用工具的解題對話（147 題） | `tools-gen.mjs` 用固定亂數出自創題、呼叫真的解題引擎拿結果；Gemini 只寫拿到結果後老師怎麼講（`prompts/2-tools-*.md`） |

`node training/chat/build.mjs check <檔案>`：檢查格式、長度、LaTeX／Markdown、老師有沒有講出學生沒給的數字、
有沒有用到考題，合格的合併進 `data/chat.jsonl`。

第 2 批：`node training/chat/build.mjs tools <Gemini 的輸出>`，把回應和題目、工具呼叫、結果組成完整對話（`data/tools.jsonl`），
格式和網站的本機 AI 一樣（學生 → 老師說明＋`<tool>` → `<result>` → 老師回應）。訓練時 system 一律用網站的 SYSTEM_PROMPT＋工具說明。

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

## 訓練

- `train.py`：訓練前考試 → 微調（SFT，LoRA）→ 偏好訓練（DPO）→ 訓練後考試 → 上傳到 Hugging Face（私人）。
  斷線後重跑會跳過已完成的步驟。`--smoke` 用 0.5B 模型在 CPU 上確認流程（已在 Claude 的環境跑通）。
- `train.ipynb`：給 Kaggle（可背景執行）或 Colab 用的筆記本，一格一格按執行。
  Colab 直接開：https://colab.research.google.com/github/tsaibohau/-AI/blob/main/training/chat/train.ipynb
- `data/system.txt`：網站實際用的系統提示詞＋工具說明，測試會檢查兩者一致。
- 系統提示詞約 1800 token，所以長度上限設 2560，並開啟 gradient checkpointing 省記憶體。

## 第二輪（快、狠、準）

第一輪訓練後考試 8/20 → 17/20，但語氣仍是客氣的 AI 味，還有亂給建議、聽不懂口語、開場白講錯數學。
使用者提供了一段真實上課錄音（不放進儲存庫），整理成 `docs/老師個性.md`：**快、狠、準**，一句能講完不講兩句。

- `round2/`：Claude 依老師個性改寫的全部回答（`chat-new.txt`、`tools-new.txt`）＋補強弱點的新對話
  （台灣口語、觀念用比喻、解題先講架構、恆過定點用工具；`extra-*.jsonl`，每題附壞例子）。
  `round2/apply.mjs` 已經跑過一次，結果就是現在的 `data/`（不要再跑）。
- `pairs.jsonl` 全部換成「新（快狠準）＝好、舊（太長客套）＝壞」，加上第一輪模型的爛回答當壞例子。
- 網站的系統提示詞第 9 條改成快狠準，`system.txt` 同步。
- `round2/extra-why.jsonl`：基本觀念的「為什麼」（1+1=2、除以零、零次方、移項……），學生追問就往下挖一層（`round2/append.mjs` 追加，可重複跑）。考試加一題「為什麼 2+2=4」。
- 考試多兩項自動檢查：不用工具的回答超過 60 字、用工具前的開場白超過 40 字，算「太長」。
