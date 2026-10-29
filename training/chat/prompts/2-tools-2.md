# 任務：寫「拿到計算結果後，老師怎麼講」（第 2 批）

我在訓練一個台灣高中數學家教 AI。它不自己算數學，而是呼叫計算工具；工具算完後，它要用老師的口氣把結果講給學生聽。
下面每一題都附上「學生的問題」和「工具算出來的結果（一定正確）」。請幫每一題寫老師的回應，並另外寫一個 AI 味的壞版本。

## 好版本的規則

1. **數字只能用「學生的問題」或「工具結果」裡出現過的**，不可以自己算出新的數字（連中間步驟的數字也不行）。
2. 講清楚答案，再加一個具體的東西：為什麼這樣做（一句話）、一個常見的錯、或一個讓學生確認自己懂了的小問題。
3. 學生算錯（check 類）：先說哪裡不一樣，用工具結果指出正確答案，溫和地點出常見原因（例如分子分母顛倒、忘了變號），不要說教。
4. 工具回傳 error：不要自己算答案，請學生確認題目的寫法，舉出看起來打錯的地方。
5. 口氣平實像真人：驚嘆號最多一個，不要用「一起搞定、有我在、太棒了、你可以的、大魔王、過關斬將」這類空話。
6. 1～3 句，最多 100 字。不要 LaTeX、不要 Markdown（#、**、表格、程式碼區塊）。數學式用一般寫法，例如 x² − 5x + 6、(3, 2)、−1/2。

## 壞版本（rejected）

寫成 AI 味的樣子：很熱情、很多驚嘆號、空泛鼓勵，但沒有具體內容。

## 輸出格式

只輸出 JSON Lines，一行一題，不要有其他說明文字，不要用程式碼區塊：
{"id": "題目代號", "reply": "好版本", "rejected": "壞版本"}

## 題目

- id：line-13（line）
  學生：A(-1, -4)、B(-3, -1) 這條直線的方程式是什麼？
  工具結果：{"equation":"3x + 2y + 11 = 0","A":"3","B":"2","C":"11","slope":"−3/2","form":"y = (−3/2)x − 11/2","yIntercept":"−11/2","xIntercept":"−11/3"}
- id：line-14（line）
  學生：幫我寫出過 (4, 3) 和 (0, 5) 的直線
  工具結果：{"equation":"x + 2y − 10 = 0","A":"1","B":"2","C":"-10","slope":"−1/2","form":"y = (−1/2)x + 5","yIntercept":"5","xIntercept":"10"}
- id：line-15（line）
  學生：幫我寫出過 (2, -2) 和 (0, 1) 的直線
  工具結果：{"equation":"3x + 2y − 2 = 0","A":"3","B":"2","C":"-2","slope":"−3/2","form":"y = (−3/2)x + 1","yIntercept":"1","xIntercept":"2/3"}
- id：bisector-1（bisector）
  學生：求線段 AB 的垂直平分線，A(-2, -2)、B(2, -2)
  工具結果：{"midpoint":"(0, −2)","equation":"x = 0","A":"1","B":"0","C":"0","slope":"沒有斜率（鉛直線）","form":"x = 0","xIntercept":"0"}
- id：bisector-2（bisector）
  學生：求線段 AB 的垂直平分線，A(-5, 5)、B(-1, 7)
  工具結果：{"midpoint":"(−3, 6)","equation":"2x + y = 0","A":"2","B":"1","C":"0","slope":"−2","form":"y = −2x","yIntercept":"0","xIntercept":"0"}
- id：bisector-3（bisector）
  學生：A(-3, 1)、B(-9, -1) 的中垂線方程式？
  工具結果：{"midpoint":"(−6, 0)","equation":"3x + y + 18 = 0","A":"3","B":"1","C":"18","slope":"−3","form":"y = −3x − 18","yIntercept":"−18","xIntercept":"−6"}
- id：bisector-4（bisector）
  學生：求線段 AB 的垂直平分線，A(1, 5)、B(-3, 1)
  工具結果：{"midpoint":"(−1, 3)","equation":"x + y − 2 = 0","A":"1","B":"1","C":"-2","slope":"−1","form":"y = −x + 2","yIntercept":"2","xIntercept":"2"}
- id：bisector-5（bisector）
  學生：到 (-3, -2) 和 (1, -4) 距離相等的點形成什麼直線？
  工具結果：{"midpoint":"(−1, −3)","equation":"2x − y − 1 = 0","A":"2","B":"-1","C":"-1","slope":"2","form":"y = 2x − 1","yIntercept":"−1","xIntercept":"1/2"}
- id：bisector-6（bisector）
  學生：A(6, -3)、B(4, -3) 的中垂線方程式？
  工具結果：{"midpoint":"(5, −3)","equation":"x − 5 = 0","A":"1","B":"0","C":"-5","slope":"沒有斜率（鉛直線）","form":"x = 5","xIntercept":"5"}
- id：bisector-7（bisector）
  學生：A(4, -3)、B(2, -7) 的中垂線方程式？
  工具結果：{"midpoint":"(3, −5)","equation":"x + 2y + 7 = 0","A":"1","B":"2","C":"7","slope":"−1/2","form":"y = (−1/2)x − 7/2","yIntercept":"−7/2","xIntercept":"−7"}
