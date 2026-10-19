import { SaxesParser } from 'saxes';
export interface XmlNode {
  name: string;
  uri: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  parts: Array<string | XmlNode>;
}
export function xml(
  source: string,
  { bytes = 8 * 1024 * 1024, nodes = 100000, depth = 64, text = 1000000 } = {}
) {
  if (new TextEncoder().encode(source).length > bytes || /<!\s*(?:DOCTYPE|ENTITY)/i.test(source))
    throw Error('XML size, DTD or entity declaration is not allowed');
  const parser = new SaxesParser({ xmlns: true }),
    stack: XmlNode[] = [];
  let root: XmlNode | undefined,
    count = 0,
    chars = 0;
  parser.on('doctype', () => {
    throw Error('XML DTD disabled');
  });
  parser.on('error', (e) => {
    throw e;
  });
  parser.on('opentag', (tag) => {
    if (++count > nodes || stack.length >= depth) throw Error('XML node/depth limit');
    const node: XmlNode = {
      name: tag.local,
      uri: tag.uri,
      attrs: Object.fromEntries(Object.values(tag.attributes).map((a) => [a.name, a.value])),
      children: [],
      parts: [],
    };
    const parent = stack.at(-1);
    if (parent) {
      parent.children.push(node);
      parent.parts.push(node);
    } else root = node;
    stack.push(node);
  });
  const content = (value: string) => {
    if ((chars += value.length) > text) throw Error('XML text limit');
    stack.at(-1)?.parts.push(value);
  };
  parser.on('text', content);
  parser.on('cdata', content);
  parser.on('closetag', () => stack.pop());
  parser.write(source).close();
  if (!root) throw Error('Missing XML root');
  return root;
}
export const text = (n?: XmlNode): string =>
  n ? n.parts.map((v) => (typeof v === 'string' ? v : text(v))).join('') : '';
export const children = (n: XmlNode | undefined, name: string) =>
  n?.children.filter((c) => c.name === name) ?? [];
export const child = (n: XmlNode | undefined, name: string) => children(n, name)[0];
export function descendants(n: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  function walk(v: XmlNode) {
    if (v.name === name) out.push(v);
    v.children.forEach(walk);
  }
  walk(n);
  return out;
}
export const value = (n: XmlNode | undefined, name: string) => text(child(n, name)).trim();
