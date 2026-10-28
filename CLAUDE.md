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
- 長期目標：使用者想**自己訓練 AI**（在 Colab），計劃書見 `docs/AI訓練計劃書.md`；第一階段「聽懂學生的話」小模型已上線（`training/nlu/`、`src/tutor/nlu.js`、模型在 `public/models/nlu/`，約 23 MB，使用者選擇放在儲存庫裡）；資料用 Gemini 產生、測試 64 句：關鍵字＋模型 61。第二階段（會說話的生成模型）還沒開始，使用者沒說之前先別動手。
- 待做：更多應用問題類型、3D 圖解、錯題本與回饋表、換數字出類似題。
- 待使用者決定：`eval/problems.json` 第 3～5 題的 `needs_diagram` 要不要改成 `true`。

## 使用者的解題思路

使用者會在 `docs/solving-method/` 說明「每一類題目的運作方式」（格式見 `docs/solving-method/TEMPLATE.md`）。
**實作應用問題或新題型時，以這些文件為準**：照它的步驟順序、判斷線索、提問方式來設計模板、老師模式的提問與圖解。
