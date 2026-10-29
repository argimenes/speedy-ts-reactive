// Focus-only horizontal reveal. Never scroll the Document/window and never run
// from text edits. One pending read/write batch per mounted table viewport.
const pending = new WeakMap<HTMLElement, number>();
export function cancelTableReveal(viewport: HTMLElement) {
  const frame = pending.get(viewport);
  if (frame !== undefined) cancelAnimationFrame(frame);
  pending.delete(viewport);
}
export function revealTableCell(element: Element) {
  const cell = element.closest<HTMLElement>('[role="cell"], [role="columnheader"]');
  const viewport = cell?.closest<HTMLElement>('.reactive-table-scroll');
  if (!cell || !viewport) return;
  cancelTableReveal(viewport);
  pending.set(viewport, requestAnimationFrame(() => {
    pending.delete(viewport);
    if (!cell.isConnected || !viewport.isConnected || cell.closest('.reactive-table-scroll') !== viewport) return;
    // No retained geometry is assumed valid across reparenting/zoom. Only these
    // two focus targets are measured, once, before the single scroll write.
    const bounds = viewport.getBoundingClientRect(), target = cell.getBoundingClientRect();
    if (!bounds.width) return;
    const delta = target.left < bounds.left || target.width > bounds.width ? target.left - bounds.left
      : target.right > bounds.right ? target.right - bounds.right : 0;
    if (delta) viewport.scrollLeft += delta * viewport.clientWidth / bounds.width;
  }));
}
