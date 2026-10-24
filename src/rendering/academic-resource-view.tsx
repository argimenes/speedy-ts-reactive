import { ReverseInformation } from './reversible-surface';
import { academicDerivative } from '../academic/derivative';
import { AcademicPageBinding } from './academic-page-binding';
import { AcademicIdentityReview } from './academic-identity-review';
import { createMemo, createSignal, For, Show, onMount, onCleanup } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type { BlockViewProps } from '../block-tree/types';
import { useReactiveView } from '../reactive-editor/context';
import { academicCapture, type AcademicCapture, type AcademicProjection } from '../academic/model';
import { validAcademicAnchor, type AcademicAnchor } from '../academic/anchors';
import { exportBibliography } from '../academic/bibliography-export';
import { HttpApplicationServices } from '../runtime/application-services';
import { runInterchange } from '../runtime/interchange-worker';
import { materializeFragment } from '../interchange/materialize';
import { compileSourcePreview } from '../interchange/source-preview';
function download(bytes: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AcademicResourceView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView(),
    node = () => projection.state.nodes[props.nodeKey],
    capture = createMemo(() =>
      academicCapture(node()?.payload.academic)
        ? (node()!.payload.academic as unknown as AcademicCapture)
        : undefined
    );
  const [page, setPage] = createSignal(0),
    [selected, setSelected] = createSignal<number[]>([]),
    [status, setStatus] = createSignal(''),
    [loaded, setLoaded] = createSignal<AcademicProjection>(),
    [busy, setBusy] = createSignal(false),
    [note, setNote] = createSignal(''),
    [anchor, setAnchor] = createSignal<AcademicAnchor>(),
    [fragment, setFragment] = createSignal('');
  let root!: HTMLElement,
    alive = true;
  const controller = new AbortController();
  const api = new HttpApplicationServices(() => {
    const c = editor.readAssetContext();
    if (!c.cavernId || !c.session) throw Error('Open the source Vault');
    return { cavernId: c.cavernId, session: c.session };
  });
  const data = () => loaded() ?? capture()?.projection,
    ocr = () => data()?.pages?.[page()],
    chapter = () => data()?.chapters?.[page()];
  onMount(() =>
    onCleanup(
      editor.mounts.register(props.nodeKey, {
        root,
        focusElement: root,
        inputPolicy: 'opaque-widget',
        focus: () => root.focus(),
      })
    )
  );
  onCleanup(() => {
    alive = false;
    controller.abort();
  });
  const work = async (fn: () => Promise<void>) => {
    if (busy()) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (alive) setStatus(String(e));
    } finally {
      if (alive) setBusy(false);
    }
  };
  async function openOriginal() {
    const c = capture()!;
    return api.call('resources.original', { assetId: c.asset.assetId }, controller.signal);
  }
  async function loadBook() {
    const original = await openOriginal(),
      p = await runInterchange(
        { kind: 'academic-parse', bytes: original.bytes, format: 'epub' },
        controller.signal
      );
    if (alive) setLoaded(p);
  }
  const preview = createMemo(() => {
    const current = chapter();
    if (!current) return '';
    try {
      let html = compileSourcePreview(current.html, 'html').srcdoc;
      for (const [i, img] of (loaded()?.images ?? []).entries()) {
        const b = img.bytes;
        if (!b || !html.includes('[MUTABLE_EPUB_IMAGE_' + i + ']')) continue;
        let binary = '';
        for (const n of b) binary += String.fromCharCode(n);
        const uri = `data:${img.mediaType};base64,${btoa(binary)}`;
        html = html.replaceAll(
          '[MUTABLE_EPUB_IMAGE_' + i + ']',
          `<img style="max-width:100%" alt="Retained EPUB image" src="${uri}">`
        );
      }
      return html.replace("img-src 'none'", 'img-src data:');
    } catch {
      return '';
    }
  });
  function extract() {
    try {
      const f = academicDerivative(capture()!, page());
      const native = materializeFragment(JSON.parse(JSON.stringify(f)));
      editor.commands.insertFragment(
        native,
        { kind: 'after', anchorKey: node()!.placementKey },
        { commandId: 'academic.extract', subjects: [] }
      );
      setStatus(
        'Inserted editable derivative with immutable source alignment. Later edits do not rewrite that alignment. Undo removes the insertion; save explicitly.'
      );
    } catch (e) {
      setStatus(String(e));
    }
  }
  const annotations = () =>
    ((node()?.payload.blockProperties ?? []) as any[]).filter(
      (a) =>
        a.type === 'mutable/academic-annotation' &&
        !a.isDeleted &&
        validAcademicAnchor(a.anchor) &&
        a.anchor.snapshotId === capture()?.snapshotId
    );
  function addNote() {
    const a = anchor();
    if (!a || !validAcademicAnchor(a) || !note().trim()) return;
    const old = structuredClone(unwrap(node()!.payload.blockProperties ?? [])) as any[];
    editor.commands.setPayloadField(props.nodeKey, 'blockProperties', [
      ...old,
      {
        id: crypto.randomUUID(),
        type: 'mutable/academic-annotation',
        value: note().trim(),
        anchor: JSON.parse(JSON.stringify(a)),
      },
    ]);
    setNote('');
  }
  function exportSelected(format: 'bibtex' | 'ris') {
    try {
      const all = data()?.citations ?? [],
        r = exportBibliography(
          selected()
            .map((i) => all[i])
            .filter(Boolean),
          format
        );
      download(r.source, 'citations.' + (format === 'bibtex' ? 'bib' : 'ris'), 'text/plain');
      setStatus(r.diagnostics.join(' '));
    } catch (e) {
      setStatus(String(e));
    }
  }
  return (
    <section
      ref={root}
      tabindex="0"
      class="abstract-block mutable-academic-resource"
      data-runtime-key={props.nodeKey}
      data-client-id={props.nodeKey}
      style={{ padding: '12px', margin: '8px 0', border: '1px solid var(--flint-border,#ddd)' }}
    >
      <Show
        when={capture()}
        fallback={<p>Unsupported academic resource. Original data retained.</p>}
      >
        {(c) => (
          <>
            <h3>{c().projection.title}</h3>
            <ReverseInformation nodeKey={props.nodeKey}>            <small>{c().format} · retained source · unreviewed metadata</small>
            <details>
              <summary>Source and provenance</summary>
              <p>{c().source}</p>
              <p>
                Snapshot {c().snapshotId} · {c().retrievedAt}
              </p>
              <p>{c().asset.assetId}</p>
              <button
                disabled={busy()}
                onClick={() =>
                  void work(async () => {
                    const r = await openOriginal();
                    download(
                      r.bytes.slice().buffer,
                      'original.' +
                        ((
                          {
                            epub: 'epub',
                            alto: 'xml',
                            page: 'xml',
                            bibtex: 'bib',
                            ris: 'ris',
                            orcid: 'json',
                            isbn: 'json',
                            pmcid: 'json',
                            arxiv: 'xml',
                            pmid: 'xml',
                          } as Record<string, string>
                        )[c().format] ?? 'txt'),
                      r.mediaType
                    );
                  })
                }
              >
                Download retained original
              </button>
              <Show when={data()?.metadata}>
                <pre style={{ 'white-space': 'pre-wrap' }}>
                  {JSON.stringify(data()?.metadata, null, 2)}
                </pre>
              </Show>
              <For each={data()?.diagnostics}>{(d) => <p>{d}</p>}</For>
            </details></ReverseInformation>
            <Show when={node()?.payload.academicJobId && !node()?.payload.academicArchive}>
              <AcademicIdentityReview
                ownerKey={props.nodeKey}
                jobId={String(node()?.payload.academicJobId)}
                title={c().projection.title}
                family={c().format}
              />
            </Show>
            <Show when={data()?.person}>
              {(person) => (
                <>
                  <p>{person().name}</p>
                  <details>
                    <summary>Public affiliations, works and record dates (unreviewed)</summary>
                    <pre
                      style={{ 'white-space': 'pre-wrap', 'max-height': '400px', overflow: 'auto' }}
                    >
                      {JSON.stringify(person(), null, 2)}
                    </pre>
                  </details>
                </>
              )}
            </Show>
            <Show when={data()?.citations.length}>
              <button onClick={() => setSelected(data()!.citations.map((_, i) => i))}>
                Select all citations
              </button>
              <button onClick={() => exportSelected('bibtex')}>Export selected BibTeX</button>
              <button onClick={() => exportSelected('ris')}>Export selected RIS</button>
              <For each={data()?.citations}>
                {(record, index) => (
                  <article>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected().includes(index())}
                        onChange={(e) =>
                          setSelected((v) =>
                            e.currentTarget.checked
                              ? [...v, index()]
                              : v.filter((n) => n !== index())
                          )
                        }
                      />
                      {record.title}
                    </label>
                    <p>
                      {record.creators
                        .map((a) => a.literal ?? [a.given, a.family].filter(Boolean).join(' '))
                        .join('; ')}
                    </p>
                    <p>
                      {record.publisher} {record.venue} {record.dates?.publication}
                    </p>
                    <p style={{ 'white-space': 'pre-wrap' }}>{record.abstract}</p>
                    <details>
                      <summary>Identifiers and original fields</summary>
                      <pre
                        style={{
                          'white-space': 'pre-wrap',
                          'max-height': '300px',
                          overflow: 'auto',
                        }}
                      >
                        {JSON.stringify(
                          {
                            identifiers: record.identifiers,
                            fields: record.rawFields,
                            dates: record.dates,
                            rights: record.rights,
                          },
                          null,
                          2
                        )}
                      </pre>
                    </details>
                    <For
                      each={record.identifiers.filter(
                        (i) => i.namespace === 'pmc' || i.namespace === 'pmcid'
                      )}
                    >
                      {(id) => (
                        <button
                          disabled={!!node()?.payload.academicArchive}
                          onClick={() =>
                            void editor.interchange.importAcademicSource(props.nodeKey, id.key)
                          }
                        >
                          Inspect PMC metadata
                        </button>
                      )}
                    </For>
                    <For each={record.fullTextCandidates}>
                      {(url) => (
                        <button
                          disabled={busy() || !!node()?.payload.academicArchive}
                          onClick={() =>
                            void editor.interchange.inspectLinkedResource(props.nodeKey, url)
                          }
                        >
                          Inspect full-text candidate
                        </button>
                      )}
                    </For>
                  </article>
                )}
              </For>
            </Show>
            <Show when={data()?.pages || data()?.chapters}>
              <label>
                {data()?.pages ? 'Page' : 'Chapter'}{' '}
                <select
                  value={page()}
                  onChange={(e) => {
                    setPage(Number(e.currentTarget.value));
                    setAnchor(undefined);
                    setFragment('');
                  }}
                >
                  <For
                    each={data()?.pages?.map((p) => p.id) ?? data()?.chapters?.map((c) => c.title)}
                  >
                    {(title, i) => (
                      <option value={i()}>
                        {i() + 1}. {title}
                      </option>
                    )}
                  </For>
                </select>
              </label>
              <button onClick={extract}>Extract as editable Ink</button>
            </Show>
            <Show when={ocr()}>
              {(p) => (
                <>
                  <AcademicPageBinding
                    ownerKey={props.nodeKey}
                    page={p()}
                    snapshotId={c().snapshotId}
                  />
                  <p>
                    {p().width} × {p().height} {p().unit} · {p().order}
                  </p>
                  <svg
                    aria-label="OCR page geometry"
                    viewBox={`0 0 ${p().width} ${p().height}`}
                    style={{ width: '100%', 'max-height': '360px', background: '#eee' }}
                  >
                    <For each={p().lines}>
                      {(l) => (
                        <polygon
                          points={l.points.map((p) => p.join(',')).join(' ')}
                          fill="rgba(128,0,128,.12)"
                          stroke="purple"
                          stroke-width="1"
                          tabindex="0"
                          role="button"
                          aria-label={l.text.slice(0, 100) || 'OCR line'}
                          onClick={() =>
                            setAnchor({
                              version: 1,
                              kind: 'ocr-page',
                              snapshotId: c().snapshotId,
                              pageId: p().id,
                              width: p().width,
                              height: p().height,
                              points: l.points,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')
                              setAnchor({
                                version: 1,
                                kind: 'ocr-page',
                                snapshotId: c().snapshotId,
                                pageId: p().id,
                                width: p().width,
                                height: p().height,
                                points: l.points,
                              });
                          }}
                        />
                      )}
                    </For>
                    <For
                      each={annotations().filter(
                        (a) => a.anchor.kind === 'ocr-page' && a.anchor.pageId === p().id
                      )}
                    >
                      {(a) => (
                        <polygon
                          points={a.anchor.points.map((p: number[]) => p.join(',')).join(' ')}
                          fill="rgba(255,200,0,.3)"
                          stroke="#997000"
                        >
                          <title>{a.value}</title>
                        </polygon>
                      )}
                    </For>
                  </svg>
                  <pre
                    style={{ 'white-space': 'pre-wrap', 'max-height': '400px', overflow: 'auto' }}
                  >
                    {p().text}
                  </pre>
                </>
              )}
            </Show>
            <Show when={chapter()}>
              {(ch) => (
                <>
                  <button disabled={busy()} onClick={() => void work(loadBook)}>
                    Load retained chapter images
                  </button>
                  <iframe
                    title="Safe EPUB chapter"
                    sandbox=""
                    referrerpolicy="no-referrer"
                    srcdoc={preview()}
                    style={{ width: '100%', height: '500px', border: '0' }}
                  />
                  <details>
                    <summary>Chapter navigation</summary>
                    <For each={data()?.navigation}>
                      {(n) => (
                        <button
                          onClick={() => {
                            const [path, id] = n.href.split('#'),
                              i = data()!.chapters!.findIndex((c) => c.path === path);
                            if (i < 0) {
                              setStatus('Target is outside the supported spine');
                              return;
                            }
                            setPage(i);
                            setFragment(id ?? '');
                            setStatus(
                              'Opened chapter; source fragment ' + (id ?? '(chapter start)')
                            );
                          }}
                        >
                          {n.label}
                        </button>
                      )}
                    </For>
                  </details>
                  <label>
                    Source fragment{' '}
                    <select value={fragment()} onChange={(e) => setFragment(e.currentTarget.value)}>
                      <option value="">Whole chapter</option>
                      <For each={ch().anchors}>{(a) => <option>{a}</option>}</For>
                    </select>
                  </label>
                  <button
                    onClick={() =>
                      setAnchor({
                        version: 1,
                        kind: 'epub-fragment',
                        snapshotId: c().snapshotId,
                        path: ch().path,
                        fragment: fragment(),
                      })
                    }
                  >
                    Annotate chapter / fragment
                  </button>
                </>
              )}
            </Show>
            <Show when={anchor()}>
              <label>
                Source note{' '}
                <input
                  value={note()}
                  maxlength={4000}
                  onInput={(e) => setNote(e.currentTarget.value)}
                />
              </label>
              <button disabled={!note().trim()} onClick={addNote}>
                Add source annotation
              </button>
            </Show>
            <For each={annotations()}>
              {(a) => (
                <p>
                  {a.value}{' '}
                  <button
                    onClick={() =>
                      editor.commands.setPayloadField(
                        props.nodeKey,
                        'blockProperties',
                        (
                          structuredClone(unwrap(node()!.payload.blockProperties ?? [])) as any[]
                        ).filter((p: any) => p.id !== a.id)
                      )
                    }
                  >
                    Delete source annotation
                  </button>
                </p>
              )}
            </For>
          </>
        )}
      </Show>
      <p role="status">{status()}</p>
    </section>
  );
}
