// 「我不懂」追問：辨認學生在問什麼，從講義、名詞解釋與步驟細節組出回答
// 不需要 AI；問法太特別時會反問學生確認（像老師一樣先聽懂再回答）
import concepts from '../../data/concepts.json' with { type: 'json' };
import lessonsData from '../../data/lessons.json' with { type: 'json' };
import glossary from '../../data/glossary.json' with { type: 'json' };

const CONCEPT = new Map(concepts.concepts.map((c) => [c.id, c]));
const LESSON = lessonsData.lessons;

export const INTENTS = [
  { id: 'why', label: '為什麼可以這樣做？' },
  { id: 'how', label: '這個數字怎麼來的？' },
  { id: 'term', label: '這個詞是什麼意思？' },
  { id: 'example', label: '可以舉個簡單的例子嗎？' },
  { id: 'prereq', label: '我前面的觀念不太熟' },
  { id: 'pitfall', label: '這裡要注意什麼？' },
];

const RULES = [
  { id: 'how', re: /怎麼來|怎麼算|哪裡來|哪來|從哪|怎麼得|怎麼變|算出來|怎麼求|怎麼出現|怎麼跑出|為什麼是\s*[−-]?\d|怎麼會是|怎樣算/ },
  { id: 'example', re: /例子|舉例|舉個|例題|簡單一點|簡單的|再一題|示範/ },
  { id: 'prereq', re: /不熟|忘了|忘記|沒學過|沒教|前面|基礎|根本不懂|完全不懂|從頭/ },
  { id: 'pitfall', re: /注意|陷阱|小心|常錯|容易錯|會錯|錯在|為什麼錯/ },
  { id: 'term', re: /什麼意思|是什麼|什麼是|意思|定義|指的是|代表什麼|是指/ },
  { id: 'why', re: /為什麼|為何|怎麼可以|憑什麼|為啥|幹嘛|why|可以這樣|為甚麼|為什麽|理由|原因/i },
];

/** 在文字中找名詞（含別名），回傳名詞條目 */
export function findTerms(text) {
  const t = String(text || '');
  return glossary.terms.filter((g) => [g.term, ...g.aliases].some((a) => a.length >= 2 && t.includes(a)) || (t.includes(g.term)));
}

/** 辨認追問意圖；回傳 { intent, terms, numbers } 或 intent 為 null */
export function classify(text) {
  const t = String(text || '').trim();
  const terms = findTerms(t);
  const numbers = (t.normalize('NFKC').replace(/[−–]/g, '-').match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) || []);
  let intent = RULES.find((r) => r.re.test(t))?.id || null;
  // 「判別式是什麼」「真數？」：只提到名詞時當成問名詞
  if (!intent && terms.length) intent = 'term';
  // 只丟一個數字：「−2？」通常是在問這個數字怎麼來的
  if (!intent && numbers.length && t.length <= 12) intent = 'how';
  // 「為什麼是 3」「為什麼根是正的 3」：問的是某個數字怎麼來的（0 常出現在「要大於 0」這類問法，不算）
  if (intent === 'why' && numbers.some((n) => Number(n) !== 0)) intent = 'how';
  return { intent, terms, numbers };
}

const nameOf = (id) => CONCEPT.get(id)?.name || id;

function lessonParas(id, fields) {
  const l = LESSON[id];
  if (!l) return [];
  return fields.filter((f) => l[f]).map((f) => ({ summary: '重點', why: '為什麼', example: '例子', pitfall: '常見錯誤' }[f] + '：' + l[f]));
}

