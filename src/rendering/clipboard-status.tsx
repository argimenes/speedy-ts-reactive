import { Show, For, createEffect, createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import type { MutableClipboard } from '../runtime/mutable-clipboard';

/** One editor-owned status surface; no document data or repository subscriptions. */
export function installClipboardStatus(document: Document, clipboard: MutableClipboard) {
  const [selected, setSelected] = createSignal<string[]>([]);
  const host = document.createElement('div'); document.body.appendChild(host);
  const dispose = render(() => {
    createEffect(() => setSelected(clipboard.imagePrompt()?.urls ?? []));
    return <Show when={clipboard.message()}><aside role="status" aria-live="polite" data-mutable-clipboard-status
    style={{ position: 'fixed', bottom: '12px', left: '50%', transform: 'translateX(-50%)', 'z-index': 10000, padding: '8px 12px', 'max-width': 'min(650px,90vw)', background: 'var(--flint-panel, #f7f5ef)', color: '#252525', border: '1px solid #aaa', 'border-radius': '4px', 'box-shadow': '0 2px 10px #0002', 'font-size': '13px' }}>
    <Show when={clipboard.imagePrompt()}>{prompt => <div data-mutable-image-consent role="dialog" aria-label="Clipboard images">
      <p>{prompt().error ?? `This paste contains ${prompt().urls.length} remote image(s). Download only the images you choose, or keep placeholders.`}</p>
      <div style={{ 'max-height': '180px', overflow: 'auto', 'overflow-wrap': 'anywhere' }}><For each={prompt().urls}>{url => <label style={{ display: 'block' }}><input type="checkbox" checked={selected().includes(url)} onChange={event => setSelected(values => event.currentTarget.checked ? [...values, url] : values.filter(v => v !== url))} />{url}</label>}</For></div>
      <button type="button" onClick={() => clipboard.chooseImages([])}>Keep placeholders</button>{' '}
      <Show when={prompt().urls.length}><button type="button" disabled={!selected().length} onClick={() => clipboard.chooseImages(selected())}>Download selected images</button>{' '}</Show>
      <button type="button" onClick={() => clipboard.cancel()}>Cancel paste</button>
    </div>}</Show>
    <span>{clipboard.message()}</span>{' '}
    <Show when={['Preparing paste…', 'Preparing Markdown…', 'Reading clipboard…'].includes(clipboard.message())}><button type="button" onClick={() => clipboard.cancel()}>Cancel paste</button>{' '}</Show>
    <Show when={clipboard.recovery()}><button type="button" onClick={() => clipboard.recoverCopy()}>Recover cut copy</button>{' '}</Show>
    <button type="button" aria-label="Dismiss clipboard message" onClick={() => clipboard.dismiss()}>×</button>
  </aside></Show>; }, host);
  const blur = () => clipboard.clearIntent();
  document.defaultView?.addEventListener('blur', blur);
  document.addEventListener('compositionstart', blur, true);
  return () => { dispose(); host.remove(); document.defaultView?.removeEventListener('blur', blur); document.removeEventListener('compositionstart', blur, true); };
}
