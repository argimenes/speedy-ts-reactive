import { createUniqueId, onCleanup, onMount, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

export function DocumentDialog(props: { title: string; onClose: () => void; busy?: boolean; children: JSX.Element; compact?: boolean }) {
  const titleId = createUniqueId();
  let dialog!: HTMLElement;
  const previous = document.activeElement as HTMLElement | null;
  onMount(() => queueMicrotask(() => {
    if (dialog.isConnected) (dialog.querySelector<HTMLElement>("[data-autofocus]") ?? dialog.querySelector<HTMLElement>("input, button:not([disabled])") ?? dialog).focus();
  }));
  onCleanup(() => { if (previous?.isConnected) previous.focus({ preventScroll: true }); });
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (!props.busy) props.onClose();
    }
    if (event.key === "Tab") {
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')]
        .filter((element) => element.tabIndex >= 0 && !element.closest("[inert]"));
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  return <Portal>
    <div class="document-dialog__backdrop">
      <section ref={dialog} class="document-dialog" classList={{ "document-dialog--compact": props.compact }} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={props.busy} tabIndex={-1} onKeyDown={keyDown}>
        <header class="document-dialog__header"><h2 id={titleId}>{props.title}</h2><button type="button" aria-label="Close dialog" disabled={props.busy} onClick={props.onClose}>×</button></header>
        {props.children}
      </section>
    </div>
  </Portal>;
}
