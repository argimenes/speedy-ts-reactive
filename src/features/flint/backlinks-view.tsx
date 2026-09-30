import { For, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import type { ApplicationBacklinks, BacklinksQuery, BacklinksResult } from '../../feature-api/backlinks';

/** The UI knows only semantic mentions, query scope, freshness and the host navigation action. */
export function BacklinksPanel(props: { backlinks: ApplicationBacklinks }) {
  const api = props.backlinks;
  const target = createMemo(() => api.target(), undefined, {equals: (a,b) => JSON.stringify(a) === JSON.stringify(b)});
  const [result, setResult] = createSignal<BacklinksResult>(), [pending, setPending] = createSignal(false);
  const [stale, setStale] = createSignal(true), [error, setError] = createSignal(''), [following, setFollowing] = createSignal(false);
  let request = 0, live = true, controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const navigation = new AbortController();
  const run = async (query: BacklinksQuery) => {
    const generation = ++request; controller?.abort(); controller = new AbortController();
    setPending(true); setStale(true); setError('');
    try { const next = await api.service.query(query, controller.signal); if (live && generation === request) { setResult(next); setStale(!api.service.current(next)); } }
    catch (e) { if (live && generation === request) setError((e as Error).name === 'AbortError' ? 'Backlinks query cancelled.' : String(e)); }
    finally { if (live && generation === request) setPending(false); }
  };
  const schedule = () => {
    setStale(true); request++; controller?.abort(); clearTimeout(timer); setPending(false);
    const query = untrack(target); if (query) timer = setTimeout(() => void run(query), 150);
  };
  const stop = api.service.subscribe(schedule);
  createEffect(() => { const query = target(); untrack(() => { clearTimeout(timer); request++; controller?.abort(); setResult(undefined); setError(''); setPending(false); setStale(true); if (query) void run(query); }); });
  onCleanup(() => { live = false; request++; clearTimeout(timer); controller?.abort(); navigation.abort(); stop(); });
  return <section class="flint-backlinks" aria-label="Document backlinks">
    <h2>Backlinks</h2>
    <Show when={target()} fallback={<p>Open a Document in this vault to view backlinks.</p>}>
      <button onClick={() => { clearTimeout(timer); const query = target(); if (query) void run(query); }}>Refresh backlinks</button>
      <Show when={pending()}><p role="status">Finding native references…</p><button onClick={() => { request++; controller?.abort(); clearTimeout(timer); setPending(false); setStale(true); setError('Backlinks query cancelled.'); }}>Cancel backlinks query</button></Show>
      <Show when={result()}>{value => <>
        <p role="status">{value().mentions.length} backlinks to {value().target.title} · {value().coverage.available}/{value().coverage.discovered} Documents available. {value().coverage.complete ? 'Loaded vault coverage complete.' : 'Incomplete coverage; other resources may contain backlinks.'}</p>
        <Show when={stale() || !api.service.current(value())}><p role="status">Backlinks are stale; refreshing or manual refresh is required.</p></Show>
        <For each={value().coverage.diagnostics}>{message => <p>{message}</p>}</For>
        <For each={value().mentions}>{mention => <button class="flint-backlink" data-backlink-source={mention.source.documentId} disabled={following() || stale() || !api.service.current(value())} onClick={async () => {
          setFollowing(true); setError(''); try { await api.follow(value(), mention, navigation.signal); } catch (e) { if (live) setError(String(e)); } finally { if (live) setFollowing(false); }
        }}><strong>{mention.source.title}</strong><small>{mention.source.location} · {mention.source.documentId}</small><span>{mention.snippet}</span></button>}</For>
        <Show when={!value().mentions.length}><p>No backlinks found in the inspected loaded content.</p></Show>
      </>}</Show>
    </Show>
    <Show when={error()}><p role="status">{error()}</p></Show>
  </section>;
}
export function BacklinksView(props: { backlinks: ApplicationBacklinks }) {
  const [open, setOpen] = createSignal(false);
  return <div><button aria-expanded={open()} onClick={() => setOpen(!open())}>{open() ? 'Close backlinks' : 'Show backlinks'}</button><Show when={open()}><BacklinksPanel backlinks={props.backlinks}/></Show></div>;
}
