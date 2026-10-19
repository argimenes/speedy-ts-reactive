import { imageType } from '../interchange/package/image-validation';
import { unpackZip } from '../interchange/package/archive';
import { xml, descendants, child, text, type XmlNode } from './xml';
import { parse as htmlParse, serialize } from 'parse5';
import { compileHtmlPreview } from '../interchange/html-source-preview';
import type { AcademicProjection } from './model';
const decode = (b: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(b);
function path(name: string) {
  if (
    !name ||
    name.length > 500 ||
    /^[\/\\]|[\\\u0000-\u001f?#]/.test(name) ||
    name.split('/').some((p) => !p || p === '.' || p === '..') ||
    /%(?:2f|5c|2e)/i.test(name)
  )
    throw Error('Unsafe EPUB member path');
  return name;
}
export function epubPath(base: string, href: string) {
  if (/^[a-z][\w+.-]*:|^\/\//i.test(href) || href.startsWith('/'))
    throw Error('External EPUB reference is not admitted');
  const [raw, fragment] = href.split('#');
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw Error('Invalid EPUB path encoding');
  }
  if (!raw) return { path: path(base), fragment: fragment ?? '' };
  const parts = base.split('/').slice(0, -1);
  for (const p of decoded.split('/')) {
    if (p === '..') {
      if (!parts.length) throw Error('EPUB path escapes archive');
      parts.pop();
    } else if (p && p !== '.') parts.push(p);
  }
  return { path: path(parts.join('/')), fragment: fragment ?? '' };
}
export function parseEpub(bytes: Uint8Array): AcademicProjection {
  const files = unpackZip(bytes, {
    compressed: 32 * 1024 * 1024,
    expanded: 64 * 1024 * 1024,
    members: 1000,
    path,
  });
  if (
    decode(files.get('mimetype') ?? new Uint8Array()) !== 'application/epub+zip' ||
    [...files.keys()][0] !== 'mimetype'
  )
    throw Error('EPUB mimetype must be the first member');
  if (files.has('META-INF/encryption.xml') || files.has('META-INF/rights.xml'))
    throw Error('Encrypted/DRM EPUBs are not supported, including obfuscated fonts');
  const read = (p: string) => {
    const b = files.get(p);
    if (!b) throw Error('Missing EPUB member: ' + p);
    return decode(b);
  };
  const container = xml(read('META-INF/container.xml')),
    rootfiles = descendants(container, 'rootfile');
  if (container.uri !== 'urn:oasis:names:tc:opendocument:xmlns:container' || rootfiles.length !== 1)
    throw Error('Choose a single-rendition EPUB container');
  const opfPath = path(rootfiles[0].attrs['full-path']),
    opf = xml(read(opfPath));
  if (
    opf.name !== 'package' ||
    opf.uri !== 'http://www.idpf.org/2007/opf' ||
    !/^([23])\.\d+$/.test(opf.attrs.version)
  )
    throw Error('Unsupported EPUB package');
  const manifest = descendants(child(opf, 'manifest')!, 'item'),
    spine = descendants(child(opf, 'spine')!, 'itemref');
  if (!spine.length || spine.length > 200) throw Error('EPUB chapter limit');
  const entries = new Map<string, { node: XmlNode; path: string }>();
  for (const n of manifest) {
    if (entries.has(n.attrs.id)) throw Error('Duplicate EPUB manifest ID');
    if (/(?:scripted|remote-resources)/.test(n.attrs.properties ?? ''))
      throw Error('Active EPUB manifest item is not supported');
    entries.set(n.attrs.id, { node: n, path: epubPath(opfPath, n.attrs.href).path });
  }
  const diagnostics: string[] = [],
    chapters: NonNullable<AcademicProjection['chapters']> = [],
    images: NonNullable<AcademicProjection['images']> = [],
    navigation: Array<{ label: string; href: string }> = [];
  for (const { node, path: p } of entries.values())
    if (['image/png', 'image/jpeg'].includes(node.attrs['media-type'])) {
      const b = files.get(p);
      if (!b || b.length > 10 * 1024 * 1024) throw Error('EPUB image missing or oversized');
      if (imageType(b) !== node.attrs['media-type']) throw Error('EPUB image MIME mismatch');
      if (images.length >= 100) throw Error('EPUB image limit');
      images.push({ path: p, mediaType: node.attrs['media-type'], bytes: b });
    }
  for (const [i, item] of spine.entries()) {
    const e = entries.get(item.attrs.idref);
    if (!e || e.node.attrs['media-type'] !== 'application/xhtml+xml')
      throw Error('EPUB spine requires XHTML chapters');
    const chapterPath = e.path,
      source = read(chapterPath);
    if (source.length > 200000) throw Error('EPUB chapter exceeds text limit');
    const root = xml(
      source.replace(
        /<!DOCTYPE html(?: PUBLIC "[^"<>\[\]]*" "https?:\/\/www\.w3\.org\/[^"<>\[\]]*")?>/i,
        ''
      )
    );
    if (root.name !== 'html' || root.uri !== 'http://www.w3.org/1999/xhtml')
      throw Error('EPUB chapter is not XHTML');
    if (
      descendants(root, 'script').length ||
      descendants(root, 'iframe').length ||
      descendants(root, 'object').length
    )
      throw Error('Active EPUB chapter rejected');
    const anchors: string[] = [];
    function inspect(n: XmlNode) {
      if (n.attrs.id) {
        if (anchors.includes(n.attrs.id)) throw Error('Duplicate chapter fragment ID');
        anchors.push(n.attrs.id);
      }
      if (Object.keys(n.attrs).some((k) => /^on/i.test(k)))
        throw Error('EPUB event handlers are disabled');
      if (n.name === 'a' && n.attrs.href) {
        try {
          const ref = epubPath(chapterPath, n.attrs.href);
          navigation.push({
            label: text(n).slice(0, 200),
            href: ref.path + (ref.fragment ? '#' + ref.fragment : ''),
          });
        } catch {
          diagnostics.push(
            'External chapter link retained in original; network navigation disabled.'
          );
        }
      }
      n.children.forEach(inspect);
    }
    inspect(root);
    const body = child(root, 'body');
    if (!body) throw Error('Missing EPUB chapter body');
    const title = text(descendants(root, 'title')[0]).trim() || 'Chapter ' + (i + 1);
    const html = htmlParse(source) as any;
    function replaceImages(n: any) {
      if (n.tagName === 'img') {
        const src = n.attrs?.find((a: any) => a.name === 'src')?.value;
        let index = -1;
        try {
          index = images.findIndex((img) => img.path === epubPath(chapterPath, src ?? '').path);
        } catch {}
        n.tagName = 'span';
        n.nodeName = 'span';
        n.attrs = [];
        n.childNodes = [
          {
            nodeName: '#text',
            value:
              index >= 0 ? '[MUTABLE_EPUB_IMAGE_' + index + ']' : '[External or unsupported image]',
            parentNode: n,
          },
        ];
      }
      for (const c of n.childNodes ?? []) replaceImages(c);
    }
    replaceImages(html);
    const projected = compileHtmlPreview(serialize(html));
    chapters.push({ id: item.attrs.idref, path: e.path, title, html: projected.body, anchors });
    diagnostics.push(...projected.warnings);
  }
  // Navigation is an explicit table, never executable links inside a chapter frame.
  const nav = [...entries.values()].find((e) =>
    e.node.attrs.properties?.split(/\s+/).includes('nav')
  );
  if (nav) {
    const n = xml(read(nav.path).replace(/<!DOCTYPE html>/i, ''));
    for (const a of descendants(n, 'a'))
      if (a.attrs.href) {
        try {
          const ref = epubPath(nav.path, a.attrs.href);
          navigation.push({
            label: text(a).slice(0, 200),
            href: ref.path + (ref.fragment ? '#' + ref.fragment : ''),
          });
        } catch {
          diagnostics.push('External navigation link omitted.');
        }
      }
  }
  const ncx = entries.get(child(opf, 'spine')?.attrs.toc ?? '');
  if (ncx) {
    const n = xml(read(ncx.path));
    for (const p of descendants(n, 'navPoint')) {
      const src = child(p, 'content')?.attrs.src;
      if (src) {
        const ref = epubPath(ncx.path, src);
        navigation.push({
          label: text(child(p, 'navLabel')).trim(),
          href: ref.path + (ref.fragment ? '#' + ref.fragment : ''),
        });
      }
    }
  }
  if (navigation.length > 1000) throw Error('EPUB navigation limit');
  const title = text(descendants(opf, 'title')[0]).trim() || 'EPUB';
  const metadata =
    child(opf, 'metadata')?.children.map((n) => ({
      name: n.name,
      namespace: n.uri,
      value: text(n),
      attributes: n.attrs,
    })) ?? [];
  diagnostics.push(
    'Chapter anchors use immutable original + spine path + source fragment IDs. Reflow pixel positions are not persistent anchors. Styles are bounded; fonts, audio/video and external resources are not loaded.'
  );
  return {
    version: 1,
    kind: 'epub',
    title,
    metadata,
    citations: [],
    chapters,
    images,
    navigation,
    diagnostics: [...new Set(diagnostics)],
  };
}
