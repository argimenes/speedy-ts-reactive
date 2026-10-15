import { Show } from 'solid-js';
import { render } from 'solid-js/web';
import type { MutableClipboard } from '../runtime/mutable-clipboard';

/** One editor-owned status surface; no document data or repository subscriptions. */
export function installClipboardStatus(document: Document, clipboard: MutableClipboard) {
  const host = document.createElement('div'); document.body.appendChild(host);
  const dispose = render(() => <Show when={clipboard.message()}><aside role="status" aria-live="polite" data-mutable-clipboard-status
    style={{ position: 'fixed', bottom: '12px', left: '50%', transform: 'translateX(-50%)', 'z-index': 10000, padding: '8px 12px', 'max-width': 'min(650px,90vw)', background: 'var(--flint-panel, #f7f5ef)', color: '#252525', border: '1px solid #aaa', 'border-radius': '4px', 'box-shadow': '0 2px 10px #0002', 'font-size': '13px' }}>
    <span>{clipboard.message()}</span>{' '}
    <Show when={clipboard.message() === 'Preparing paste…'}><button type="button" onClick={() => clipboard.cancel()}>Cancel paste</button>{' '}</Show>
    <Show when={clipboard.recovery()}><button type="button" onClick={() => clipboard.recoverCopy()}>Recover cut copy</button>{' '}</Show>
    <button type="button" aria-label="Dismiss clipboard message" onClick={() => clipboard.dismiss()}>×</button>
  </aside></Show>, host);
  const blur = () => clipboard.clearIntent();
  document.defaultView?.addEventListener('blur', blur);
  document.addEventListener('compositionstart', blur, true);
  return () => { dispose(); host.remove(); document.defaultView?.removeEventListener('blur', blur); document.removeEventListener('compositionstart', blur, true); };
}
