import { createSignal, For, Show, onCleanup } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { useReactiveView } from '../reactive-editor/context';
import { HttpApplicationServices } from '../runtime/application-services';
import { runInterchange } from '../runtime/interchange-worker';
import { managedAsset, type ManagedAssetReference } from '../interchange/managed-asset';
import type { OcrPage } from '../academic/model';
/** Explicit inspection of existing sources; never runs on a caret/text change. */
export function AcademicPageBinding(props: {
  ownerKey: string;
  page: OcrPage;
  snapshotId: string;
}) {
  const { editor, projection } = useReactiveView();
  const [choices, setChoices] = createSignal<
      Array<{ label: string; asset: ManagedAssetReference; iiif?: any }>
    >([]),
    [selected, setSelected] = createSignal(-1),
    [canvases, setCanvases] = createSignal<any[]>([]),
    [canvas, setCanvas] = createSignal(0),
    [status, setStatus] = createSignal(''),
    [busy, setBusy] = createSignal(false);
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  const node = () => projection.state.nodes[props.ownerKey];
  const api = new HttpApplicationServices(() => {
    const c = editor.readAssetContext();
    if (!c.cavernId || !c.session) throw Error('Open the source Vault');
    return { cavernId: c.cavernId, session: c.session };
  });
  function list() {
    const found = [];
    for (const c of Object.values(editor.repository.readState().contents)) {
      const p = c.payload,
        asset = managedAsset(p.asset),
        iiif = p.iiif as any;
      if (asset && ['image-cell', 'image-block'].includes(c.viewType))
        found.push({ label: String(p.alt ?? p.name ?? 'Retained image'), asset });
      if (iiif && managedAsset(iiif.asset))
        found.push({ label: String(iiif.label ?? 'IIIF source'), asset: iiif.asset, iiif });
    }
    setChoices(found.slice(0, 200));
    setStatus(
      found.length
        ? 'Choose an existing source, then inspect its retained geometry.'
        : 'No retained image or IIIF source in the open repository.'
    );
  }
  async function inspect() {
    const s = choices()[selected()];
    if (!s || busy()) return;
    setBusy(true);
    try {
      const r = await api.call(
        'resources.original',
        { assetId: s.asset.assetId },
        controller.signal
      );
      if (s.iiif) {
        const p = await runInterchange(
          { kind: 'resource-iiif', bytes: r.bytes },
          controller.signal
        );
        setCanvases(
          p.kind === 'manifest'
            ? p.canvases
            : [{ id: p.id, label: p.label, width: p.width, height: p.height }]
        );
      } else {
        if (!['image/png', 'image/jpeg'].includes(r.mediaType))
          throw Error('Choose a validated PNG/JPEG original');
        const bitmap = await createImageBitmap(
          new Blob([r.bytes.slice().buffer], { type: r.mediaType })
        );
        try {
          setCanvases([
            { id: s.asset.assetId, label: s.label, width: bitmap.width, height: bitmap.height },
          ]);
        } finally {
          bitmap.close();
        }
      }
      setCanvas(0);
      setStatus(
        'Review the page identity and geometry. Binding maps the whole OCR page to the whole selected image/canvas; cropped/rotated layouts require a different source.'
      );
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }
  function bind() {
    const s = choices()[selected()],
      c = canvases()[canvas()];
    if (!s || !c) return;
    const old = structuredClone(unwrap(node().payload.academicBindings ?? [])) as any[];
    const binding = {
      version: 1,
      sourceSnapshotId: props.snapshotId,
      pageId: props.page.id,
      asset: s.asset,
      kind: s.iiif ? 'iiif-canvas' : 'image',
      canvasId: c.id,
      canvasSnapshotId: s.iiif?.snapshotId,
      width: c.width,
      height: c.height,
      mapping: {
        kind: 'whole-page-scale',
        sourceWidth: props.page.width,
        sourceHeight: props.page.height,
        sourceUnit: props.page.unit,
        scaleX: c.width / props.page.width,
        scaleY: c.height / props.page.height,
      },
    };
    editor.commands.setPayloadField(
      props.ownerKey,
      'academicBindings',
      JSON.parse(JSON.stringify([...old.filter((b) => b.pageId !== props.page.id), binding]))
    );
    setStatus(
      'Explicit binding saved in the document. Undo removes it; source coordinates remain unchanged.'
    );
  }
  return (
    <details>
      <summary>Associate page with an existing image or IIIF canvas</summary>
      <button onClick={list}>List existing page sources</button>
      <Show when={choices().length}>
        <select
          aria-label="Existing page source"
          value={selected()}
          onChange={(e) => {
            setSelected(Number(e.currentTarget.value));
            setCanvases([]);
          }}
        >
          <option value="-1">Choose a retained source</option>
          <For each={choices()}>{(c, i) => <option value={i()}>{c.label}</option>}</For>
        </select>
        <button disabled={selected() < 0 || busy()} onClick={() => void inspect()}>
          Inspect retained geometry
        </button>
      </Show>
      <Show when={canvases().length}>
        <select
          aria-label="Source canvas"
          value={canvas()}
          onChange={(e) => setCanvas(Number(e.currentTarget.value))}
        >
          <For each={canvases()}>
            {(c, i) => (
              <option value={i()}>
                {c.label} · {c.width} × {c.height}
              </option>
            )}
          </For>
        </select>
        <button onClick={bind}>Confirm whole-page binding</button>
      </Show>
      <For each={(node()?.payload.academicBindings ?? []) as any[]}>
        {(b) => (
          <Show when={b.pageId === props.page.id}>
            <p>
              Bound to {b.canvasId} · {b.width} × {b.height}
            </p>
          </Show>
        )}
      </For>
      <p role="status">{status()}</p>
    </details>
  );
}
