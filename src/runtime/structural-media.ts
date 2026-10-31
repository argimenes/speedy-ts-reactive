import type { ReactiveEditor } from '../reactive-editor/editor';
export interface StructuralMediaOccurrence { view:string; placement:string; content:string }
/** Keep affected media browsing contexts connected while retained slots move.
 * The same lease covers the commit, Undo/Redo and rollback. */
export function holdStructuralMedia(editor:ReactiveEditor, occurrences:StructuralMediaOccurrence[],marker='structuralMediaParking') {
    const roots = new Set<Element>();
    for (const b of occurrences) {
      const n = editor.nodeForPlacementInView(b.placement, b.view);
      if (!n || n.contentKey !== b.content) continue;
      const m = editor.mounts.get(n.key);
      if (m?.root.isConnected && m.root.querySelector('iframe,video,audio')) roots.add(m.root);
    }
    // Move the innermost registered media view, not its table/list ancestors.
    const leaves = [...roots].filter(root => ![...roots].some(other => other !== root && root.contains(other)));
    if (!leaves.length) return;
    const doc = leaves[0].ownerDocument;
    if (typeof (doc.body as any).moveBefore !== 'function') throw Error('This browser cannot preserve a live media viewer during structural history.');
    const parking = doc.createElement('div');
    parking.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;left:0;top:0';
    parking.dataset[marker] = ''; doc.body.append(parking);
    const held = leaves.map(root => ({ root, parent: root.parentElement!, next: root.nextSibling }));
    // Schedule recovery before moving anything, including for failed commits.
    queueMicrotask(() => {
      for (const { root, parent, next } of held) {
        if (parent.isConnected) (parent as any).moveBefore(root, next?.parentNode === parent ? next : null);
        else parent.insertBefore(root, next?.parentNode === parent ? next : null);
      }
      parking.remove();
    });
    for (const { root } of held) (parking as any).moveBefore(root, null);
}
