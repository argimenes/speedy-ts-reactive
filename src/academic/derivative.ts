import { plainFragment } from '../interchange/serializer';
import { convertSource } from '../interchange/document-import';
import type { AcademicCapture } from './model';

/** Immutable source alignment; later native edits do not rewrite the captured ranges. */
export function academicDerivative(capture: AcademicCapture, index: number) {
  const page = capture.projection.pages?.[index];
  const chapter = capture.projection.chapters?.[index];
  const fragment = page
    ? plainFragment(page.text)
    : chapter
      ? convertSource(
          chapter.html.replace(
            /\[MUTABLE_EPUB_IMAGE_(\d+)\]/g,
            '[Image $1 retained in EPUB original]'
          ),
          'html'
        ).fragment
      : undefined;
  if (!fragment) throw Error('Choose a page or chapter');
  const provenance = {
    version: 1,
    sourceSnapshotId: capture.snapshotId,
    sourceAsset: capture.asset,
    sourceKind: capture.format,
    ...(page
      ? { pageId: page.id, unit: page.unit, width: page.width, height: page.height }
      : { chapterPath: chapter!.path, fragmentIds: chapter!.anchors }),
  };
  let offset = 0,
    lineIndex = 0;
  for (const block of fragment.blocks) {
    const end =
      offset +
      (block.inline?.atoms.reduce((n, a) => n + (a.kind === 'text' ? [...a.text].length : 1), 0) ??
        0);
    const runs = [];
    if (page) {
      while (lineIndex < page.lines.length && page.lines[lineIndex].end < offset) lineIndex++;
      for (let i = lineIndex; i < page.lines.length && page.lines[i].start <= end; i++) {
        const line = page.lines[i];
        if (line.end > offset || line.start === offset) runs.push(line);
      }
    }
    block.data.metadata = {
      ...((block.data.metadata as any) ?? {}),
      academicDerivative: {
        ...provenance,
        ...(page ? { sourceStart: offset, sourceEnd: end, runs } : {}),
      },
    };
    offset = end + 1;
  }
  return JSON.parse(JSON.stringify(fragment)) as typeof fragment;
}
