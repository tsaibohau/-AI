// 定義樹：高中精確版為核心，較低年級取「簡化標記」那一層
// 學生卡住時，沿著 prereq 往回追到更基本的定義
import data from '../../data/definitions.json' with { type: 'json' };

export const LEVELS = data.levels; // ['國小', '國中', '高中']
const DEF = new Map(data.definitions.map((d) => [d.id, d]));
const rank = (level) => LEVELS.indexOf(level);

export const getDefinitionEntry = (id) => DEF.get(id) || null;
export const getChain = (id) => data.chains.find((c) => c.id === id) || null;

/**
 * 依年級取定義。
 * 回傳 { id, name, kind, level, text, derivation?, missing?, fix?, beyond? }
 * - 高中：精確版（hs）
 * - 較低年級：有對應的簡化層就用它，並附上「少講了什麼、高中怎麼修正」
 * - 該年級還沒正式學到（intro 比較晚）：國中其實也會稍微碰到，所以照樣給高中版，標 beyond = true
 *   （要不要講、講多少，由「你知道這個概念嗎？」的回答決定，不靠年級擋掉）
 */
export function getDefinition(id, level = '高中') {
  const d = DEF.get(id);
  if (!d) return null;
  if (rank(level) < 0) throw new Error(`不認得的年級「${level}」`);
  const base = { id, name: d.name, kind: d.kind, level };
  if (rank(level) < rank(d.intro)) return { ...base, level: '高中', beyond: true, text: d.hs, ...(d.derivation ? { derivation: d.derivation } : {}) };
  if (level === '高中') return { ...base, text: d.hs, ...(d.derivation ? { derivation: d.derivation } : {}) };
  // 這個年級沒有專屬說法時，往下找最近的較低年級
  for (let r = rank(level); r >= 0; r--) {
    const s = d.simplified?.[LEVELS[r]];
    if (s) return { ...base, level: LEVELS[r], text: s.say, missing: s.missing, fix: s.fix };
  }
  return { ...base, text: d.hs };
}

/**
 * 往回追先備概念：回傳由最基本到 id 本身的順序（拓撲排序，不重複）。
 * 學生說「我不懂」時，從這串的前面開始確認。
 */
export function traceBack(id) {
  const out = [];
  const seen = new Set();
  const visit = (x) => {
    if (seen.has(x)) return;
    seen.add(x);
    const d = DEF.get(x);
    if (!d) return;
    for (const p of d.prereq) visit(p);
    out.push(x);
  };
  visit(id);
  return out;
}

const cueRe = (cue) => new RegExp(cue.split('…').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.{0,12}'));

/** 從題目文字找出情境字眼對應的概念：[{ id, name, cue }] */
export function findByCues(text) {
  const t = String(text || '');
  const hits = [];
  for (const d of data.definitions) {
    const cue = d.cues?.find((c) => cueRe(c).test(t));
    if (cue) hits.push({ id: d.id, name: d.name, cue });
  }
  return hits;
}

export const allDefinitions = () => data.definitions;

const plain = (t) => String(t || '').normalize('NFKC').toLowerCase().replace(/[\s，。,.!！?？、「」]+/g, '');

/** 用學生的說法找概念（id、名稱、常見問法；越長的比對越優先）。找不到回傳 null */
// 「2+2」「3×4」這種純算式：查的是那個運算本身
const OP_OF = [
  [/^\d+(?:\.\d+)?[+＋]\d+(?:\.\d+)?(?:=\d+)?$/, 'num.addition'],
  [/^\d+(?:\.\d+)?[-−－]\d+(?:\.\d+)?(?:=-?\d+)?$/, 'num.subtraction'],
  [/^\d+(?:\.\d+)?[×x*＊·]\d+(?:\.\d+)?(?:=\d+)?$/, 'num.multiplication'],
  [/^\d+(?:\.\d+)?[÷/／]\d+(?:\.\d+)?(?:=\d+(?:\.\d+)?)?$/, 'num.division'],
];

export function findConcept(query) {
  const q = plain(query);
  if (!q) return null;
  const expr = String(query).normalize('NFKC').replace(/\s+/g, '').replace(/^為什麼/, '');
  for (const [re, id] of OP_OF) if (re.test(expr) && DEF.get(id)) return DEF.get(id);
  let best = null;
  for (const d of data.definitions) {
    for (const key of [d.id, d.name, ...(d.aliases || [])]) {
      const k = plain(key);
      if (!k) continue;
      const score = q === k ? 1000 + k.length : q.includes(k) || k.includes(q) ? k.length : 0;
      if (score && (!best || score > best.score)) best = { score, d };
    }
  }
  return best?.d || null;
}

/** 查觀念工具的回傳：定義或導出、推導、比喻、從哪些概念來（學生追問就往這些查） */
export function explainConcept(query) {
  const d = findConcept(query);
  if (!d) return null;
  const names = (ids) => (ids || []).map((x) => DEF.get(x)?.name).filter(Boolean);
  return {
    name: d.name,
    kind: d.kind === 'definition' ? '定義（規定的，不用證明）' : '導出（可以從更基本的推出來）',
    meaning: d.hs,
    ...(d.derivation ? { why: d.derivation } : {}),
    ...(d.analogy ? { analogy: d.analogy } : {}),
    ...(d.prereq.length ? { comes_from: names(d.prereq) } : {}),
  };
}
