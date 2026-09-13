import { createStore } from "solid-js/store";
import type {
  ContentKey,
  NodeKey,
  SelectionSet,
  TextSelectionItem,
  ViewId,
} from "../block-tree/types";
import { ReplacePositionMap } from "../block-tree/position-map";

let selectionCounter = 0;
const selectionId = () => `selection:${++selectionCounter}`;

export class SelectionService {
  readonly sets: Record<NodeKey, SelectionSet>;
  private readonly setSets: (...args: any[]) => void;

  constructor() {
    const [sets, setSets] = createStore<Record<NodeKey, SelectionSet>>({});
    this.sets = sets;
    this.setSets = setSets;
  }

  setPrimary(
    occurrenceKey: NodeKey,
    contentKey: ContentKey,
    viewId: ViewId,
    anchor: number,
    head = anchor,
  ): SelectionSet {
    const previous = this.sets[occurrenceKey];
    const id = previous?.primaryId ?? selectionId();
    const primary: TextSelectionItem = {
      id,
      kind: "text",
      anchor: {
        contentKey,
        occurrenceKey,
        boundary: { index: anchor, affinity: "after" },
      },
      head: {
        contentKey,
        occurrenceKey,
        boundary: { index: head, affinity: "after" },
      },
    };
    const secondary = previous?.items.filter((item) => item.id !== previous.primaryId) ?? [];
    const next: SelectionSet = {
      viewId,
      primaryId: id,
      items: [primary, ...secondary],
      revision: (previous?.revision ?? 0) + 1,
    };
    this.setSets(occurrenceKey, next);
    return next;
  }

  addCaret(
    occurrenceKey: NodeKey,
    contentKey: ContentKey,
    viewId: ViewId,
    index: number,
  ): SelectionSet {
    const current = this.sets[occurrenceKey] ??
      this.setPrimary(occurrenceKey, contentKey, viewId, index);
    const item: TextSelectionItem = {
      id: selectionId(),
      kind: "text",
      anchor: { contentKey, occurrenceKey, boundary: { index, affinity: "after" } },
      head: { contentKey, occurrenceKey, boundary: { index, affinity: "after" } },
    };
    const next = { ...current, items: [...current.items, item], revision: current.revision + 1 };
    this.setSets(occurrenceKey, next);
    return next;
  }

  clearSecondary(occurrenceKey: NodeKey): void {
    const current = this.sets[occurrenceKey];
    if (!current) return;
    const primary = current.items.find((item) => item.id === current.primaryId);
    if (!primary) return;
    this.setSets(occurrenceKey, {
      ...current,
      items: [primary],
      revision: current.revision + 1,
    });
  }

  setSelectionSet(occurrenceKey: NodeKey, set: SelectionSet): void {
    if (!set.items.length || !set.items.some((item) => item.id === set.primaryId)) {
      throw new Error("A selection set requires a valid primary item");
    }
    this.setSets(occurrenceKey, { ...set, revision: set.revision + 1 });
  }

  mapContentEdit(
    contentKey: ContentKey,
    start: number,
    end: number,
    insertedLength: number,
  ): void {
    const positionMap = new ReplacePositionMap(start, end, insertedLength);
    for (const [occurrenceKey, set] of Object.entries(this.sets)) {
      let changed = false;
      const items = set.items.map((item) => {
        if (item.anchor.contentKey !== contentKey) return item;
        changed = true;
        return {
          ...item,
          anchor: {
            ...item.anchor,
            boundary: {
              ...item.anchor.boundary,
              index: positionMap.map(item.anchor.boundary.index, item.anchor.boundary.affinity),
            },
          },
          head: {
            ...item.head,
            boundary: {
              ...item.head.boundary,
              index: positionMap.map(item.head.boundary.index, item.head.boundary.affinity),
            },
          },
        };
      });
      if (changed) this.setSets(occurrenceKey, { ...set, items, revision: set.revision + 1 });
    }
  }

  removeOccurrence(occurrenceKey: NodeKey): void {
    this.setSets(occurrenceKey, undefined);
  }
  clearExcept(occurrenceKey?: NodeKey): void {
    for (const key of Object.keys(this.sets)) if (key !== occurrenceKey && this.sets[key]) this.removeOccurrence(key);
  }
}
