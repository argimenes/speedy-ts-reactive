import { xml, child, children, descendants, text, value, type XmlNode } from './xml';
import type { AcademicProjection, OcrPage, OcrLine, OcrWord } from './model';
function positive(s: string, label: string) {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > 1e7) throw Error('Invalid ' + label);
  return n;
}
function points(n: XmlNode, alto: boolean): number[][] {
  if (alto) {
    const a = n.attrs;
    if (a.WIDTH === undefined || a.HEIGHT === undefined) return [];
    const x = Number(a.HPOS),
      y = Number(a.VPOS),
      w = Number(a.WIDTH),
      h = Number(a.HEIGHT);
    if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w < 0 || h < 0)
      throw Error('Invalid ALTO box');
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
  }
  const s = child(n, 'Coords')?.attrs.points;
  if (!s) return [];
  const p = s
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number));
  if (
    p.length < 3 ||
    p.length > 1000 ||
    p.some((v) => v.length !== 2 || v.some((n) => !Number.isFinite(n) || n < 0))
  )
    throw Error('Invalid PAGE polygon');
  return p;
}
const confidence = (s: string | undefined) => {
  if (s === undefined) return;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw Error('Invalid OCR confidence');
  return n;
};
const pageText = (n: XmlNode) => {
  const alternatives = children(n, 'TextEquiv').sort(
    (a, b) => Number(a.attrs.index ?? 0) - Number(b.attrs.index ?? 0)
  );
  return {
    text: value(alternatives[0], 'Unicode') || value(alternatives[0], 'PlainText'),
    confidence: confidence(alternatives[0]?.attrs.conf),
  };
};
export function parseOcr(source: string): AcademicProjection {
  const root = xml(source),
    alto =
      root.name === 'alto' &&
      /^https?:\/\/www.loc.gov\/standards\/alto\/ns-v[234]#$/.test(root.uri),
    page =
      root.name === 'PcGts' &&
      /^https?:\/\/schema.primaresearch.org\/PAGE\/gts\/pagecontent\/\d{4}-\d{2}-\d{2}$/.test(
        root.uri
      );
  if (!alto && !page)
    throw Error('Expected recognised ALTO or PAGE XML namespace (TEI is not supported)');
  const diagnostics: string[] = [],
    pages: OcrPage[] = [];
  const pageNodes = descendants(root, 'Page');
  if (!pageNodes.length || pageNodes.length > 200) throw Error('OCR page count limit');
  const unit = alto ? text(descendants(root, 'MeasurementUnit')[0]).trim() : 'pixel';
  if (alto && !['pixel', 'mm10', 'inch1200'].includes(unit))
    throw Error('Unsupported ALTO measurement unit');
  for (const [pi, p] of pageNodes.entries()) {
    const width = positive(p.attrs[alto ? 'WIDTH' : 'imageWidth'], 'page width'),
      height = positive(p.attrs[alto ? 'HEIGHT' : 'imageHeight'], 'page height');
    const regionName = alto ? 'TextBlock' : 'TextRegion',
      regions = descendants(p, regionName),
      ids = new Set<string>();
    for (const r of regions) {
      const id = r.attrs.ID ?? r.attrs.id;
      if (!id || ids.has(id)) throw Error('Missing/duplicate OCR region ID');
      ids.add(id);
    }
    const ordering = descendants(root, 'ReadingOrder')
      .flatMap((ro) => [...descendants(ro, 'RegionRefIndexed'), ...descendants(ro, 'ElementRef')])
      .filter((n) => ids.has(n.attrs.regionRef ?? n.attrs.REF ?? n.attrs.ELEMENTREF));
    const explicit =
      ordering.length === regions.length &&
      new Set(ordering.map((n) => n.attrs.regionRef ?? n.attrs.REF ?? n.attrs.ELEMENTREF)).size ===
        regions.length &&
      ordering.every((n) => n.name === 'ElementRef' || /^\d+$/.test(n.attrs.index ?? ''));
    const nested =
      descendants(root, 'OrderedGroup').some((g) => descendants(g, 'OrderedGroup').length > 1) ||
      descendants(root, 'OrderedGroupIndexed').length > 0;
    const useOrder = explicit && !nested;
    if (nested)
      diagnostics.push(
        'Nested reading-order groups are retained but not flattened; source order is shown.'
      );
    const ordered = useOrder
      ? [...ordering]
          .sort((a, b) => Number(a.attrs.index ?? 0) - Number(b.attrs.index ?? 0))
          .map(
            (n) =>
              regions.find(
                (r) =>
                  (r.attrs.ID ?? r.attrs.id) ===
                  (n.attrs.regionRef ?? n.attrs.REF ?? n.attrs.ELEMENTREF)
              )!
          )
      : regions;
    if (!useOrder)
      diagnostics.push(
        `Page ${pi + 1}: complete explicit reading order unavailable; displaying source order, which may not be reading order.`
      );
    const result: OcrPage = {
      id: p.attrs.ID ?? p.attrs.id ?? 'page-' + pi,
      width,
      height,
      unit: unit || 'pixel',
      image: p.attrs.imageFilename ?? text(descendants(root, 'fileName')[0]),
      text: '',
      regions: regions.map((r) => ({
        id: r.attrs.ID ?? r.attrs.id,
        points: points(r, alto),
        lineIds: descendants(r, 'TextLine').map((l) => l.attrs.ID ?? l.attrs.id),
      })),
      lines: [],
      order: useOrder ? 'explicit' : 'source-order',
      rawOrder: ordering.map((n) => n.attrs.regionRef ?? n.attrs.REF ?? n.attrs.ELEMENTREF),
    };
    if (result.regions?.some((r) => r.points.some(([x, y]) => x > width || y > height)))
      throw Error('OCR region coordinates exceed page');
    let pageOffset = 0;
    for (const region of ordered)
      for (const [li, line] of descendants(region, 'TextLine').entries()) {
        const start = pageOffset,
          words: OcrWord[] = [],
          lineText = alto ? '' : pageText(line).text;
        let assembled = '';
        const wordNodes = alto
          ? line.children.filter((n) => ['String', 'SP', 'HYP'].includes(n.name))
          : children(line, 'Word');
        for (const [wi, w] of wordNodes.entries()) {
          if (w.name === 'SP') {
            assembled += ' ';
            continue;
          }
          if (w.name === 'HYP') {
            assembled += w.attrs.CONTENT ?? '-';
            continue;
          }
          if (assembled && !alto) assembled += ' ';
          const data = alto
              ? { text: w.attrs.CONTENT ?? '', confidence: confidence(w.attrs.WC) }
              : pageText(w),
            offset = [...assembled].length;
          words.push({
            id:
              w.attrs.ID ?? w.attrs.id ?? `${pi}-${region.attrs.ID ?? region.attrs.id}-${li}-${wi}`,
            text: data.text,
            points: points(w, alto),
            confidence: data.confidence,
            start: start + offset,
            end: start + offset + [...data.text].length,
          });
          assembled += data.text;
        }
        const content = lineText || assembled;
        if (lineText && assembled && lineText !== assembled) {
          diagnostics.push(
            `Line ${line.attrs.id}: line text differs from word text; word offsets are unavailable.`
          );
          words.forEach((w) => {
            w.start = -1;
            w.end = -1;
          });
        }
        const l: OcrLine = {
          ...(!alto ? { confidence: pageText(line).confidence } : {}),
          regionId: region.attrs.ID ?? region.attrs.id,
          id: line.attrs.ID ?? line.attrs.id ?? `${pi}-${region.attrs.ID ?? region.attrs.id}-${li}`,
          text: content,
          words,
          points: points(line, alto),
          start,
          end: start + [...content].length,
        };
        for (const points of [l.points, ...words.map((w) => w.points)])
          if (points.some(([x, y]) => x > width || y > height))
            throw Error('OCR coordinates exceed source page');
        result.lines.push(l);
        result.text += content + '\n';
        pageOffset = l.end + 1;
      }
    if (result.lines.length > 10000) throw Error('OCR line count limit');
    pages.push(result);
  }
  diagnostics.push(
    'Source XML is authoritative. Non-text regions, glyph alternatives and dialect extensions remain in the original. Image/canvas association is explicit; no image is fetched from XML.'
  );
  return {
    version: 1,
    kind: alto ? 'alto' : 'page',
    title: `${pages.length} OCR pages`,
    citations: [],
    pages,
    diagnostics,
  };
}
