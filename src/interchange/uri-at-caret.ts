/** Inspect only the token touching the caret. Indices are editor Cells (Unicode
 * code points), not UTF-16 offsets. Non-text Cells act as token boundaries. */
export function uriAtCaret(caret: number, length: number, read: (index: number) => string | undefined) {
  const tokenCell = (i: number) => {
    const value = i >= 0 && i < length ? read(i) : undefined;
    return value && !/[\s<>"'`]/u.test(value) ? value : undefined;
  };
  let start = caret, end = caret;
  while (start > 0 && tokenCell(start - 1)) start--;
  while (end < length && tokenCell(end)) end++;
  const cells = Array.from({ length: end - start }, (_, i) => read(start + i)!);
  const token = cells.join('');
  const match = /https?:\/\//i.exec(token);
  if (!match) return;
  const offset = [...token.slice(0, match.index)].length;
  // Permit prose/Markdown wrappers, but never find a URL inside another URL.
  if (offset && !/[([{]$/.test(cells.slice(0, offset).join(''))) return;
  start += offset;
  const url = cells.slice(offset);
  const counts = new Map<string, number>();
  for (const c of url) if ('()[]{}'.includes(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  while (url.length) {
    const last = url.at(-1)!;
    const open = ({ ')': '(', ']': '[', '}': '{' } as Record<string, string>)[last];
    if (/[.,;:!?]/.test(last) || open && (counts.get(last) ?? 0) > (counts.get(open) ?? 0)) {
      url.pop(); if (open) counts.set(last, counts.get(last)! - 1);
    }
    else break;
  }
  end = start + url.length;
  if (caret < start || caret > end) return;
  const source = url.join('');
  try { const parsed = new URL(source); if (!parsed.hostname) return; } catch { return; }
  return { start, end, source };
}
