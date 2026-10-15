import { parseFragment } from 'parse5';
import { LIMITS, validateFragment, type MutableFragment } from './fragment';
import { emptyFragment } from './fragment';
import { fragmentText, plainFragment } from './serializer';

export const NATIVE_MIME = 'application/x-mutable-fragment+json';
export type ClipboardRepresentations = Record<string, string>;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function encode(s: string) { const bytes = new TextEncoder().encode(s); let binary = ''; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary); }
function decode(s: string) { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(s), c => c.charCodeAt(0))); }

export function exportClipboard(fragment: MutableFragment): ClipboardRepresentations {
  validateFragment(fragment);
  const text = fragmentText(fragment), json = JSON.stringify(fragment);
  // Native fidelity lives in the carrier; the visible projection remains useful outside Mutable.
  const representations = { 'text/plain': text, 'text/html': `<div data-mutable-fragment="${encode(json)}"><pre><span>${escape(text)}</span></pre></div>`, [NATIVE_MIME]: json };
  if (Object.values(representations).reduce((n, value) => n + new TextEncoder().encode(value).length, 0) > LIMITS.bytes) throw Error('Selection exceeds the clipboard transport limit. Copy a smaller selection; nothing was removed.');
  return representations;
}

/** AST parsing never creates DOM elements or initiates resource requests. Phase 1: text only. */
function htmlText(html: string): { text: string; carrier?: string } {
  // Phase 1's text fallback is deliberately conservative. Bound token expansion
  // before constructing the AST; complex external HTML can still use text/plain.
  let tags = 0, depth = 0;
  for (const match of html.matchAll(/<\s*(\/?)([a-z][\w:-]*)\b[^>]*>/gi)) {
    if (++tags > 20000) throw Error('Clipboard HTML has too many tags.');
    if (match[1]) depth = Math.max(0, depth - 1);
    else if (!['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(match[2].toLowerCase()) && !match[0].endsWith('/>')) depth++;
    if (depth > LIMITS.depth) throw Error('Clipboard HTML is too deeply nested.');
  }
  const tree = parseFragment(html); let carrier: string | undefined, count = 0;
  const walk = (node: any, depth: number): string => {
    if (++count > 200000 || depth > LIMITS.depth) throw Error('Clipboard HTML is too complex.');
    if (['script', 'style', 'iframe', 'object', 'embed', 'template'].includes(node.tagName)) return '';
    if (node.nodeName === '#text') return node.value;
    const marker = node.attrs?.find((a: any) => a.name === 'data-mutable-fragment')?.value;
    if (marker) { if (carrier) throw Error('Ambiguous Mutable HTML carrier.'); carrier = marker; }
    if (node.tagName === 'br') return '\n';
    const value = (node.childNodes ?? []).map((n: any) => walk(n, depth + 1)).join('');
    return value + (['p', 'li', 'h1', 'h2', 'h3', 'tr'].includes(node.tagName) ? '\n' : '');
  };
  return { text: walk(tree, 0), carrier };
}

export function importClipboard(data: ClipboardRepresentations, plain = false): { fragment?: MutableFragment; notice?: string } {
  if (Object.values(data).reduce((n, s) => n + new TextEncoder().encode(s).length, 0) > LIMITS.bytes) throw Error('Clipboard exceeds the size limit.');
  const warnings: string[] = [];
  if (!plain && data[NATIVE_MIME]) {
    try { return { fragment: validateFragment(JSON.parse(data[NATIVE_MIME])) }; }
    catch { warnings.push('Native clipboard data was invalid or unsupported; used its text fallback.'); }
  }
  let html: ReturnType<typeof htmlText> | undefined;
  if (data['text/html'] && (!plain || data['text/plain'] === undefined)) {
    try {
      html = htmlText(data['text/html']);
      if (!plain && html.carrier) {
        const fragment = validateFragment(JSON.parse(decode(html.carrier)));
        // Exact projection comparison detects carriers retained after external text edits.
        if (fragmentText(fragment) === html.text && (!data['text/plain'] || data['text/plain'] === html.text)) return { fragment };
        warnings.push('The HTML carrier no longer matches the visible content; used text.');
      }
    } catch { warnings.push('Could not recover native formatting from HTML.'); }
  }
  if (!plain && data['application/json']) {
    try {
      const legacy = JSON.parse(data['application/json']);
      if (legacy?.source === 'codex' && legacy.format === 'standoff-inline-v1' && Array.isArray(legacy.data)) {
        const f = emptyFragment();
        legacy.data.forEach((atoms: any[], i: number) => {
          if (!Array.isArray(atoms)) throw Error('Invalid legacy clipboard.');
          const block = plainFragment(''); const b = block.blocks[0]; b.localId = `b${i}`;
          b.inline!.atoms = atoms.map((a, j) => {
            if (a?.kind === 'text' && typeof a.text === 'string') return { kind: 'text', text: a.text };
            if (a?.kind !== 'image') throw Error('Invalid legacy atom.');
            const embed = `i${i}-${j}`; f.embeds.push({ localId: embed, type: 'image-cell', data: a }); return { kind: 'embed', embed };
          });
          f.blocks.push(b); f.placements.push({ localId: `e${i}`, kind: 'owned', target: { kind: 'local', object: 'block', id: b.localId } });
          f.roots.push({ ...block.roots[0], placement: `e${i}`, ...(i < legacy.data.length - 1 ? { separatorAfter: 'selection-gap' } : {}) });
        });
        return { fragment: validateFragment(f), notice: 'Imported legacy inline clipboard; unavailable annotations cannot be recovered.' };
      }
    } catch { warnings.push('Legacy clipboard data was invalid; used text.'); }
  }
  const text = data['text/plain'] ?? html?.text;
  if (!text) return { notice: 'Clipboard contains no supported text; the selection was left unchanged.' };
  if (!plain && data['text/html'] && !warnings.length) warnings.push('Pasted text. External rich HTML import is not enabled in Phase 1.');
  return { fragment: plainFragment(text), ...(warnings.length ? { notice: warnings.join(' ') } : {}) };
}

export function captureClipboard(data: DataTransfer | null): ClipboardRepresentations {
  const result: ClipboardRepresentations = {}; if (!data) throw Error('The browser did not provide clipboard access.');
  for (const type of [NATIVE_MIME, 'text/plain', 'text/html', 'application/json']) if (data.types.includes(type)) result[type] = data.getData(type);
  return result;
}
export function writeEventClipboard(data: DataTransfer | null, representations: ClipboardRepresentations) {
  if (!data) throw Error('Clipboard access failed; nothing was removed.');
  data.setData('text/plain', representations['text/plain']);
  data.setData('text/html', representations['text/html']);
  try { data.setData(NATIVE_MIME, representations[NATIVE_MIME]); } catch { /* HTML carrier remains the native fallback. */ }
}
export function canWriteAsync() { return typeof navigator !== 'undefined' && !!navigator.clipboard?.write && typeof ClipboardItem !== 'undefined'; }
export async function writeAsyncClipboard(representations: ClipboardRepresentations) {
  const data: Record<string, Blob> = { 'text/plain': new Blob([representations['text/plain']], { type: 'text/plain' }), 'text/html': new Blob([representations['text/html']], { type: 'text/html' }) };
  const custom = `web ${NATIVE_MIME}`;
  if (ClipboardItem.supports?.(custom)) data[custom] = new Blob([representations[NATIVE_MIME]], { type: NATIVE_MIME });
  await navigator.clipboard.write([new ClipboardItem(data)]);
}
export async function readAsyncClipboard(): Promise<ClipboardRepresentations> {
  if (!navigator.clipboard?.read) throw Error('Use Command/Control-V to paste with this browser.');
  const items = await navigator.clipboard.read(), out: ClipboardRepresentations = {};
  for (const item of items) for (const name of [NATIVE_MIME, `web ${NATIVE_MIME}`, 'text/plain', 'text/html']) if (item.types.includes(name) && !out[name.replace(/^web /, '')]) {
    const blob = await item.getType(name); if (blob.size > LIMITS.bytes) throw Error('Clipboard exceeds the size limit.');
    out[name.replace(/^web /, '')] = await blob.text();
  }
  return out;
}