const readableExpr = (e) =>
  String(e || '')
    .replace(/\*\(/g, '(')
    .replace(/(\d)\*([a-z])/g, '$1$2')
    .replace(/\*/g, ' × ')
    .replace(/\^2(?!\d)/g, '²')
    .replace(/\^3(?!\d)/g, '³')
    .replace(/sqrt\(/g, '√(')
    .replace(/-/g, '−');

/**
 * 回答一個追問。
 * ctx: { step?: 推導步驟, concept?: 概念 id, stageText?: 該階段的文字 }
 * 回傳 { title, paras: string[], follow: 追問建議 [{ intent, label }], understood: boolean }
 */
export function answerFollowUp(intentOrText, ctx = {}) {
  const isIntent = INTENTS.some((i) => i.id === intentOrText);
  const c = isIntent ? { intent: intentOrText, terms: [], numbers: [] } : classify(intentOrText);
  const step = ctx.step || null;
  const cid = step?.concept || ctx.concept || null;
  const stepText = [step?.step, step?.reason, step?.detail, ctx.stageText].filter(Boolean).join(' ');

  if (!c.intent) {
    return {
      title: '我想先確定你的問題',
      paras: ['我還聽不太懂你想問的是哪一部分，你的意思比較接近下面哪一個？'],
      follow: INTENTS,
      understood: false,
    };
  }

  const paras = [];
  let title = '';
  switch (c.intent) {
    case 'why':
      title = '為什麼可以這樣做';
      if (step?.reason) paras.push(step.reason + '。');
      paras.push(...lessonParas(cid, ['why']));
      if (!paras.length) paras.push('這一步是依照題目的條件直接整理出來的。');
      break;
    case 'how': {
      title = '這個數字怎麼來的';
      if (c.numbers.length && step) {
        const n = c.numbers[0].replace('-', '−');
        paras.push(stepText.includes(n) || stepText.includes(c.numbers[0]) ? `你問的 ${n} 出現在這一步。` : `這一步裡沒有直接出現 ${n}，可能是你自己算出來的？可以對照下面的計算過程。`);
      }
      if (step?.detail) paras.push(step.detail);
      if (step?.expr) paras.push(`算式：${readableExpr(step.expr)}`);
      if (!step?.detail && !step?.expr) paras.push('這一步沒有新的計算，是把前面的結果整理後寫出來。');
      break;
    }
    case 'term': {
      title = '名詞解釋';
      const terms = c.terms.length ? c.terms : findTerms(stepText);
      if (terms.length) for (const g of terms.slice(0, 3)) paras.push(`「${g.term}」：${g.meaning}`);
      else if (cid) paras.push(`這一步用到「${nameOf(cid)}」。`, ...lessonParas(cid, ['summary']));
      else paras.push('你想問哪個詞？可以直接打出那個詞，例如「判別式是什麼」。');
      break;
    }
    case 'example':
      title = '簡單的例子';
      paras.push(...lessonParas(cid, ['example']));
      if (!paras.length) paras.push('這一步目前沒有準備例子，你可以試著把題目的數字換小一點自己算一次。');
      break;
    case 'prereq': {
      title = '先複習前面的觀念';
      const pre = CONCEPT.get(cid)?.prereq || [];
      if (cid) paras.push(`這一步用到「${nameOf(cid)}」，先把它講清楚：`, ...lessonParas(cid, ['summary', 'example']));
      if (pre.length) {
        paras.push('它建立在這些觀念上，如果也不熟可以一起複習：');
        for (const p of pre) paras.push(`・${nameOf(p)}：${LESSON[p]?.summary || ''}`);
        paras.push('看完覺得還不熟，可以點下面的「舉例」再看一次。');
      } else if (!cid) paras.push('先告訴我你卡在哪個名詞或步驟，我從那裡開始講。');
      break;
    }
    case 'pitfall':
      title = '要注意的地方';
      paras.push(...lessonParas(cid, ['pitfall']));
      if (!paras.length) paras.push('這一步最常見的錯是計算時符號弄錯，寫完可以代一個數字回去檢查。');
      break;
    default:
      break;
  }
  const follow = INTENTS.filter((i) => i.id !== c.intent).slice(0, 4);
  return { title, paras, follow, understood: true };
}

export { LESSON, CONCEPT };
