import type { BlockNode, ExistingBlockDto, NodeKey } from '../block-tree/types';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { BlockTreeProjection } from '../block-tree/projection';

const isList = (node?: BlockNode) => node?.viewType === 'indented-list-block';
const isItemContainer = (node?: BlockNode) => node?.viewType === 'container-block' && !!(node.payload.metadata as any)?.htmlListItem;

/** Both current item-owned lists and older sibling-nested lists have one owner. */
export function listItemOwner(projection: BlockTreeProjection, listKey: NodeKey): BlockNode | undefined {
  const parent = projection.parentOf(listKey);
  if (!parent) return;
  if (!isList(parent)) {
    if (isList(projection.parentOf(parent.key))) return parent;
    return;
  }
  const index = parent.children.indexOf(listKey);
  for (let i = index - 1; i >= 0; i--) {
    const candidate = projection.state.nodes[parent.children[i]];
    if (!isList(candidate)) return candidate;
  }
}

export function listItemChildren(projection: BlockTreeProjection, key: NodeKey): NodeKey[] {
  const item = projection.state.nodes[key];
  if (!item) return [];
  const children = item.children.filter(k => isList(projection.state.nodes[k]));
  const parent = projection.parentOf(key);
  if (isList(parent)) {
    for (let i = parent!.children.indexOf(key) + 1; i < parent!.children.length; i++) {
      const next = parent!.children[i];
      if (!isList(projection.state.nodes[next])) break;
      children.push(next);
    }
  }
  return children;
}

export function setListItemCollapsed(editor: ReactiveEditor, key: NodeKey, collapsed: boolean) {
  const item = editor.node(key);
  if (!item) return;
  editor.commands.setPayloadField(key, 'metadata', { ...JSON.parse(JSON.stringify(item.payload.metadata ?? {})), listCollapsed: collapsed }, collapsed ? 'Collapse list item' : 'Expand list item');
}
const listDto = (source?: BlockNode): ExistingBlockDto => ({
  ...(source ? JSON.parse(JSON.stringify(source.payload)) : { metadata: { htmlList: { ordered: false } } }),
  id: crypto.randomUUID(), type: 'indented-list-block', children: [],
});

/** Move existing placements, preserving text, annotations and owned relations.
 * Called only by an explicit list command; ancestor lookup uses occurrence routes. */
export function changeTextList(editor: ReactiveEditor, key: NodeKey, outdent: boolean): boolean {
  const source = editor.node(key);
  if (source?.viewType !== 'standoff-editor-block') return false;
  const projection = editor.projections.get(source.viewId)!;
  const parentOf = (node: BlockNode) => projection.parentOf(node.key);
  const parent = parentOf(source);
  if (!parent?.children.includes(key)) return false;
  const item = isItemContainer(parent) && isList(parentOf(parent)) ? parent : source;
  const list = parentOf(item);
  const inside = isList(list);
  if (outdent && !inside) return false;
  const selection = editor.mounts.get(key)?.captureInlineSelection?.();
  const sourcePlacement = source.placementKey, viewId = source.viewId;
  const commands = editor.commands;
  const append = (target: string, moving: string) => commands.move(moving, { kind: 'at', parentKey: target, index: commands.childrenOf(target).length });
  const nestedList = (owner: BlockNode, template: BlockNode) => {
    const last = editor.node(owner.children.at(-1)!);
    return isList(last) ? last!.placementKey : commands.insert(listDto(template), { kind: 'at', parentKey: owner.placementKey, index: commands.childrenOf(owner.placementKey).length });
  };
  if (!inside) {
    commands.transaction('Convert TextBlock to list', () => {
      const wrapper = commands.insert(listDto(), { kind: 'before', anchorKey: key });
      append(wrapper, sourcePlacement);
    });
  } else if (!outdent) {
    const index = list!.children.indexOf(item.key), previous = editor.node(list!.children[index - 1]);
    // The first item has no preceding item to become its parent.
    if (!previous) return true;
    if (!isList(previous) && previous.viewType !== 'standoff-editor-block' && !isItemContainer(previous)) return true;
    commands.transaction('Indent list item', () => {
      // Older lists may store a nested list beside its preceding TextBlock.
      const nested = isList(previous) ? previous.placementKey : nestedList(previous, list!);
      const owner = isList(previous) ? listItemOwner(projection, previous.key) : previous;
      if (owner && (owner.payload.metadata as any)?.listCollapsed) setListItemCollapsed(editor, owner.key, false);
      append(nested, item.placementKey);
    });
  } else {
    const owner = parentOf(list!);
    if (!owner?.children.includes(list!.key)) return true;
    const outer = parentOf(owner);
    const nested = isList(owner) || isList(outer) && (owner.viewType === 'standoff-editor-block' || isItemContainer(owner));
    const index = list!.children.indexOf(item.key);
    const following = list!.children.slice(index + 1).map(k => editor.node(k)!.placementKey);
    commands.transaction('Outdent list item', () => {
      if (nested) {
        commands.move(item.placementKey, { kind: 'after', anchorKey: isList(owner) ? list!.placementKey : owner.placementKey });
        // Keep reading order: following siblings become children of the lifted item.
        if (following.length) {
          const tail = nestedList(item, list!);
          following.forEach(k => append(tail, k));
        }
      } else {
        commands.move(item.placementKey, { kind: 'after', anchorKey: list!.placementKey });
        if (following.length) {
          const tail = commands.insert(listDto(list!), { kind: 'after', anchorKey: item.placementKey });
          following.forEach(k => append(tail, k));
        }
        if (isItemContainer(item) && !Object.keys(item.ownedRelations).length) commands.unwrap(item.placementKey);
      }
      if (!commands.childrenOf(list!.placementKey).length && !Object.keys(list!.ownedRelations).length) commands.remove(list!.placementKey);
    });
  }
  queueMicrotask(() => {
    const target = editor.nodeForPlacementInView(sourcePlacement, viewId);
    if (!target) return;
    editor.focus.request(target.key, { reason: 'text-list', caret: 'start' });
    if (selection) editor.mounts.get(target.key)?.restoreInlineSelection?.(selection);
  });
  return true;
}