- id：bisector-8（bisector）
  學生：到 (-5, 5) 和 (-1, 3) 距離相等的點形成什麼直線？
  工具結果：{"midpoint":"(−3, 4)","equation":"2x − y + 10 = 0","A":"2","B":"-1","C":"10","slope":"2","form":"y = 2x + 10","yIntercept":"10","xIntercept":"−5"}
- id：bisector-9（bisector）
  學生：A(-2, 1)、B(2, 1) 的中垂線方程式？
  工具結果：{"midpoint":"(0, 1)","equation":"x = 0","A":"1","B":"0","C":"0","slope":"沒有斜率（鉛直線）","form":"x = 0","xIntercept":"0"}
- id：bisector-10（bisector）
  學生：A(-3, -4)、B(-9, 2) 的中垂線方程式？
  工具結果：{"midpoint":"(−6, −1)","equation":"x − y + 5 = 0","A":"1","B":"-1","C":"5","slope":"1","form":"y = x + 5","yIntercept":"5","xIntercept":"−5"}
- id：bisector-11（bisector）
  學生：求線段 AB 的垂直平分線，A(0, 2)、B(-6, 8)
  工具結果：{"midpoint":"(−3, 5)","equation":"x − y + 8 = 0","A":"1","B":"-1","C":"8","slope":"1","form":"y = x + 8","yIntercept":"8","xIntercept":"−8"}
- id：bisector-12（bisector）
  學生：A(6, 5)、B(12, 3) 的中垂線方程式？
  工具結果：{"midpoint":"(9, 4)","equation":"3x − y − 23 = 0","A":"3","B":"-1","C":"-23","slope":"3","form":"y = 3x − 23","yIntercept":"−23","xIntercept":"23/3"}
- id：intersect-1（intersect）
  學生：解聯立 −2x − 3y = 0、−3x − 2y = 0
  工具結果：{"relation":"相交","point":"(0, 0)"}
- id：intersect-2（intersect）
  學生：求兩直線 −3x − 3y = -6、−x + 3y = 14 的交點坐標
  工具結果：{"relation":"相交","point":"(−2, 4)"}
- id：intersect-3（intersect）
  學生：求兩直線 −3x + 3y = -18、x − 2y = 10 的交點坐標
  工具結果：{"relation":"相交","point":"(2, −4)"}
- id：intersect-4（intersect）
  學生：−x − 2y = -1 和 2x − 2y = 2 的交點？
  工具結果：{"relation":"相交","point":"(1, 0)"}
- id：intersect-5（intersect）
  學生：−x + y = -7 和 3x + y = 5 的交點？
  工具結果：{"relation":"相交","point":"(3, −4)"}
- id：intersect-6（intersect）
  學生：2x + y = -2 和 −x − y = 0 的交點？
  工具結果：{"relation":"相交","point":"(−2, 2)"}
- id：intersect-7（intersect）
  學生：−x + y = -3 和 2x − 3y = 9 的交點？
  工具結果：{"relation":"相交","point":"(0, −3)"}
- id：intersect-8（intersect）
  學生：解聯立 3x + y = 2、2x + y = 1
  工具結果：{"relation":"相交","point":"(1, −1)"}
- id：intersect-9（intersect）
  學生：2x + y = 2 和 −3x − y = -4 的交點？
  工具結果：{"relation":"相交","point":"(2, −2)"}
- id：intersect-10（intersect）
  學生：解聯立 2x − 3y = 6、−2x + 2y = -4
  工具結果：{"relation":"相交","point":"(0, −2)"}
- id：intersect-11（intersect）
  學生：−x + 3y = 10 和 −3x + y = 14 的交點？
  工具結果：{"relation":"相交","point":"(−4, 2)"}
- id：solve-1（solve）
  學生：解 x² − 4 = 0
  工具結果：{"answer":"{−2, 2}","steps":["因式分解：x² − 4 = (x + 2)(x − 2)","兩根為 x = −2 或 x = 2"],"check":"代入 x = −2：(−2)² − 4 = 0 ✓；代入 x = 2：(2)² − 4 = 0 ✓"}
- id：solve-2（solve）
  學生：解 x² + 8x + 16 = 0
  工具結果：{"answer":"{−4}","steps":["因式分解：x² + 8x + 16 = (x + 4)²","重根 x = −4"],"check":"代入 x = −4：(−4)² + 8(−4) + 16 = 0 ✓"}
- id：solve-3（solve）
  學生：幫我解這個方程式：x² − 5x = 0
  工具結果：{"answer":"{0, 5}","steps":["因式分解：x² − 5x = x(x − 5)","兩根為 x = 0 或 x = 5"],"check":"代入 x = 0：(0)² − 5(0) = 0 ✓；代入 x = 5：(5)² − 5(5) = 0 ✓"}
- id：solve-4（solve）
  學生：幫我解這個方程式：x² + 2x − 3 = 0
  工具結果：{"answer":"{−3, 1}","steps":["因式分解：x² + 2x − 3 = (x + 3)(x − 1)","兩根為 x = −3 或 x = 1"],"check":"代入 x = −3：(−3)² + 2(−3) − 3 = 0 ✓；代入 x = 1：(1)² + 2(1) − 3 = 0 ✓"}
