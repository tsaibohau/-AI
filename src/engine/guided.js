// 引導思考模式：系統解不出來時，不給答案，改用四階段提問陪學生自己拆題
import { domainConditions, features, pretty } from './general/ast.js';
import { prettyText } from './common.js';
import { rangeText } from './parse.js';

const TOPICS = [
  { re: /三角形|圓|角度|邊長|面積|周長|半徑|弦|切線/, hint: '這可能是幾何題：先畫圖，把已知的長度、角度標上去，再找可以用的定理（畢氏定理、正弦或餘弦定理、相似）' },
  { re: /機率|排列|組合|骰子|抽/, hint: '這可能是排列組合或機率題：先確定「全部有幾種」與「符合的有幾種」，注意有沒有順序、能不能重複' },
  { re: /數列|等差|等比|第\s*n\s*項|級數/, hint: '這可能是數列題：先寫出前幾項找規律，判斷是等差還是等比，再用公式' },
  { re: /向量|內積/, hint: '這可能是向量題：把向量寫成座標，內積可以判斷垂直與夾角' },
  { re: /元|公尺|公里|小時|分鐘|速度|價格|成本|利潤|人數/, hint: '這是應用題：先設未知數（例如設 x 為…），把文字翻譯成方程式或不等式' },
  { re: /證明|試證/, hint: '這是證明題：從已知出發，每一步都要有理由，最後推到要證明的結論' },
];

const CONCEPT_HINTS = [
  { when: (f, t) => f.logVar || /log|對數/.test(t), ids: ['log.domain', 'log.rules', 'log.definition'] },
  { when: (f, t) => f.expVar || /指數/.test(t), ids: ['exp.rules', 'base.substitution', 'exp.function_graph'] },
  { when: (f, t) => /恆成立|對所有|對任意/.test(t), ids: ['qineq.always_true', 'quad.discriminant'] },
  { when: (f, t) => /最大|最小|最值/.test(t), ids: ['quad.completing_square', 'quad.max_min', 'base.function_graph'] },
  { when: (f, t) => /[<>≤≥]/.test(t), ids: ['base.sign_analysis', 'base.interval_notation'] },
  { when: (f, t) => /頂點|對稱軸/.test(t), ids: ['quad.vertex_axis'] },
  { when: (f) => f.sqrtVar || f.fracVar, ids: ['base.domain'] },
];

function strategies(f, t, param) {
  const s = [];
  if (f.logVar) s.push('對數題：先寫出「真數 > 0」的條件，再試著用對數律把同底的對數合併，最後化成指數形式');
  if (f.expVar) s.push('指數題：觀察能不能把各項化成同一個底數；若出現 a²ˣ 與 aˣ，可以令 t = aˣ（記得 t > 0）');
  if (f.sqrtVar) s.push('有根號：先寫出根號內 ≥ 0，再考慮兩邊平方（平方後要回頭檢查）');
  if (f.fracVar) s.push('有分式：分母不能為 0；解不等式時不要直接乘分母，改成移項通分再判斷正負');
  if (param) s.push(`有參數 ${param}：想想 ${param} 會影響什麼（開口方向、判別式、根的位置），必要時分情況討論`);
  if (/[<>≤≥]/.test(t)) s.push('不等式：先找出等號成立的點，把數線切段，每段取一個數代入判斷');
  if (/最大|最小|最值/.test(t)) s.push('最值：能配方就配方找頂點；有範圍限制時，比較頂點與端點');
  if (!s.length) s.push('先把題目要求和已知條件各寫成一句話，再找連接兩者的觀念或公式');
  return s;
}

/** 依題目文字與（若有）分析結果，產生引導提問 */
export function buildGuided(text, an, conceptName) {
  const t = an?.norm || String(text || '');
  let f = { log: false, logVar: false, expVar: false, sqrtVar: false, fracVar: false };
  let conds = [];
  if (an?.node) {
    try {
      f = features(an.node, an.x);
      conds = an.x ? domainConditions(an.node, an.x).map((c) => c.text) : [];
    } catch {
      /* 分析失敗就只用文字 */
    }
  }
  const asks = [];
  const ask = String(text || '').match(/(求|試求|問|證明)([^，。,.;；]*)[。.]?\s*$/);
  if (ask) asks.push(`題目最後寫「${ask[0].trim()}」，這就是要回答的目標`);
  if (/最小/.test(t)) asks.push('題目中有「最小」，可能要求最小值');
  if (/最大/.test(t)) asks.push('題目中有「最大」，可能要求最大值');
  if (/範圍/.test(t)) asks.push('題目要求「範圍」，答案通常是一個區間');
  if (/解/.test(t)) asks.push('題目要你「解」，要找出所有符合的值');
  if (/證明/.test(t)) asks.push('這是證明題，要寫出完整的推理');

  const pieces = (an?.runs || [])
    .filter((r) => r.kind !== 'other' && (r.expr || r.lhs || r.kind === 'range'))
    .filter((r) => r.kind !== 'expr' || /[\d+\-*/^()]/.test(r.expr))
    .map((r) =>
      r.kind === 'range'
        ? rangeText(r)
        : r.kind === 'rel'
          ? prettyText(`${r.lhs}${r.op}${r.rhs}`)
          : r.kind === 'def'
            ? `${r.name === 'y' ? 'y' : `${r.name}(${r.var})`} = ${prettyText(r.expr)}`
            : prettyText(r.expr),
    );

  const ids = [...new Set(CONCEPT_HINTS.filter((h) => h.when(f, t)).flatMap((h) => h.ids))];
  const topics = TOPICS.filter((x) => x.re.test(t)).map((x) => x.hint);
  let mainText = null;
  try {
    if (an?.node) mainText = pretty(an.node);
  } catch {
    mainText = null;
  }

  return {
    stages: [
      { title: '一、審題', question: '題目最後問什麼？試著寫成一句話：「求 ___」。', hints: asks },
      {
        title: '二、已知條件',
        question: '題目給了哪些條件？有沒有沒說出口的條件（x 是實數、真數大於 0、分母不為 0…）？',
        hints: [...pieces.map((p) => `題目裡的算式：${p}`), ...conds.map((c) => `注意：${c}`)],
      },
      {
        title: '三、可能用到的觀念',
        question: '哪一個觀念能把已知和要求連起來？',
        hints: ids.map((id) => conceptName(id) || id),
      },
      { title: '四、可以試試的策略', question: '選一個策略動手算，卡住再換下一個。', hints: [...topics, ...strategies(f, t, /^[a-z]$/.test(an?.param || '') && !topics.length ? an.param : null)] },
    ],
    expr: mainText,
    variable: an?.x || 'x',
  };
}
