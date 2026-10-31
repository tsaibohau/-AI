# 給接手的 Claude：專案交接

這是「數學解惑」：高中數學的教學 AI，目標是像老師一樣教學生**怎麼想**，不是只給答案。
使用者（專案擁有者）用手機和你溝通，**沒有電腦**；回覆要短、結論先講、用繁體中文。

## 必守規則

- **公開儲存庫**：不得提交任何金鑰、個人資料、使用者回饋、錯題本匯出檔。`.env`、`private/`、`exports/` 都已被 gitignore。
- **題庫版權**：`eval/` 與範例只放**自創或改編**題。學校考卷、補習班、出版社原題只能放 `private/`（只在本機測試）。
- **零費用**：不得使用付費 API 或服務。部署用 GitHub Pages + GitHub Actions。
- **金鑰**：程式碼中不得出現金鑰；pre-commit 與 CI 都會掃描（`npm run scan`）。
- **開發方式**：直接在 `main` 小步 commit，**commit 訊息用繁體中文**；不開 Issue、不開 PR（除非使用者要求）。
- **不確定就先問**，不要自己假設；大方向改變先給計畫、等確認。
- 推送前跑：`npm test`、`npm run eval`、`npm run build`。CI 的評測門檻是答案正確率 80%。

## 使用者的偏好（重要）

- 想要的是「老師」：會反問學生、聽懂追問、診斷錯在哪一步，而不是死板的模板。
- **每一題都要有圖解**（「數學是建立在點、線、面、立體空間上的」）。之後要加 3D（JSXGraph 有 view3d）。
- AI 的輸出**不可以有 LaTeX、Markdown 亂碼**；`src/tutor/llm.js` 的 `cleanText()` 會轉換。
- 數字一律由解題引擎精確計算，AI 只負責理解、規劃、解釋。

## 架構

| 位置 | 內容 |
|---|---|
| `src/engine/` | 解題引擎：精確分數與根式（`num.js`）、多項式（`poly.js`）、11 種題型模板（`types/`）、通用解法（`general/`）、直線與坐標幾何（`lines.js`）、引導模式（`guided.js`） |
| `src/agent/` | AI 對話：工具清單（`tools.js`）、對話流程（`agent.js`）、提示詞（`prompt.js`）、Gemini（`gemini.js`）、本機模型（`local.js`） |
| `src/tutor/` | 「我不懂」追問（`followup.js`）、用圖解釋（`graph.js`）、本機 AI（`llm.js`，WebLLM） |
| `src/core/` | 答案比對（`answer.js`）、作答診斷（`diagnose.js`）、圖解規格驗證（`diagram.js`）、schema |
| `src/ui/` | 首頁 AI 對話（`chat.js`）、老師帶我做（`app.js`、`tutor.js`）、圖解渲染（`diagram.js`，JSXGraph） |
| `data/` | 概念清單、觀念小講義、名詞解釋、定義樹 `definitions.json`（高中精確版＋國小／國中簡化標記、定義或導出、先備、考卷字眼；讀取用 `src/core/definitions.js`）（全部自創） |
| `eval/` | 引擎評測（`score.mjs`）、AI 對話評測（`agent-score.mjs`，需要 Gemini 金鑰） |
| `docs/` | 使用者提供的解題思路（見下方） |

## 目前狀態

