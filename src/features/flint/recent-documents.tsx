import { For, Show, createSignal } from 'solid-js';
import type { DocumentApplicationInstance } from '../../feature-api/document-application';

export function RecentDocuments(props: { recent: NonNullable<DocumentApplicationInstance['recentDocuments']> }) {
  const [busy, setBusy] = createSignal(false), [error, setError] = createSignal('');
  const open = async (id: string) => {
    if (busy()) return;
    setBusy(true); setError('');
    try { await props.recent.open(id); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const remove = (id: string) => {
    if (busy()) return;
    setError('');
    try { props.recent.remove(id); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return <details class="flint-recent-documents" open>
    <summary>Recently opened documents</summary>
    <Show when={props.recent.items().length} fallback={<p class="flint-hint">Documents you open will appear here.</p>}>
      <ol><For each={props.recent.items()}>{doc => <li><button type="button" class="flint-open-document" disabled={busy()} aria-label={`Reopen ${doc.title}`}
        title={doc.location ? `${doc.location.folder}/${doc.location.filename}` : doc.title} onClick={() => void open(doc.id)}>
        <span>{doc.title}</span><Show when={doc.location}><small>{doc.location!.folder === '.' ? doc.location!.filename : `${doc.location!.folder}/${doc.location!.filename}`}</small></Show>
      </button><button type="button" class="flint-recent-remove" disabled={busy()}
        aria-label={`Remove ${doc.title} from recently opened documents`} title="Remove from recently opened documents"
        onClick={() => remove(doc.id)}><span aria-hidden="true">×</span></button></li>}</For></ol>
    </Show>
    <Show when={error()}><p role="alert">{error()}</p></Show>
  </details>;
}
