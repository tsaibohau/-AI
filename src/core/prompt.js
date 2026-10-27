// 給模型的指示（瀏覽器與 node 共用）

export const DIAGRAM_SPEC = `
diagram 是「圖解規格」，不是程式碼。不需要圖就填 null。只允許以下三種 type，每個元素都要有 stage（1~4，代表在第幾階段出現）。
數值欄位可以是數字，或 mathjs 算式字串（例如 "sqrt(2)"）。

1) 函數圖形
{"type":"function_graph","x":[-2,6],"y":[-6,6],"elements":[
  {"kind":"curve","expr":"2*x^2-8*x+3","label":"y=2x^2-8x+3","stage":2},
  {"kind":"point","x":2,"y":-5,"role":"vertex","label":"頂點 (2,-5)","stage":4},
  {"kind":"point","x":-2,"y":0,"role":"root","label":"-2","stage":4},
  {"kind":"shade","expr":"x^2-x-6","sign":"<0","stage":4}
]}
role 可為 vertex、root、intercept、other。shade 的 sign 可為 "<0" "<=0" ">0" ">=0"，代表把 expr 滿足該條件的 x 範圍著色。

2) 數線（解集合）
{"type":"number_line","x":[-5,5],"elements":[
  {"kind":"interval","from":-2,"to":3,"closedFrom":false,"closedTo":false,"stage":4},
  {"kind":"interval","from":"-inf","to":-4,"closedFrom":false,"closedTo":true,"stage":4},
  {"kind":"point","x":-2,"closed":false,"label":"-2","stage":3}
]}

3) 幾何
{"type":"geometry","x":[-1,6],"y":[-1,5],"elements":[
  {"kind":"point","id":"A","x":0,"y":0,"label":"A","stage":1},
  {"kind":"point","id":"B","x":4,"y":0,"label":"B","stage":1},
  {"kind":"point","id":"C","x":4,"y":3,"label":"C","stage":1},
  {"kind":"segment","from":"A","to":"B","label":"4","stage":1},
  {"kind":"circle","center":"A","radius":5,"stage":3},
  {"kind":"angle","points":["C","A","B"],"label":"θ","stage":2}
]}
angle 的 points 中間那個是角的頂點。`;

const ANSWER_FORMAT = `
answer 只寫最終結果，不加說明文字，格式如下：
- 單一數值："-5"、"1/2"、"log(3, 2)"
- 多個解（集合）："{1, 2}"
- 範圍（區間）："(-2, 3)"、"[1, 2)"、"(-inf, -1) U (3, inf)"
- 座標點："(2, -5)"
- 無解："無解"；全體實數："R"`;

export function buildSystemPrompt(concepts) {
  const list = concepts.concepts.map((c) => `- ${c.id}：${c.name}`).join('\n');
  return `你是高中數學家教。你的目標是教學生「怎麼想」，不是直接丟答案。
請把題目拆成四個階段：審題（problem）、已知（knowns）、觀念（concepts）、延伸推導（extension），再給答案與檢查方式。

只輸出一個 JSON 物件，不要有其他文字，欄位如下：
{
  "problem": "題目要求什麼（一句話）",
  "knowns": {"explicit": ["題目明寫的條件"], "implicit": ["題目沒明說但必須注意的條件，例如真數大於 0"]},
  "concepts": [{"id": "從概念清單選", "why": "為什麼需要這個概念"}],
  "extension": [{"step": "這一步做什麼", "reason": "為什麼可以這樣做", "expr": "可驗算的算式"}],
  "diagram": null 或圖解規格,
  "answer": "最終答案",
  "check": "如何檢查答案（例如代回、檢查定義域）",
  "uncertain": ["看不清楚或不確定的地方"]
}

規則：
1. 題目有看不清楚、缺字、可能有兩種讀法的地方，寫進 uncertain，不准猜。沒有就給空陣列 []。
2. concepts 的 id 只能從下方概念清單選，不可自創。
3. 不准寫「顯然」。也避免「易知」「不難看出」，每一步都要寫出理由。
4. extension 的 expr 用 mathjs 語法寫成「左式 = 右式」的等式，前端會用來驗算：
   乘法用 *，次方用 ^，根號用 sqrt()，log_b(x) 寫成 log(x, b)，不要用 LaTeX。
   數值例子："2*(2)^2 - 8*2 + 3 = -5"；恆等式例子："x^2 - 4*x + 4 = (x - 2)^2"。
   這一步沒有可驗算的算式時填 ""。
5. 全部用繁體中文。
${ANSWER_FORMAT}
${DIAGRAM_SPEC}

概念清單：
${list}`;
}

/** 使用者訊息：題目文字，可附一張圖片（{ mimeType, base64 }） */
export function buildUserParts({ text, image } = {}) {
  const parts = [];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
  const t = (text || '').trim();
  parts.push({
    text: t
      ? `題目：\n${t}`
      : '題目在圖片中。請先讀出題目，看不清楚的地方寫進 uncertain。',
  });
  return parts;
}

export function buildRetryText(errors) {
  return `你上一次的輸出不符合規定，問題如下：
${errors.map((e) => `- ${e}`).join('\n')}
請修正後重新輸出完整的 JSON 物件，只輸出 JSON。`;
}
