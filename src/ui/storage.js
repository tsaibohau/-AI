// 本機紀錄：只存在這台裝置的瀏覽器，不上傳。讀寫都可能失敗（無痕模式等），一律包 try/catch。
const KEY = 'mt.unsolved.v1';
const MAX = 200;

export function listUnsolved() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function recordUnsolved(text, reason) {
  try {
    const items = listUnsolved().filter((i) => i.text !== text);
    items.unshift({ text, reason, at: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    /* 存不了就算了，不影響解題 */
  }
}

export function clearUnsolved() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}

/** 讓使用者下載 JSON（建議存到專案的 exports/ 資料夾，該資料夾不會被提交） */
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
