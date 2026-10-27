# 數學解惑（原型）

高中數學題目的教學 AI。學生輸入或上傳一題，系統用「四階段 + 圖解」帶著理解，並存進錯題本。
**重點是教思考，不是直接給答案。**

- 純前端 PWA，手機優先，部署在 GitHub Pages
- 零費用：只使用開源套件與 Gemini API 免費額度，金鑰由使用者自己提供
- 資料只存在你自己的瀏覽器（localStorage / IndexedDB），沒有後端

> 目前進度：階段 0（儲存庫基礎）、階段 A（評測集）。功能頁面陸續開發中。

## 四階段

1. **審題**：題目要求什麼（一句話）
2. **已知**：明示條件與隱含條件
3. **觀念**：用到哪些概念（只能從 [`data/concepts.json`](data/concepts.json) 選）
4. **延伸**：一步一步推導，每一步附理由與可驗算的算式

預設只顯示階段一，按「提示」才展開下一階段，最後才顯示答案。

## 如何取得免費的 Gemini API 金鑰

1. 用 Google 帳號登入 [Google AI Studio](https://aistudio.google.com/)
2. 點左側「Get API key」→「Create API key」
3. 複製金鑰，貼到本網站的「設定」頁

注意：

- 免費額度有次數限制，用完要等額度重置
- **免費額度的輸入內容可能被 Google 用於改進產品。請勿輸入姓名、學校、聯絡方式等個人資料。**
- 金鑰只存在你瀏覽器的 localStorage，不會上傳到本儲存庫或任何其他伺服器（只送給 Google 的 API）
- 不要把金鑰貼到任何公開地方；若外洩，到 AI Studio 刪除重建即可

## 本機執行

需要 Node.js 22 以上。

```bash
npm install        # 安裝套件，同時啟用 pre-commit 金鑰掃描
npm run dev        # 開發伺服器
npm test           # 單元測試
npm run build      # 建置到 dist/
npm run scan       # 掃描所有被追蹤的檔案是否含疑似金鑰
```

## 評測

評測集放在 [`eval/`](eval/)，說明見 [`eval/README.md`](eval/README.md)。

```bash
cp .env.example .env              # 填入 GEMINI_API_KEY（.env 不會被提交）
npm run eval                      # 呼叫模型作答並評分
npm run eval -- --from 檔案.json   # 不呼叫模型，重新評分已存的輸出
```

輸出三項指標：答案正確率、概念標籤命中率、JSON 合法率。

## 部署

推上 `main` 後，GitHub Actions 會依序執行金鑰掃描、測試、建置，然後部署到 GitHub Pages。
第一次使用要到儲存庫的 **Settings → Pages**，把 **Source** 設成 **GitHub Actions**。

## 隱私

- 本專案沒有後端，不收集任何資料
- 錯題本、回饋表都只存在你自己的瀏覽器裡
- 匯出的檔案請存到 `exports/`，這個資料夾已被 `.gitignore` 排除，不會被提交
- **貢獻者請勿提交**任何金鑰、個人資料、使用者回饋或錯題本匯出檔

## 題庫版權聲明

- `eval/` 與所有範例題目**只收自創或改編題**
- **不收**學校考卷、補習班講義、出版社教材或任何考試的原題
- 改編題必須在題型、數字與敘述上與原題有實質差異，並在 `source` 欄位註明「改編」
- 若你發現本儲存庫中有侵權疑慮的題目，請通知我們移除

## 安全

- 程式碼中不得出現任何金鑰
- `npm install` 會設定 git hook（`.githooks/pre-commit`），提交前自動掃描暫存區，發現疑似金鑰就擋下
- CI 也會再掃描一次所有檔案
- 建議在 GitHub 儲存庫設定開啟 Secret scanning 與 Push protection（公開儲存庫免費）

## 使用的開源套件

Vite、Vitest、mathjs、Ajv、JSXGraph（陸續加入）

## 授權

[MIT](LICENSE)
