import { createSignal, For, Show, onCleanup } from 'solid-js';
import { useReactiveView } from '../reactive-editor/context';
import { entityService } from '../application/entity-service';
import type { EntityCandidate } from '../feature-api/entities';
import { HttpApplicationServices } from '../runtime/application-services';
export function AcademicIdentityReview(props: {
  ownerKey: string;
  jobId: string;
  title: string;
  family: string;
}) {
  const { editor } = useReactiveView(),
    [query, setQuery] = createSignal(''),
    [matches, setMatches] = createSignal<EntityCandidate[]>([]),
    [target, setTarget] = createSignal(''),
    [name, setName] = createSignal(props.title),
    [newEntity, setNew] = createSignal(false),
    [note, setNote] = createSignal(''),
    [status, setStatus] = createSignal(''),
    [busy, setBusy] = createSignal(false);
  let entities: ReturnType<typeof entityService> | undefined;
  const c = new AbortController();
  onCleanup(() => {
    c.abort();
    entities?.dispose();
  });
  const api = new HttpApplicationServices(() => {
    const x = editor.readAssetContext();
    if (!x.cavernId || !x.session) throw Error('Open source Vault');
    return { cavernId: x.cavernId, session: x.session };
  });
  const run = async (fn: () => Promise<void>) => {
    if (busy()) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (!c.signal.aborted) setStatus(String(e));
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };
  return (
    <details>
      <summary>Review canonical identity</summary>
      <p>
        Explicitly accept this {props.family} identifier for an existing entity or create a reviewed{' '}
        {props.family === 'orcid'
          ? 'Person'
          : props.family === 'isbn'
            ? 'BookEdition'
            : 'ScholarlyWork'}
        . Names are never merged automatically. This changes canonical knowledge separately from
        document Undo; affiliations, works and cross-provider identifiers remain unreviewed.
      </p>
      <label>
        Find existing entity{' '}
        <input value={query()} onInput={(e) => setQuery(e.currentTarget.value)} />
      </label>
      <button
        disabled={busy() || !query().trim()}
        onClick={() =>
          void run(async () => {
            entities ??= entityService(editor, props.ownerKey);
            const r = await entities.search(
              { query: query(), stream: 'name', match: 'partial', scope: 'vault' },
              c.signal
            );
            r.current();
            setMatches(r.candidates);
          })
        }
      >
        Find entity
      </button>
      <For each={matches()}>
        {(m) => (
          <button
            onClick={() => {
              setTarget(m.id);
              setNew(false);
            }}
          >
            {m.name}
          </button>
        )}
      </For>
      <p>Selected entity: {target() || 'none'}</p>
      <label>
        <input
          type="checkbox"
          checked={newEntity()}
          onChange={(e) => setNew(e.currentTarget.checked)}
        />
        Create new reviewed entity
      </label>
      <Show when={newEntity()}>
        <label>
          Reviewed name{' '}
          <input value={name()} maxlength={1000} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
      </Show>
      <label>
        Review note{' '}
        <textarea value={note()} maxlength={4000} onInput={(e) => setNote(e.currentTarget.value)} />
      </label>
      <button
        disabled={busy() || !note().trim() || !(newEntity() ? name().trim() : target())}
        onClick={() =>
          void run(async () => {
            const r = await api.call(
              'deterministic.review',
              {
                id: props.jobId,
                operationId: crypto.randomUUID(),
                ...(newEntity() ? { name: name() } : { targetId: target() }),
                note: note(),
              },
              c.signal
            );
            const owner = editor.node(props.ownerKey);
            if (!c.signal.aborted && owner?.payload.academicJobId === props.jobId) {
              const properties = JSON.parse(JSON.stringify(owner.payload.blockProperties ?? []));
              if (
                !properties.some(
                  (p: any) =>
                    p.type === 'codex/entity-reference' && p.value === r.entityId && !p.isDeleted
                )
              )
                editor.commands.setPayloadField(props.ownerKey, 'blockProperties', [
                  ...properties,
                  {
                    id: crypto.randomUUID(),
                    type: 'codex/entity-reference',
                    value: r.entityId,
                    metadata: {
                      sourceSnapshotId: r.snapshotId,
                      origin: 'explicit-reviewed-identity',
                    },
                  },
                ]);
            }
            setStatus(
              'Accepted identity for entity ' +
                r.entityId +
                '. Existing facts were preserved. Document Undo removes only the document reference; canonical review remains recorded.'
            );
          })
        }
      >
        Accept reviewed identity
      </button>
      <p role="status">{status()}</p>
    </details>
  );
}
