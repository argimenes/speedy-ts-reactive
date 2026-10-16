import { parseFragment } from 'parse5';
import { LIMITS } from './fragment';

/** A deliberately small, data-only view of parse5's AST. Never a browser DOM. */
export interface HtmlNode {
  nodeName: string; tagName?: string; value?: string; namespaceURI?: string;
  attrs?: Array<{ name: string; value: string }>; childNodes?: HtmlNode[];
}
export const attribute = (node: HtmlNode, name: string) => node.attrs?.find(a => a.name === name)?.value;
export const activeTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'form', 'input', 'textarea', 'select', 'button', 'audio', 'video', 'canvas']);

/** Bound parsing and traversal; no DOM construction, URL resolution or fetching. */
export function parseClipboardHtml(html: string, readCarrier = true): { tree: HtmlNode; text: string; carrier?: string } {
  if (new TextEncoder().encode(html).length > LIMITS.bytes) throw Error('Clipboard HTML exceeds the size limit.');
  let tags = 0, depth = 0;
  for (const match of html.matchAll(/<\s*(\/?)([a-z][\w:-]*)\b[^>]*>/gi)) {
    if (++tags > 20000) throw Error('Clipboard HTML has too many tags.');
    if (match[1]) depth = Math.max(0, depth - 1);
    else if (!['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(match[2].toLowerCase()) && !match[0].endsWith('/>')) depth++;
    if (depth > LIMITS.depth) throw Error('Clipboard HTML is too deeply nested.');
  }
  const tree = parseFragment(html) as HtmlNode;
  let carrier: string | undefined, count = 0;
  const walk = (node: HtmlNode, depth: number): string => {
    if (++count > 200000 || depth > LIMITS.depth) throw Error('Clipboard HTML is too complex.');
    if (activeTags.has(node.tagName ?? '') || ['head', 'title'].includes(node.tagName ?? '')) return '';
    if (node.nodeName === '#text') return node.value ?? '';
    const marker = attribute(node, 'data-mutable-fragment');
    if (marker && readCarrier) { if (carrier) throw Error('Ambiguous Mutable HTML carrier.'); carrier = marker; }
    if (node.tagName === 'br') return '\n';
    const value = (node.childNodes ?? []).map(n => walk(n, depth + 1)).join('');
    return value + (['p', 'li', 'h1', 'h2', 'h3', 'tr'].includes(node.tagName ?? '') ? '\n' : '');
  };
  return { tree, text: walk(tree, 0), carrier };
}