- 已完成：11 種題型、通用解法、老師模式（反問、診斷、追問）、圖解（函數、數線、幾何、直線）、AI 對話（12 個計算工具）、本機 AI。
- **Gemini 暫停**：使用者沒有電腦，無法跑 `npm run eval:agent`；不要主動推進 Gemini 相關工作，除非使用者提起。
- 一張學校平時考（第一冊 2-1 直線與斜率）的原題在 `private/exam-2-1/`（不在儲存庫裡，使用者手上有備份）；用工具重現 17/17 小題答案正確。
- 應用問題第一類已完成：到三點等距（外心），`src/engine/types/application.js`；老師模式改成**引導式對話**：劇本 `data/dialogues.json`（診斷問題＋比喻，數字由引擎帶入）、對話引擎 `src/tutor/dialogue.js`；本機 AI 只把學生的話對應到劇本選項。使用者不喜歡直接念定義或一直問「知道嗎」。
- 長期目標：使用者想**自己訓練 AI**（在 Colab），計劃書見 `docs/AI訓練計劃書.md`；第一階段「聽懂學生的話」小模型已上線（`training/nlu/`、`src/tutor/nlu.js`、模型在 `public/models/nlu/`，約 23 MB，使用者選擇放在儲存庫裡）；資料用 Gemini 產生、測試 64 句：關鍵字＋模型 61。**第二階段已決定開始**：微調 Qwen2.5-1.5B（LoRA、Colab），學有溫度、工具格式正確、事實只來自工具；模型放使用者的 Hugging Face 帳號 HauHau2010（金鑰只放 Colab 的「密鑰」，絕不進儲存庫或對話）。最終用途：學校校訊網站的「問校務」機器人（第三階段，見計劃書）。
- **第二階段進度（下一步從這裡接）**：訓練程式 `training/chat/train.py`＋筆記本 `training/chat/train.ipynb` 已完成，已在 CPU 用 0.5B 跑通（`--smoke`）。資料：`data/chat.jsonl` 245、`tools.jsonl` 147、`pairs.jsonl` 392（DPO）、考題 `exam.json` 20 題。
  - 第一輪已在 Kaggle 跑完（T4；修過 torchao、bf16、記憶體不足，改用 transformers 4.56／TRL 0.23／PEFT 0.17），考試 8/20 → 17/20，已上傳（私人）。
  - **第二輪資料已完成（快、狠、準，見 `docs/老師個性.md`、`training/chat/README.md`）**，等使用者在 Kaggle 重跑同一本筆記本。
  - 數學理論基礎（使用者要求）：`definitions.json` 補數與運算的基礎 19 個概念＋比喻；新工具 `concept`（查觀念，查不到就說沒有）；「為什麼」訓練資料改成先查再講（`round2/why-*`）。
  1. **等使用者在 Kaggle（建議，可背景）或 Colab 跑 `train.ipynb`**（約 1.5～2 小時，需 GPU、Internet、密鑰 `HF_TOKEN`），模型以私人上傳到 `HauHau2010/math-tutor-qwen2.5-1.5b`。
  2. 使用者貼回最後一格「訓練前 vs 訓練後」對照 → 檢查自動檢查結果、請使用者評語氣；有問題就補資料重訓。
  3. 手機版：**已完成**。`training/chat/to_mlc.py`（自寫轉檔，已和官方逐位元比對）由筆記本第 7 格自動轉、公開上傳到 `HauHau2010/math-tutor-qwen2.5-1.5b-q4f16_1-MLC`（使用者已同意公開）。
  4. 網站：**已接上**，`src/tutor/llm.js` 的 MODELS 第一個「數學解惑老師」（第二輪跑完上傳後才能下載）。
  4b. 伺服器版（使用者要求「不要本機下載」）：`to_server.py`＋`space/` 建免費 HF Space（llama.cpp），網站預設用它（`src/agent/server.js`）；`deploy.ipynb` 只轉檔不訓練。第一次在 Kaggle 跑要看輸出（本機沒試過 GGUF 轉檔）。
  4c. 現況（10/30）：HF 免費帳號只能建 Static Space，伺服器版不可行（程式保留，網站已隱藏，預設改回本機「數學解惑老師」）。使用者選擇另外練 0.5B（`train.ipynb` 的 SIZE='0.5b'，上傳 `math-tutor-qwen2.5-0.5b-q4f16_1-MLC`，網站已列為「數學解惑老師・小」）。訓練前後對照（第 6 格）還沒拿到。
  4d. 0.5B 第二輪考試 4/21 → 20/21（語氣對了）。毛病：判別式求參數自己猜 k、「供三小」當成數學、稱讚回得怪 → 第三輪補強 `round3/`（apply.mjs 可重跑；判別式 10 段、嗆聲稱讚 15 段），提示詞第 10 條加判別式。下一步：使用者確認小模型能在 iPhone 跑，再重訓 0.5B。
  4e. **全自動（GitHub 觸發）**：`.github/workflows/kaggle.yml` → `kaggle_remote.py` 把 `kaggle.ipynb` 推到使用者 Kaggle（`<KAGGLE_USERNAME>/math-tutor-auto`）、等跑完、下載 `report.txt` 印在 Actions 記錄（我可用 GitHub 工具讀 job logs）。改 `training/chat/job.json`（size、gpu、run 數字加一）推上 main 就開跑。需要 GitHub Secrets：KAGGLE_USERNAME＋KAGGLE_API_TOKEN（或 KAGGLE_KEY）；HF_TOKEN 要使用者在 Kaggle 那本筆記本的 Secrets 勾一次。HF 已確認 Gradio／Docker Space 要 PRO（402），伺服器版放棄。
  5. 第三階段「問校務」：先確認學校同意與公開資料來源。
- 待做：更多應用問題類型、3D 圖解、錯題本與回饋表、換數字出類似題。
- 待使用者決定：`eval/problems.json` 第 3～5 題的 `needs_diagram` 要不要改成 `true`。

## 使用者的解題思路

使用者會在 `docs/solving-method/` 說明「每一類題目的運作方式」（格式見 `docs/solving-method/TEMPLATE.md`）。
**實作應用問題或新題型時，以這些文件為準**：照它的步驟順序、判斷線索、提問方式來設計模板、老師模式的提問與圖解。
