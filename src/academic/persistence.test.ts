import { academicDerivative } from './derivative';
// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { prepareFiles } from '../interchange/document-import';
import { ReactiveEditor } from '../reactive-editor/editor';
import { projectSaved } from '../knowledge-sqlite/saved-projection';
import { captureNative, nativeBytes } from '../persistence/native-resource';
import { decodeBlockTree } from '../block-tree/codecs';
import { createPackage, openPackage, nativeInventory } from '../interchange/package/format';
import { packageFragment, materializePackage } from '../interchange/package/native';
import { academicBlock } from './block';
import { parseAcademic } from './parse';
import { storedProjection, ACADEMIC_BLOCK } from './model';
import { hash, packZip, unpackZip } from '../interchange/package/archive';
import { alto, page, epub } from './fixtures';
const data = {
    kind: 'mutable-package-data',
    version: 1,
    readOnly: true,
    encoding: 'sqlite-storage-class-v1',
    tables: [],
    provenance: {},
    selection: {},
    unresolved: [],
    excluded: [],
  } as any,
  schema = { kind: 'mutable-knowledge-schema', version: 1, tables: [] };
it('imports academic files through MutableFragment without undefined/non-JSON authored fields', async () => {
  for (const [name, source] of [
    ['a.bib', '@article{x,title={X},author={Smith, Jane}}'],
    ['a.ris', 'TY  - BOOK\nTI  - Book\nER  -'],
    ['a.alto', alto],
    ['a.page', page],
  ] as const) {
    const [p] = await prepareFiles([{ name, blob: new NodeBlob([source]) as unknown as Blob }]);
    expect(p.fragment.blocks[0].type).toBe(ACADEMIC_BLOCK);
  }
});
it('round-trips OCR/EPUB/bibliography originals across Vaults and preserves independent annotation identities', async () => {
  for (const [format, source, mediaType] of [
    ['alto', alto, 'application/xml'],
    ['page', page, 'application/xml'],
    ['epub', epub(), 'application/epub+zip'],
    ['bibtex', '@book{x,title={Book}}', 'application/x-bibtex'],
    ['ris', 'TY  - JOUR\nTI  - Paper\nER  -', 'application/x-research-info-systems'],
  ] as const) {
    const original = typeof source === 'string' ? new TextEncoder().encode(source) : source,
      asset = {
        kind: 'managed' as const,
        cavernId: 'source',
        assetId: 'sha256:' + (await hash(original)),
      },
      snapshotId = randomUUID(),
      capture = {
        version: 1 as const,
        kind: 'deterministic' as const,
        snapshotId,
        resourceId: asset.assetId,
        source: 'fixture',
        endpoint: 'local-file',
        retrievedAt: '2026-10-19T00:00:00Z',
        asset,
        format,
        projection: storedProjection(parseAcademic(original, format)),
      };
    const annotation = {
      id: randomUUID(),
      type: 'mutable/academic-annotation',
      value: 'Independent evidence',
      anchor:
        format === 'epub'
          ? {
              version: 1,
              kind: 'epub-fragment',
              snapshotId,
              path: 'book/chapter.xhtml',
              fragment: 'heading',
            }
          : {
              version: 1,
              kind: 'ocr-page',
              snapshotId,
              pageId: 'p',
              width: 800,
              height: 1000,
              points: [
                [10, 10],
                [110, 10],
                [110, 30],
              ],
            },
    };
    const doc = randomUUID(),
      dto = {
        id: doc,
        type: 'document-block',
        children: [
          {
            id: 'source-block',
            type: ACADEMIC_BLOCK,
            academic: JSON.parse(JSON.stringify(capture)),
            academicJobId: randomUUID(),
            blockProperties: [annotation],
          },
        ],
      },
      native = captureNative(decodeBlockTree(dto).state, doc);
    const archive = await createPackage(
        nativeBytes(native),
        { resourceId: doc, cavernId: 'source' },
        data,
        schema,
        [{ reference: asset, mediaType, bytes: original }]
      ),
      opened = await openPackage(archive);
    expect(Array.from(opened.assets[0].bytes)).toEqual(Array.from(original));
    const copy = materializePackage(packageFragment(opened.snapshot, 'source'), 'target', [], {
      data,
      schema,
      source: opened.manifest.source,
      assetBindings: [['source/' + asset.assetId, { ...asset, cavernId: 'target' }]],
    });
    const b = Object.values(copy.state.contents).find((c) => c.viewType === ACADEMIC_BLOCK)!;
    expect(b.payload.id).not.toBe('source-block');
    expect((b.payload.academic as any).asset.cavernId).toBe('target');
    expect(b.payload.academicArchive).toBe(true);
    expect(b.payload.academicJobId).toBeUndefined();
    expect((b.payload.blockProperties as any[])[0].id).not.toBe(annotation.id);
    expect((b.payload.blockProperties as any[])[0].anchor).toEqual(annotation.anchor);
    // Tampering with the projection while preserving the original must fail.
    const changed = JSON.parse(JSON.stringify(dto));
    changed.children[0].academic.projection.title = 'Fabricated title';
    await expect(
      createPackage(
        nativeBytes(captureNative(decodeBlockTree(changed).state, doc)),
        { resourceId: doc },
        data,
        schema,
        [{ reference: asset, mediaType, bytes: original }]
      )
    ).rejects.toThrow(/projection/);
  }
});
it('retains source annotations through save/index rebuild, deletion and exact undo; derivatives close over originals', async () => {
  const doc = randomUUID(),
    owner = randomUUID(),
    snapshotId = randomUUID(),
    asset = { kind: 'managed' as const, cavernId: 'source', assetId: 'sha256:' + 'a'.repeat(64) },
    note = {
      id: randomUUID(),
      type: 'mutable/academic-annotation',
      value: 'evidence',
      anchor: {
        version: 1,
        kind: 'ocr-page',
        snapshotId,
        pageId: 'p',
        width: 800,
        height: 1000,
        points: [
          [0, 0],
          [20, 0],
          [20, 20],
        ],
      },
    };
  const editor = new ReactiveEditor({
    id: doc,
    type: 'document-block',
    children: [
      { id: owner, type: ACADEMIC_BLOCK, blockProperties: [note] },
      {
        id: randomUUID(),
        type: 'standoff-editor-block',
        text: 'Derivative',
        metadata: { academicDerivative: { sourceSnapshotId: snapshotId, sourceAsset: asset } },
      },
    ],
  });
  try {
    const encoded = () => nativeBytes(captureNative(editor.repository.readState(), doc)),
      before = encoded(),
      saved = await projectSaved(before, randomUUID());
    expect(saved.blocks.find((b) => b.block.guid === owner).properties[0].authoredId).toBe(note.id);
    expect(nativeInventory(captureNative(editor.repository.readState(), doc)).assets).toEqual([
      asset,
    ]);
    const v = editor.createView('test'),
      n = Object.values(v.state.nodes).find((n) => n.payload.id === owner)!;
    editor.commands.setPayloadField(n.key, 'blockProperties', []);
    editor.repository.undo();
    expect(encoded()).toEqual(before);
    editor.repository.redo();
    expect(
      (await projectSaved(encoded(), randomUUID())).blocks.find((b) => b.block.guid === owner)
        .properties
    ).toHaveLength(0);
  } finally {
    editor.dispose();
  }
});

it('aligns multiple native paragraphs to a source line containing embedded newlines', () => {
  const projection = parseAcademic(
    new TextEncoder().encode(
      page.replace(
        '<Unicode>Word</Unicode></TextEquiv></TextLine>',
        '<Unicode>One\nTwo</Unicode></TextEquiv></TextLine>'
      )
    ),
    'page'
  );
  const f = academicDerivative(
    {
      snapshotId: 's',
      format: 'page',
      asset: { kind: 'managed', cavernId: 'v', assetId: 'sha256:' + 'a'.repeat(64) },
      projection,
    } as any,
    0
  );
  const ranges = f.blocks.map((b) => (b.data.metadata as any).academicDerivative);
  expect(ranges[0]).toMatchObject({ sourceStart: 0, sourceEnd: 3 });
  expect(ranges[1]).toMatchObject({ sourceStart: 4, sourceEnd: 7 });
  expect(ranges[0].runs[0].id).toBe(ranges[1].runs[0].id);
});
