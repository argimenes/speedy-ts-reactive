import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { gfmTable } from 'micromark-extension-gfm-table';
import type { Definition, Nodes } from 'mdast';
import { LIMITS } from './fragment';
import type { HtmlNode } from './html-ast';
import { importSemanticHtml } from './html-import';

const text = (value: string): HtmlNode => ({ nodeName: '#text', value });
const element = (tagName: string, childNodes: HtmlNode[] = [], attrs: Record<string, string> = {}): HtmlNode => ({
  nodeName: tagName, tagName, childNodes, attrs: Object.entries(attrs).map(([name, value]) => ({ name, value })),
});

/** CommonMark + GFM tables. The intermediate nodes are data, never DOM or HTML markup.
 * Reuse HTML's semantic policy, then the ordinary fragment materializer/insertion path.
 * Raw HTML is literal text; nothing here resolves URLs, fetches assets or executes code.
 */
export function markdownTree(source: string) {
  // Bound parser input as well as its output. Runtime Markdown preparation runs in
  // the existing cancellable worker, even for small input.
  if ([...source].length > LIMITS.cells || new TextEncoder().encode(source).length > LIMITS.bytes) throw Error('Markdown exceeds the import size limit.');
  const tree = fromMarkdown(source, { extensions: [gfmTable()], mdastExtensions: [gfmTableFromMarkdown()] });
  const definitions = new Map<string, Definition>(), warnings = new Set<string>();
  const codeMetadata: Array<{ language?: string; meta?: string }> = [];
  const stack: Array<{ node: Nodes; depth: number }> = [{ node: tree, depth: 0 }];
  let count = 0;
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (++count > LIMITS.cells || depth > LIMITS.depth / 2) throw Error('Markdown is too deeply nested or complex.');
    if (node.type === 'definition' && !definitions.has(node.identifier)) definitions.set(node.identifier, node);
    // Reverse push preserves authored order and CommonMark's first-definition rule.
    if ('children' in node) for (let i = node.children.length - 1; i >= 0; i--) stack.push({ node: node.children[i], depth: depth + 1 });
  }
  const children = (node: Nodes): HtmlNode[] => 'children' in node ? node.children.flatMap(convert) : [];
  const link = (node: Nodes, url: string, title?: string | null) => element('a', children(node), { href: url, ...(title ? { title } : {}) });
  const image = (alt: string | null | undefined, url: string, title?: string | null) => element('img', [], { src: url, alt: alt ?? '', ...(title ? { title } : {}) });
  function convert(node: Nodes): HtmlNode[] {
    switch (node.type) {
      case 'root': return children(node);
      case 'text': return [text(node.value)];
      case 'paragraph': return [element('p', children(node))];
      case 'heading': return [element(`h${node.depth}`, children(node))];
      case 'strong': return [element('strong', children(node))];
      case 'emphasis': return [element('em', children(node))];
      case 'break': return [element('br')];
      case 'inlineCode': return [element('code', [text(node.value)])];
      case 'code':
        codeMetadata.push({ ...(node.lang ? { language: node.lang } : {}), ...(node.meta ? { meta: node.meta } : {}) });
        return [element('pre', [text(node.value)])];
      case 'blockquote': return [element('blockquote', children(node))];
      case 'list': return [element(node.ordered ? 'ol' : 'ul', children(node), node.ordered ? { start: String(node.start ?? 1) } : {})];
      case 'listItem': return [element('li', children(node))];
      case 'link': return [link(node, node.url, node.title)];
      case 'image': return [image(node.alt, node.url, node.title)];
      case 'linkReference': case 'imageReference': {
        const definition = definitions.get(node.identifier);
        if (!definition) return node.type === 'imageReference' ? [text(node.alt ?? '')] : children(node);
        return [node.type === 'imageReference' ? image(node.alt, definition.url, definition.title) : link(node, definition.url, definition.title)];
      }
      case 'definition': return [];
      case 'table':
        if (node.align?.some(Boolean)) warnings.add('Table alignment was omitted; cell content was retained.');
        return [element('table', node.children.map((row, index) => element('tr', row.children.map(cell => element(index ? 'td' : 'th', children(cell))))))];
      case 'html':
        warnings.add('Raw Markdown HTML was retained as literal text.');
        return [text(node.value)];
      case 'thematicBreak': return [element('hr')];
      default:
        warnings.add('Unsupported Markdown syntax was retained as text.');
        return [text(source.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0))];
    }
  }
  return { tree: { nodeName: '#document-fragment', childNodes: convert(tree) } as HtmlNode, codeMetadata, warnings };
}
export function importMarkdown(source: string) {
  const {tree,codeMetadata,warnings}=markdownTree(source);
  const imported = importSemanticHtml(tree);
  let codeIndex = 0;
  for (const block of imported.fragment?.blocks ?? []) {
    const metadata = block.data.metadata as Record<string, unknown> | undefined;
    if (metadata?.htmlPreformatted) block.data.metadata = { ...metadata, markdownCode: codeMetadata[codeIndex++] };
  }
  if (!imported.fragment) warnings.add('Markdown contains no insertable content; the selection was left unchanged.');
  return { ...imported, ...((warnings.size || imported.notice) ? { notice: [...warnings, imported.notice].filter(Boolean).join(' ') } : {}) };
}
