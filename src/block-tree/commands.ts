import { planBlockRestore, type BlockRestorePlan, type LeafAuthoredState } from "./block-restore";
import { type DeepReadonly } from "./commit-capture";
import { clone } from "./clone";
import { ownNewDefinitions } from "./definition-ownership";
import { planCrossTextEdit, type CrossTextSegment } from "./cross-text-edit";
import { linkedRegistry } from "./linked-annotations";
import { captureBlocks, cloneBlocks, remapKnownBlockReferences, type BlockFragment } from "./clipboard";
import type { BlockCommitSubject, CommandDescriptor } from "./commit-capture";
import { isAuthoredBlock, prepareNewBlockIdentities, readBlockId } from "./identity";
import { editAnnotation, type AnnotationAction, type AnnotationPatch } from "./annotation-commands";
import { isTextLeaf } from "./inline-plan";
import { decodeDetachedSubtree, encodeDocument } from "./codecs";
import { createBlockId, createContentKey, createPlacementKey } from "./ids";
import { deriveLocations, planOperations, type CanonicalRepository } from "./repository";
import type {
  ContentRecord,
  Destination,
  ExistingBlockDto,
  InlineImageDescriptor,
  NodeKey,
  PlacementKey,
  RepositoryOperation,
  RepositoryState,
} from "./types";

interface PendingTransaction {
  label: string;
  operations: RepositoryOperation[];
  draft: RepositoryState;
  commands: CommandDescriptor[];
}

export class TreeCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TreeCommandError";
  }
}

function mapStandoffPropertiesForReplacement(
  properties: unknown[],
  start: number,
  end: number,
  insertedLength: number,
): unknown[] {
  const removedLength = end - start;
  const delta = insertedLength - removedLength;

  return properties.flatMap((property) => {
    if (!property || typeof property !== "object") return [clone(property)];
    const mapped = clone(property as Record<string, unknown>);
    const propertyStart = typeof mapped.start === "number" ? mapped.start : undefined;
    const propertyEnd = typeof mapped.end === "number" ? mapped.end : undefined;
    if (
      propertyStart === undefined ||
      propertyEnd === undefined ||
      propertyEnd < propertyStart
    ) {
      return [mapped];
    }

    // Standoff ranges are inclusive Cell ranges, while replacement ranges are
    // half-open boundaries. An insertion at a range edge stays outside that
    // range; an insertion strictly inside it expands the range.
    if (removedLength === 0) {
      if (insertedLength === 0 || propertyEnd < start) return [mapped];
      if (propertyStart >= start) {
        mapped.start = propertyStart + insertedLength;
        mapped.end = propertyEnd + insertedLength;
      } else {
        mapped.end = propertyEnd + insertedLength;
      }
      return [mapped];
    }

    if (propertyEnd < start) return [mapped];
    if (propertyStart >= end) {
      mapped.start = propertyStart + delta;
      mapped.end = propertyEnd + delta;
      return [mapped];
    }

    const survivesBefore = propertyStart < start;
    const survivesAfter = propertyEnd >= end;
    if (!survivesBefore && !survivesAfter) return [];

    mapped.start = survivesBefore ? propertyStart : start + insertedLength;
    mapped.end = survivesAfter ? propertyEnd + delta : start - 1;
    return typeof mapped.start === "number" &&
      typeof mapped.end === "number" &&
      mapped.start <= mapped.end
      ? [mapped]
      : [];
  });
}

export class TreeCommands {
  private pending?: PendingTransaction;
  private restorePlans = new WeakSet<object>();
  prepareBlockRestore(placementKey: string, blockId: string, source: DeepReadonly<LeafAuthoredState>): DeepReadonly<BlockRestorePlan> {
    if (this.pending) throw new TreeCommandError("Finish the current transaction before preparing a restore");
    const plan = planBlockRestore(this.repository.readState(), placementKey, blockId, source);
    this.restorePlans.add(plan); return plan;
  }
  restoreBlock(plan: DeepReadonly<BlockRestorePlan>): void {
    if (!this.restorePlans.has(plan) || this.pending || this.repository.state.revision !== plan.expectedRevision) throw new TreeCommandError("The Document changed. Prepare and confirm the restore again.");
    this.restorePlans.delete(plan);
    this.publish("Restore this Block", clone(plan.operations) as RepositoryOperation[], clone(plan.descriptor) as CommandDescriptor);
  }


  replaceAcrossBlocks(segments: CrossTextSegment[], text: string) {
    const state = this.pending?.draft ?? this.repository.readState();
    const resolved = segments.map(segment => ({ ...segment, placementKey: this.placementKey(segment.placementKey, state) }));
    const result = planCrossTextEdit(state, resolved, text);
    this.pruneUnreachable(result.state);
    this.publish("Replace selected text", this.diff(state, result.state), {
      commandId: "tree.replaceAcrossBlocks", subjects: [...result.inputs, ...result.outputs],
      relation: { kind: "cross-text-replace", inputs: result.inputs, outputs: result.outputs },
    });
    return { placementKey: result.placementKey, caret: result.caret };
  }

  editStandoffProperty(key: NodeKey | PlacementKey, index: number, expected: Record<string, unknown>, action: AnnotationAction | AnnotationPatch): Record<string, unknown> {
    const state = this.pending?.draft ?? this.repository.readState();
    const content = state.contents[state.placements[this.placementKey(key, state)].contentKey];
    const properties = content.payload.standoffProperties;
    if (content.inlineKind !== "standoff" || !Array.isArray(properties) || !Number.isInteger(index) ||
      !properties[index] || JSON.stringify(properties[index]) !== JSON.stringify(expected)) throw new TreeCommandError("Annotation changed; reopen the monitor");
    const next = editAnnotation(properties[index], action, content, () => content.inlineContent.map(key => String(state.contents[state.placements[key].contentKey].payload.text ?? "\uFFFC")).join(""));
    if (JSON.stringify(next) === JSON.stringify(properties[index])) return next;
    const updated = clone(properties); updated[index] = next;
    this.publish("Edit Standoff annotation", [{ kind: "put-content", record: {
      ...clone(content), payload: { ...clone(content.payload), standoffProperties: updated }, revision: content.revision + 1,
    } }], { commandId: "tree.editStandoffProperty", subjects: [this.subject(state, this.placementKey(key, state))] });
    return clone(next);
  }

  constructor(
    private readonly repository: CanonicalRepository,
    private readonly resolveOccurrence: (key: NodeKey | PlacementKey) => PlacementKey | undefined,
  ) {}

  private state(): RepositoryState {
    return this.pending?.draft ?? this.repository.snapshot();
  }

  /** Transaction-aware structural reads, including freshly inserted wrappers. */
  childrenOf(key: NodeKey | PlacementKey): PlacementKey[] {
    const state = this.state();
    return [...state.contents[state.placements[this.placementKey(key, state)].contentKey].children];
  }

  private placementKey(key: NodeKey | PlacementKey, state = this.state()): PlacementKey {
    const resolved = this.resolveOccurrence(key);
    if (!resolved || !state.placements[resolved]) {
      throw new TreeCommandError(`Unknown Block occurrence ${key}`);
    }
    return resolved;
  }

  private subject(state: RepositoryState, placementKey: PlacementKey): BlockCommitSubject {
    const placement = state.placements[placementKey];
    if (placement.externalReference) return { placementKey, contentKey: placement.contentKey };
    const content = state.contents[placement.contentKey];
    return { contentKey: content.key, placementKey, blockId: readBlockId(content) };
  }

  private publish(label: string, operations: RepositoryOperation[], descriptor?: CommandDescriptor): void {
    if (!operations.length) return;
    operations = ownNewDefinitions(this.pending?.draft ?? this.repository.readState(), operations,
      key => this.pending ? deriveLocations(this.pending.draft).get(key) : this.repository.locationOf(key));
    const current = this.pending?.draft ?? this.repository.readState();
    if (this.repository.hasSemanticPlacements() || operations.some(op => op.kind === "put-placement" && op.record.placementId !== undefined)) {
      operations = operations.map(op => op.kind === "put-placement" && op.record.kind !== "inline" &&
        !current.placements[op.record.key] && op.record.placementId === undefined
        ? { ...op, record: { ...op.record, placementId: createBlockId() } } : op);
    }
    const description = descriptor ?? { commandId: "tree.command", subjects: [] };
    if (this.pending) {
      const { next } = planOperations(this.pending.draft, operations);
      this.pending.draft = next;
      this.pending.operations.push(...operations);
      this.pending.commands.push(clone(description));
      return;
    }
    this.repository.commit(label, operations, true, { commands: [description] });
  }

  transaction(label: string, operation: () => void, descriptor?: CommandDescriptor): void {
    if (this.pending) {
      const index = this.pending.commands.length;
      operation();
      if (descriptor) this.pending.commands.splice(index, 0, clone(descriptor));
      return;
    }
    this.pending = { label, operations: [], draft: this.repository.snapshot(), commands: descriptor ? [clone(descriptor)] : [] };
    try {
      operation();
      const operations = this.pending.operations;
      const commands = this.pending.commands;
      this.pending = undefined;
      this.repository.commit(label, operations, true, { commands });
    } catch (error) {
      this.pending = undefined;
      throw error;
    }
  }

  private updatedChildren(content: ContentRecord, children: PlacementKey[]): ContentRecord {
    return {
      ...clone(content),
      children,
      wireChildren: "present",
      revision: content.revision + 1,
    };
  }

  private pruneUnreachable(state: RepositoryState): void {
    const reachablePlacements = new Set<PlacementKey>();
    const visit = (placementKey: PlacementKey) => {
      if (reachablePlacements.has(placementKey)) return;
      reachablePlacements.add(placementKey);
      const placement = state.placements[placementKey];
      if (!placement) return;
      const content = state.contents[placement.contentKey];
      if (!content) return;
      content.children.forEach(visit);
      content.inlineContent.forEach(visit);
      Object.values(content.ownedRelations).forEach(visit);
    };
    visit(state.rootPlacementKey);
    // Retained definitions outlive their last visible placement. This applies
    // only to explicitly normalized Documents, leaving legacy pruning intact.
    const retained = new Set<string>();
    for (const content of Object.values(state.contents)) {
      if (content.definitionOwnerKey === undefined) continue;
      if (content.key === content.definitionOwnerKey) continue;
      retained.add(content.key);
      content.children.forEach(visit);
      content.inlineContent.forEach(visit);
      Object.values(content.ownedRelations).forEach(visit);
    }
    for (const placementKey of Object.keys(state.placements)) {
      if (!reachablePlacements.has(placementKey)) delete state.placements[placementKey];
    }
    const usedContent = new Set(Object.values(state.placements).map((p) => p.contentKey));
    for (const contentKey of Object.keys(state.contents)) {
      if (!usedContent.has(contentKey) && !retained.has(contentKey)) delete state.contents[contentKey];
    }
  }

  /** Explicit definition deletion requires removing its local placements first.
   * Foreign consumers are not scanned and do not decide the owner's lifetime. */
  deleteUnplacedDefinition(contentKey: string): void {
    const before = this.state(), content = before.contents[contentKey];
    if (!content?.definitionOwnerKey) throw new TreeCommandError("Not a retained Document definition");
    if (Object.values(before.placements).some(p => !p.externalReference && p.contentKey === contentKey)) {
      throw new TreeCommandError("Remove the definition's local placements before deleting it");
    }
    const next = clone(before);
    delete next.contents[contentKey].definitionOwnerKey;
    this.pruneUnreachable(next);
    this.publish("Delete unplaced definition", this.diff(before, next), {
      commandId: "tree.deleteUnplacedDefinition", subjects: [{ contentKey, blockId: readBlockId(content) }],
    });
  }

  private diff(before: RepositoryState, after: RepositoryState): RepositoryOperation[] {
    const operations: RepositoryOperation[] = [];
    for (const key of Object.keys(before.placements)) {
      if (!after.placements[key]) operations.push({ kind: "remove-placement", key });
    }
    for (const [key, record] of Object.entries(after.placements)) {
      if (JSON.stringify(before.placements[key]) !== JSON.stringify(record)) {
        operations.push({ kind: "put-placement", record });
      }
    }
    for (const key of Object.keys(before.contents)) {
      if (!after.contents[key]) operations.push({ kind: "remove-content", key });
    }
    for (const [key, record] of Object.entries(after.contents)) {
      if (JSON.stringify(before.contents[key]) !== JSON.stringify(record)) {
        operations.push({ kind: "put-content", record });
      }
    }
    if (before.rootPlacementKey !== after.rootPlacementKey) {
      operations.push({ kind: "set-root", key: after.rootPlacementKey });
    }
    return operations;
  }

  private resolveInsertion(
    destination: Destination,
    sourceKey?: PlacementKey,
    state = this.state(),
  ): { owner: ContentRecord; children: PlacementKey[]; index: number } {
    if (destination.kind === "at") {
      const parentPlacementKey = this.placementKey(destination.parentKey, state);
      const parentPlacement = state.placements[parentPlacementKey];
      const owner = state.contents[parentPlacement.contentKey];
      const children = sourceKey
        ? owner.children.filter((key) => key !== sourceKey)
        : [...owner.children];
      if (destination.index < 0 || destination.index > children.length) {
        throw new TreeCommandError(
          `Insertion index ${destination.index} is outside 0..${children.length}`,
        );
      }
      return { owner, children, index: destination.index };
    }

    const anchorKey = this.placementKey(destination.anchorKey, state);
    if (sourceKey === anchorKey) {
      const location = deriveLocations(state).get(anchorKey);
      if (!location || location.slot.kind !== "children") {
        throw new TreeCommandError("The anchor is not in an ordinary child slot");
      }
      const owner = state.contents[location.ownerContentKey];
      return { owner, children: [...owner.children], index: owner.children.indexOf(anchorKey) };
    }
    const location = deriveLocations(state).get(anchorKey);
    if (!location || location.slot.kind !== "children") {
      throw new TreeCommandError("Before/after requires an ordinary child anchor");
    }
    const owner = state.contents[location.ownerContentKey];
    const children = sourceKey
      ? owner.children.filter((key) => key !== sourceKey)
      : [...owner.children];
    const anchorIndex = children.indexOf(anchorKey);
    if (anchorIndex < 0) throw new TreeCommandError("The insertion anchor is stale");
    return {
      owner,
      children,
      index: anchorIndex + (destination.kind === "after" ? 1 : 0),
    };
  }

  insertFragment(fragment: BlockFragment, destination: Destination, descriptor?: CommandDescriptor): PlacementKey[] {
    fragment = clone(fragment);
    prepareNewBlockIdentities(Object.values(fragment.state.contents));
    const state = this.state();
    const target = this.resolveInsertion(destination, undefined, state);
    if (Object.keys(fragment.state.contents).some(key => state.contents[key]) || Object.keys(fragment.state.placements).some(key => state.placements[key])) throw new TreeCommandError("Clipboard keys collide with existing Blocks");
    const children = [...target.children];
    children.splice(target.index, 0, ...fragment.roots);
    const owner = this.updatedChildren(target.owner, children);
    const extra: RepositoryOperation[] = [];
    if (Object.keys(fragment.linkedAnnotations ?? {}).length) {
      const registry = clone(linkedRegistry(state));
      for (const [id, definition] of Object.entries(fragment.linkedAnnotations!)) {
        if (registry[id] && JSON.stringify(registry[id]) !== JSON.stringify(definition)) throw new TreeCommandError("Conflicting linked annotation identity; copy the Blocks again");
        registry[id] = clone(definition);
      }
      const rootKey = state.placements[state.rootPlacementKey].contentKey;
      if (owner.key === rootKey) owner.payload.linkedAnnotations = registry;
      else {
        const root = clone(state.contents[rootKey]); root.payload.linkedAnnotations = registry; root.revision++;
        extra.push({ kind: "put-content", record: root });
      }
    }
    this.publish("Paste Blocks", [
      ...Object.values(fragment.state.contents).map(record => ({ kind: "put-content" as const, record: clone(record) })),
      ...Object.values(fragment.state.placements).map(record => ({ kind: "put-placement" as const, record: clone(record) })),
      { kind: "put-content", record: owner },
      ...extra,
    ], { commandId: "tree.insertFragment", subjects: fragment.roots.map(key => this.subject(fragment.state, key)),
      ...(fragment.copyIdentities?.length ? { relation: { kind: "copy" as const, pairs: fragment.copyIdentities } } : {}), ...descriptor });
    return [...fragment.roots];
  }

  insert(dto: ExistingBlockDto, destination: Destination): PlacementKey {
    const state = this.state();
    const decoded = decodeDetachedSubtree(dto);
    prepareNewBlockIdentities(Object.values(decoded.state.contents));
    const target = this.resolveInsertion(destination, undefined, state);
    const children = [...target.children];
    children.splice(target.index, 0, decoded.rootPlacementKey);
    const operations: RepositoryOperation[] = [
      ...Object.values(decoded.state.contents).map(
        (record): RepositoryOperation => ({ kind: "put-content", record }),
      ),
      ...Object.values(decoded.state.placements).map(
        (record): RepositoryOperation => ({ kind: "put-placement", record }),
      ),
      { kind: "put-content", record: this.updatedChildren(target.owner, children) },
    ];
    this.publish("Insert Block", operations, { commandId: "tree.insert", subjects: [this.subject(decoded.state, decoded.rootPlacementKey)] });
    return decoded.rootPlacementKey;
  }

  move(key: NodeKey | PlacementKey, destination: Destination): void {
    const state = this.state();
    const sourceKey = this.placementKey(key, state);
    if (sourceKey === state.rootPlacementKey) {
      throw new TreeCommandError("The root Block cannot be moved");
    }
    if (
      (destination.kind === "before" || destination.kind === "after") &&
      this.placementKey(destination.anchorKey, state) === sourceKey
    ) {
      return;
    }
    const locations = deriveLocations(state);
    const sourceLocation = locations.get(sourceKey);
    if (!sourceLocation || sourceLocation.slot.kind !== "children") {
      throw new TreeCommandError("Only ordinary child placements can be moved");
    }
    const sourceOwner = state.contents[sourceLocation.ownerContentKey];
    const target = this.resolveInsertion(destination, sourceKey, state);
    const destinationChildren = [...target.children];
    destinationChildren.splice(target.index, 0, sourceKey);

    const operations: RepositoryOperation[] = [];
    if (sourceOwner.key === target.owner.key) {
      operations.push({
        kind: "put-content",
        record: this.updatedChildren(sourceOwner, destinationChildren),
      });
    } else {
      operations.push({
        kind: "put-content",
        record: this.updatedChildren(
          sourceOwner,
          sourceOwner.children.filter((childKey) => childKey !== sourceKey),
        ),
      });
      operations.push({
        kind: "put-content",
        record: this.updatedChildren(target.owner, destinationChildren),
      });
    }
    this.publish("Move Block", operations, { commandId: "tree.move", subjects: [this.subject(state, sourceKey)] });
  }

  remove(key: NodeKey | PlacementKey): void {
    const state = this.state();
    const resolved = this.resolveOccurrence(key);
    if (!resolved || !state.placements[resolved]) return;
    if (resolved === state.rootPlacementKey) {
      throw new TreeCommandError("The root Block cannot be removed");
    }
    const location = deriveLocations(state).get(resolved);
    if (!location) return;
    const owner = state.contents[location.ownerContentKey];
    let updatedOwner: ContentRecord;
    if (location.slot.kind === "children") {
      updatedOwner = this.updatedChildren(
        owner,
        owner.children.filter((childKey) => childKey !== resolved),
      );
    } else if (location.slot.kind === "relation") {
      updatedOwner = {
        ...clone(owner),
        ownedRelations: { ...owner.ownedRelations },
        wireRelation: "present",
        revision: owner.revision + 1,
      };
      delete updatedOwner.ownedRelations[location.slot.name];
    } else {
      throw new TreeCommandError("Inline Cells must be removed through an inline editing command");
    }

    const projected = clone(state);
    projected.contents[owner.key] = clone(updatedOwner);
    this.pruneUnreachable(projected);
    this.publish("Remove Block", this.diff(state, projected), { commandId: "tree.remove", subjects: [this.subject(state, resolved)] });
  }

  unwrap(key: NodeKey | PlacementKey): void {
    const state = this.state();
    const placementKey = this.placementKey(key, state);
    if (placementKey === state.rootPlacementKey) {
      throw new TreeCommandError("The root Block cannot be unwrapped");
    }
    const location = deriveLocations(state).get(placementKey);
    if (!location || location.slot.kind !== "children") {
      throw new TreeCommandError("Only an ordinary child can be unwrapped");
    }
    const placement = state.placements[placementKey];
    const content = state.contents[placement.contentKey];
    if (Object.keys(content.ownedRelations).length) {
      throw new TreeCommandError("Unwrap requires an explicit owned-relation policy");
    }
    const occurrences = Object.values(state.placements).filter(
      (candidate) => candidate.contentKey === content.key,
    );
    if (occurrences.length !== 1) {
      throw new TreeCommandError("Shared content must be detached before unwrapping");
    }
    const owner = state.contents[location.ownerContentKey];
    const index = owner.children.indexOf(placementKey);
    const children = [...owner.children];
    children.splice(index, 1, ...content.children);
    this.publish("Unwrap Block", [
      { kind: "put-content", record: this.updatedChildren(owner, children) },
      { kind: "remove-placement", key: placementKey },
      { kind: "remove-content", key: content.key },
    ], { commandId: "tree.unwrap", subjects: [this.subject(state, placementKey)] });
  }

  replace(
    key: NodeKey | PlacementKey,
    dto: ExistingBlockDto,
    childPolicy: "preserve" | "replace",
  ): PlacementKey {
    const state = this.state();
    const placementKey = this.placementKey(key, state);
    if (placementKey === state.rootPlacementKey) {
      throw new TreeCommandError("Use a root reload command to replace the root Block");
    }
    const previousPlacement = state.placements[placementKey];
    const previousContent = state.contents[previousPlacement.contentKey];
    const decoded = decodeDetachedSubtree(dto);
    prepareNewBlockIdentities(Object.values(decoded.state.contents));
    const decodedRootPlacement = decoded.state.placements[decoded.rootPlacementKey];
    const decodedRootContent = clone(decoded.state.contents[decodedRootPlacement.contentKey]);
    const next = clone(state);

    Object.assign(next.contents, clone(decoded.state.contents));
    Object.assign(next.placements, clone(decoded.state.placements));
    delete next.placements[decoded.rootPlacementKey];
    next.placements[placementKey] = {
      ...clone(previousPlacement),
      contentKey: decodedRootContent.key,
    };
    if (childPolicy === "preserve") {
      decodedRootContent.children = [...previousContent.children];
      decodedRootContent.wireChildren = previousContent.wireChildren;
      // Replacement transfers these placements; it consumes the old definition
      // when unshared, rather than leaving a second owner for the same slots.
      if (Object.values(state.placements).filter(p => p.contentKey === previousContent.key).length === 1) {
        delete next.contents[previousContent.key];
      }
    }
    next.contents[decodedRootContent.key] = decodedRootContent;
    this.pruneUnreachable(next);
    const previousSubject = this.subject(state, placementKey), nextSubject = this.subject(next, placementKey);
    this.publish("Replace Block", this.diff(state, next), {
      commandId: "tree.replace", subjects: [previousSubject, nextSubject],
      relation: { kind: "replace", previous: previousSubject, next: nextSubject },
    });
    return placementKey;
  }

  replaceRelation(
    ownerKey: NodeKey | PlacementKey,
    name: string,
    dto: ExistingBlockDto,
  ): PlacementKey {
    const state = this.state();
    const ownerPlacement = state.placements[this.placementKey(ownerKey, state)];
    const relationKey = state.contents[ownerPlacement.contentKey].ownedRelations[name];
    if (!relationKey) return this.setRelation(ownerKey, name, dto);
    return this.replace(relationKey, dto, "replace");
  }

  ensureMargin(ownerKey: NodeKey | PlacementKey, side: "left" | "right"): PlacementKey {
    const state = this.pending?.draft ?? this.repository.readState();
    const owner = state.contents[state.placements[this.placementKey(ownerKey, state)].contentKey];
    if (owner.inlineKind !== "standoff") throw new TreeCommandError("Margins require a Standoff source block");
    const name = side === "left" ? "leftMargin" : "rightMargin";
    const text: ExistingBlockDto = {
      id: globalThis.crypto.randomUUID(), type: "standoff-editor-block", text: "", children: [],
      standoffProperties: [], blockProperties: [
        { type: "block/alignment", value: side }, { type: "block/font/size/three-quarters" },
      ],
    };
    const existing = owner.ownedRelations[name];
    if (existing) {
      const margin = state.contents[state.placements[existing].contentKey];
      if (margin.viewType !== `${side}-margin-block`) throw new TreeCommandError(`Incompatible ${name} relation`);
      const firstText = margin.children.find(key => state.contents[state.placements[key].contentKey].inlineKind === "standoff");
      if (firstText) return firstText;
      return this.insert(text, { kind: "at", parentKey: existing, index: margin.children.length });
    }
    const placement = this.setRelation(ownerKey, name, {
      id: globalThis.crypto.randomUUID(), type: `${side}-margin-block`,
      blockProperties: [
        { type: `block/marginalia/${side}` },
        ...(side === "right" ? [{ type: "block/alignment", value: "right" }] : []),
      ],
      children: [text],
    });
    const next = this.pending?.draft ?? this.repository.readState();
    return next.contents[next.placements[placement].contentKey].children[0];
  }

  setRelation(
    ownerKey: NodeKey | PlacementKey,
    name: string,
    dto: ExistingBlockDto,
  ): PlacementKey {
    const state = this.state();
    const ownerPlacement = state.placements[this.placementKey(ownerKey, state)];
    const owner = state.contents[ownerPlacement.contentKey];
    if (owner.ownedRelations[name]) {
      throw new TreeCommandError(`Relation ${name} already exists; remove or replace it explicitly`);
    }
    if (Object.prototype.hasOwnProperty.call(owner.opaqueRelations, name)) {
      throw new TreeCommandError(`Relation ${name} is preserved as opaque wire data`);
    }
    const decoded = decodeDetachedSubtree(dto);
    prepareNewBlockIdentities(Object.values(decoded.state.contents));
    const updatedOwner: ContentRecord = {
      ...clone(owner),
      ownedRelations: { ...owner.ownedRelations, [name]: decoded.rootPlacementKey },
      wireRelation: "present",
      revision: owner.revision + 1,
    };
    this.publish("Set relation", [
      ...Object.values(decoded.state.contents).map(
        (record): RepositoryOperation => ({ kind: "put-content", record }),
      ),
      ...Object.values(decoded.state.placements).map(
        (record): RepositoryOperation => ({ kind: "put-placement", record }),
      ),
      { kind: "put-content", record: updatedOwner },
    ], { commandId: "tree.setRelation", subjects: [this.subject(state, ownerPlacement.key), this.subject(decoded.state, decoded.rootPlacementKey)] });
    return decoded.rootPlacementKey;
  }

  removeRelation(ownerKey: NodeKey | PlacementKey, name: string): void {
    const state = this.state();
    const ownerPlacement = state.placements[this.placementKey(ownerKey, state)];
    const relationKey = state.contents[ownerPlacement.contentKey].ownedRelations[name];
    if (relationKey) this.remove(relationKey);
  }

  setPayloadField(
    key: NodeKey | PlacementKey,
    field: string,
    value: unknown,
    label = "Update Block",
  ): void {
    if (field === "children" || field === "relation") {
      throw new TreeCommandError(`${field} must be changed through structural commands`);
    }
    const state = this.state();
    const placement = state.placements[this.placementKey(key, state)];
    const content = state.contents[placement.contentKey];
    if (Object.is(content.payload[field], value)) return;
    this.publish(label, [
      {
        kind: "put-content",
        record: {
          ...clone(content),
          payload: { ...clone(content.payload), [field]: clone(value) },
          revision: content.revision + 1,
        },
      },
    ], { commandId: "tree.setPayloadField", subjects: [this.subject(state, placement.key)] });
  }

  replaceInlineRange(
    key: NodeKey | PlacementKey,
    start: number,
    end: number,
    text: string,
    label = "Edit Standoff text",
  ): void {
    const state = this.pending?.draft ?? this.repository.readState();
    const placement = state.placements[this.placementKey(key, state)];
    const content = state.contents[placement.contentKey];
    if (content.inlineKind !== "standoff") {
      throw new TreeCommandError("Inline text operations require a Standoff content record");
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > content.inlineContent.length) {
      throw new TreeCommandError(`Invalid inline range ${start}..${end}`);
    }

    const removed = content.inlineContent.slice(start, end);
    const incremental = !this.pending && removed.every((key) =>
      isTextLeaf(state.contents[state.placements[key].contentKey]));
    const operations: RepositoryOperation[] = [];
    const inserted: PlacementKey[] = [];
    for (const character of [...text]) {
      const contentKey = createContentKey();
      const placementKey = createPlacementKey();
      operations.push({ kind: "put-content", record: {
        key: contentKey,
        viewType: "text-cell",
        payload: { text: character },
        children: [],
        inlineContent: [],
        inlineRevision: 0,
        ownedRelations: {},
        opaqueRelations: {},
        wireChildren: "omitted",
        wireRelation: "omitted",
        revision: 0,
      } });
      operations.push({ kind: "put-placement", record: { key: placementKey, contentKey, kind: "inline" } });
      inserted.push(placementKey);
    }

    const nextInline = [...content.inlineContent];
    nextInline.splice(start, end - start, ...inserted);
    const payload = clone(content.payload);
    if (Array.isArray(payload.standoffProperties)) {
      payload.standoffProperties = mapStandoffPropertiesForReplacement(
        payload.standoffProperties,
        start,
        end,
        inserted.length,
      );
    }
    operations.push({ kind: "put-content", record: {
      ...clone(content),
      payload,
      inlineContent: nextInline,
      inlineRevision: content.inlineRevision + 1,
      revision: content.revision + 1,
    } });
    if (incremental) {
      const removedReferences = new Map<string, number>();
      for (const key of removed) {
        operations.push({ kind: "remove-placement", key });
        const contentKey = state.placements[key].contentKey;
        removedReferences.set(contentKey, (removedReferences.get(contentKey) ?? 0) + 1);
      }
      for (const [key, count] of removedReferences) {
        if (this.repository.contentReferenceCount(key) === count) operations.push({ kind: "remove-content", key });
      }
      this.publish(label, operations, { commandId: "tree.replaceInlineRange", subjects: [this.subject(state, placement.key)] });
      return;
    }
    // Structural inline atoms and transaction drafts retain full graph planning.
    const next = clone(state);
    for (const operation of operations) {
      if (operation.kind === "put-content") next.contents[operation.record.key] = operation.record;
      if (operation.kind === "put-placement") next.placements[operation.record.key] = operation.record;
    }
    this.pruneUnreachable(next);
    this.publish(label, this.diff(state, next), { commandId: "tree.replaceInlineRange", subjects: [this.subject(state, placement.key)] });
  }

  transclude(
    sourceKey: NodeKey | PlacementKey,
    destination: Destination,
  ): PlacementKey {
    const state = this.state();
    const source = state.placements[this.placementKey(sourceKey, state)];
    const target = this.resolveInsertion(destination, undefined, state);
    const placementKey = createPlacementKey();
    const children = [...target.children];
    children.splice(target.index, 0, placementKey);
    this.publish("Transclude Block", [
      {
        kind: "put-placement",
        record: { key: placementKey, contentKey: source.contentKey, kind: "reference",
          ...(source.externalReference ? { externalReference: clone(source.externalReference) } : {}) },
      },
      { kind: "put-content", record: this.updatedChildren(target.owner, children) },
    ], { commandId: "tree.transclude", subjects: [this.subject(state, source.key), { contentKey: source.contentKey, placementKey,
      ...(source.externalReference ? {} : { blockId: readBlockId(state.contents[source.contentKey]) }) }] });
    return placementKey;
  }

  unlink(key: NodeKey | PlacementKey): void {
    const state = this.state();
    const placement = state.placements[this.placementKey(key, state)];
    if (placement.kind !== "reference") {
      throw new TreeCommandError("Only a reference placement can be unlinked");
    }
    this.remove(placement.key);
  }

  detach(key: NodeKey | PlacementKey): void {
    const state = this.state();
    const placementKey = this.placementKey(key, state);
    const placement = state.placements[placementKey];
    if (placement.externalReference) throw new TreeCommandError("The external target is unavailable for an authored copy");
    if (placement.kind !== "reference") {
      throw new TreeCommandError("Only a reference placement can be detached");
    }
    const next = clone(state);
    const contentMap = new Map<string, string>();

    const copyContent = (sourceContentKey: string): string => {
      const mapped = contentMap.get(sourceContentKey);
      if (mapped) return mapped;
      const source = state.contents[sourceContentKey];
      const copiedKey = createContentKey();
      contentMap.set(sourceContentKey, copiedKey);
      const payload = clone(source.payload);
      if (isAuthoredBlock(source)) payload.id = createBlockId();
      const copied = {
        ...clone(source),
        key: copiedKey,
        payload,
        children: [] as PlacementKey[],
        inlineContent: [] as PlacementKey[],
        ownedRelations: {} as Record<string, PlacementKey>,
        revision: 0,
      };
      next.contents[copiedKey] = copied;
      copied.children = source.children.map(copyPlacement);
      copied.inlineContent = source.inlineContent.map(copyPlacement);
      copied.ownedRelations = Object.fromEntries(
        Object.entries(source.ownedRelations).map(([name, relationKey]) => [
          name,
          copyPlacement(relationKey),
        ]),
      );
      return copiedKey;
    };

    const copyPlacement = (sourcePlacementKey: PlacementKey): PlacementKey => {
      const source = state.placements[sourcePlacementKey];
      const copiedKey = createPlacementKey();
      const contentKey =
        source.kind === "reference" ? source.contentKey : copyContent(source.contentKey);
      next.placements[copiedKey] = {
        key: copiedKey,
        contentKey,
        kind: source.kind,
        ...(source.externalReference ? { externalReference: clone(source.externalReference) } : {}),
      };
      return copiedKey;
    };

    const copiedContentKey = copyContent(placement.contentKey);
    next.placements[placementKey] = {
      ...clone(placement),
      key: placementKey,
      contentKey: copiedContentKey,
      kind: "owned",
    };
    this.pruneUnreachable(next);
    const pairs = [...contentMap].filter(([key]) => isAuthoredBlock(state.contents[key])).map(([source, copy]) => ({
      source: { contentKey: source, blockId: readBlockId(state.contents[source]) },
      copy: { contentKey: copy, blockId: readBlockId(next.contents[copy]) },
    }));
    const ids = new Map(pairs.filter(pair => pair.source.blockId).map(pair => [pair.source.blockId!, pair.copy.blockId!]));
    for (const pair of pairs) remapKnownBlockReferences(next.contents[pair.copy.contentKey].payload, ids);
    this.publish("Detach transclusion", this.diff(state, next), { commandId: "tree.detach", subjects: [this.subject(state, placementKey), this.subject(next, placementKey)], relation: { kind: "copy", pairs } });
  }

  copy(key: NodeKey | PlacementKey, destination: Destination): PlacementKey {
    const state = this.state();
    const placementKey = this.placementKey(key, state);
    // Stage A retains the old command's explicit legacy-export limitations.
    // Copy the canonical graph itself so internal shared identity is preserved.
    encodeDocument(state, placementKey);
    const fragment = cloneBlocks(captureBlocks(state, [placementKey]));
    return this.insertFragment(fragment, destination, { commandId: "tree.copy",
      subjects: [this.subject(state, placementKey), this.subject(fragment.state, fragment.roots[0])],
    })[0];
  }

  insertEmptyStandoffSibling(key: NodeKey | PlacementKey, side: "before" | "after"): PlacementKey {
    const state = this.pending?.draft ?? this.repository.readState();
    const placementKey = this.placementKey(key, state);
    const content = state.contents[state.placements[placementKey].contentKey];
    if (content.inlineKind !== "standoff") throw new TreeCommandError("Expected a Standoff paragraph");
    const location = this.pending ? deriveLocations(state).get(placementKey) : this.repository.locationOf(placementKey);
    if (!location || location.slot.kind !== "children") throw new TreeCommandError("A Standoff relation/root needs an explicit insertion policy");
    const parent = state.contents[location.ownerContentKey];
    const decoded = decodeDetachedSubtree({
      ...clone(content.payload), id: createBlockId(), type: "standoff-editor-block",
      text: "", standoffProperties: [], children: [],
    });
    const children = [...parent.children];
    children.splice(location.index! + (side === "after" ? 1 : 0), 0, decoded.rootPlacementKey);
    this.publish("Insert Standoff paragraph", [
      ...Object.values(decoded.state.contents).map(record => ({ kind: "put-content" as const, record })),
      ...Object.values(decoded.state.placements).map(record => ({ kind: "put-placement" as const, record })),
      { kind: "put-content", record: this.updatedChildren(parent, children) },
    ], { commandId: "tree.insertEmptyStandoffSibling", subjects: [this.subject(decoded.state, decoded.rootPlacementKey)] });
    return decoded.rootPlacementKey;
  }

  splitStandoff(key: NodeKey | PlacementKey, index: number): PlacementKey {
    const state = this.pending?.draft ?? this.repository.readState();
    const placementKey = this.placementKey(key, state);
    const placement = state.placements[placementKey];
    const content = state.contents[placement.contentKey];
    if (content.inlineKind !== "standoff") {
      throw new TreeCommandError("Only Standoff content can be split");
    }
    if (!Number.isInteger(index) || index <= 0 || index >= content.inlineContent.length) {
      throw new TreeCommandError("Boundary splits use ordinary before/after insertion");
    }
    const location = this.pending ? deriveLocations(state).get(placementKey) : this.repository.locationOf(placementKey);
    if (!location || location.slot.kind !== "children") {
      throw new TreeCommandError("A Standoff relation/root needs an explicit split policy");
    }
    const parent = state.contents[location.ownerContentKey];
    const operations: RepositoryOperation[] = [];
    const rightContentKey = createContentKey();
    const rightPlacementKey = createPlacementKey();
    const annotations = (content.payload.standoffProperties as Array<Record<string, unknown>> | undefined) ?? [];
    const leftAnnotations: Array<Record<string, unknown>> = [];
    const rightAnnotations: Array<Record<string, unknown>> = [];
    for (const annotation of annotations) {
      const start = Number(annotation.start);
      const end = Number(annotation.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        leftAnnotations.push(clone(annotation));
      } else if (end < index) {
        leftAnnotations.push(clone(annotation));
      } else if (start >= index) {
        rightAnnotations.push({ ...clone(annotation), start: start - index, end: end - index });
      } else {
        leftAnnotations.push({ ...clone(annotation), end: index - 1 });
        rightAnnotations.push({
          ...clone(annotation),
          id: typeof annotation.id === "string" ? globalThis.crypto.randomUUID() : annotation.id,
          start: 0,
          end: end - index,
        });
      }
    }
    const leftPayload: Record<string, unknown> = { ...clone(content.payload), standoffProperties: leftAnnotations };
    const rightPayload: Record<string, unknown> = { ...clone(content.payload), standoffProperties: rightAnnotations };
    rightPayload.id = createBlockId();
    operations.push({ kind: "put-content", record: {
      ...clone(content),
      payload: leftPayload,
      inlineContent: content.inlineContent.slice(0, index),
      inlineRevision: content.inlineRevision + 1,
      revision: content.revision + 1,
    } });
    operations.push({ kind: "put-content", record: {
      ...clone(content),
      key: rightContentKey,
      payload: rightPayload,
      children: [],
      inlineContent: content.inlineContent.slice(index),
      inlineRevision: 0,
      ownedRelations: {},
      opaqueRelations: {},
      wireChildren: "present",
      wireRelation: "omitted",
      revision: 0,
    } });
    operations.push({ kind: "put-placement", record: {
      key: rightPlacementKey,
      contentKey: rightContentKey,
      kind: "owned",
    } });
    const parentChildren = [...parent.children];
    parentChildren.splice((location.index ?? 0) + 1, 0, rightPlacementKey);
    operations.push({ kind: "put-content", record: this.updatedChildren(parent, parentChildren) });
    const source = this.subject(state, placementKey);
    const created = { contentKey: rightContentKey, placementKey: rightPlacementKey, blockId: String(rightPayload.id) };
    this.publish("Split Standoff Block", operations, { commandId: "tree.splitStandoff", subjects: [source, created], relation: { kind: "split", source, created, at: index } });
    return rightPlacementKey;
  }

  joinStandoff(
    leftKey: NodeKey | PlacementKey,
    rightKey: NodeKey | PlacementKey,
  ): number {
    const state = this.state();
    const leftPlacementKey = this.placementKey(leftKey, state);
    const rightPlacementKey = this.placementKey(rightKey, state);
    const locations = deriveLocations(state);
    const leftLocation = locations.get(leftPlacementKey);
    const rightLocation = locations.get(rightPlacementKey);
    if (
      !leftLocation ||
      !rightLocation ||
      leftLocation.slot.kind !== "children" ||
      rightLocation.slot.kind !== "children" ||
      leftLocation.ownerContentKey !== rightLocation.ownerContentKey ||
      (leftLocation.index ?? -1) + 1 !== rightLocation.index
    ) {
      throw new TreeCommandError("Join requires adjacent ordinary siblings");
    }
    const leftPlacement = state.placements[leftPlacementKey];
    const rightPlacement = state.placements[rightPlacementKey];
    const left = state.contents[leftPlacement.contentKey];
    const right = state.contents[rightPlacement.contentKey];
    if (left.inlineKind !== "standoff" || right.inlineKind !== "standoff") {
      throw new TreeCommandError("Join requires two Standoff Blocks");
    }
    if (right.children.length || Object.keys(right.ownedRelations).length) {
      throw new TreeCommandError("Joining a Standoff Block with attachments needs an explicit policy");
    }
    if (Object.values(state.placements).filter((candidate) => candidate.contentKey === right.key).length !== 1) {
      throw new TreeCommandError("Detach shared right-hand content before joining it");
    }
    const joinIndex = left.inlineContent.length;
    const leftAnnotations = (left.payload.standoffProperties as Array<Record<string, unknown>> | undefined) ?? [];
    const rightAnnotations = ((right.payload.standoffProperties as Array<Record<string, unknown>> | undefined) ?? []).map((annotation) => ({
      ...clone(annotation),
      start: typeof annotation.start === "number" ? annotation.start + joinIndex : annotation.start,
      end: typeof annotation.end === "number" ? annotation.end + joinIndex : annotation.end,
    }));
    const next = clone(state);
    next.contents[left.key] = {
      ...clone(left),
      payload: { ...clone(left.payload), standoffProperties: [...clone(leftAnnotations), ...rightAnnotations] },
      inlineContent: [...left.inlineContent, ...right.inlineContent],
      inlineRevision: left.inlineRevision + 1,
      revision: left.revision + 1,
    };
    const parent = state.contents[leftLocation.ownerContentKey];
    next.contents[parent.key] = this.updatedChildren(
      parent,
      parent.children.filter((candidate) => candidate !== rightPlacementKey),
    );
    // Join explicitly consumes the right definition and transfers its Cells.
    // Membership retention applies to unlink, not to a recorded merge.
    delete next.contents[right.key];
    this.pruneUnreachable(next);
    const survivor = this.subject(state, leftPlacementKey), absorbed = this.subject(state, rightPlacementKey);
    this.publish("Join Standoff Blocks", this.diff(state, next), { commandId: "tree.joinStandoff", subjects: [survivor, absorbed], relation: { kind: "join", survivor, absorbed, at: joinIndex } });
    return joinIndex;
  }

  insertInlineImage(
    key: NodeKey | PlacementKey,
    index: number,
    descriptor: InlineImageDescriptor,
  ): PlacementKey {
    const state = this.state();
    const hostPlacement = state.placements[this.placementKey(key, state)];
    const host = state.contents[hostPlacement.contentKey];
    if (host.inlineKind !== "standoff") {
      throw new TreeCommandError("Inline images require a Standoff host");
    }
    if (index < 0 || index > host.inlineContent.length) {
      throw new TreeCommandError(`Invalid inline insertion index ${index}`);
    }
    const imageContentKey = createContentKey();
    const imagePlacementKey = createPlacementKey();
    const inlineContent = [...host.inlineContent];
    inlineContent.splice(index, 0, imagePlacementKey);
    this.publish("Insert inline image", [
      {
        kind: "put-content",
        record: {
          key: imageContentKey,
          viewType: "image-cell",
          payload: clone(descriptor) as unknown as Record<string, unknown>,
          children: [],
          inlineContent: [],
          inlineRevision: 0,
          ownedRelations: {},
          opaqueRelations: {},
          wireChildren: "omitted",
          wireRelation: "omitted",
          revision: 0,
        },
      },
      {
        kind: "put-placement",
        record: { key: imagePlacementKey, contentKey: imageContentKey, kind: "inline" },
      },
      {
        kind: "put-content",
        record: {
          ...clone(host),
          inlineContent,
          inlineRevision: host.inlineRevision + 1,
          revision: host.revision + 1,
        },
      },
    ], { commandId: "tree.insertInlineImage", subjects: [this.subject(state, hostPlacement.key), { contentKey: imageContentKey, placementKey: imagePlacementKey }] });
    return imagePlacementKey;
  }

  moveInline(
    key: NodeKey | PlacementKey,
    fromIndex: number,
    toIndex: number,
  ): void {
    const state = this.state();
    const hostPlacement = state.placements[this.placementKey(key, state)];
    const host = state.contents[hostPlacement.contentKey];
    const sequence = [...host.inlineContent];
    if (fromIndex < 0 || fromIndex >= sequence.length) throw new TreeCommandError("Invalid inline source index");
    const [moving] = sequence.splice(fromIndex, 1);
    if (toIndex < 0 || toIndex > sequence.length) throw new TreeCommandError("Invalid inline destination index");
    sequence.splice(toIndex, 0, moving);
    this.publish("Move inline item", [
      {
        kind: "put-content",
        record: {
          ...clone(host),
          inlineContent: sequence,
          inlineRevision: host.inlineRevision + 1,
          revision: host.revision + 1,
        },
      },
    ], { commandId: "tree.moveInline", subjects: [this.subject(state, hostPlacement.key)] });
  }

  updateInlineImage(
    key: NodeKey | PlacementKey,
    patch: Partial<InlineImageDescriptor>,
  ): void {
    const state = this.state();
    const placement = state.placements[this.placementKey(key, state)];
    const content = state.contents[placement.contentKey];
    if (content.viewType !== "image-cell") throw new TreeCommandError("The inline item is not an image");
    this.publish("Update inline image", [
      {
        kind: "put-content",
        record: {
          ...clone(content),
          payload: { ...clone(content.payload), ...clone(patch) },
          revision: content.revision + 1,
        },
      },
    ], { commandId: "tree.updateInlineImage", subjects: [this.subject(state, placement.key)] });
  }

  setBackground(
    key: NodeKey | PlacementKey,
    descriptor: ExistingBlockDto,
  ): PlacementKey {
    const state = this.state();
    const currentPlacement = state.placements[this.placementKey(key, state)];
    const current = state.contents[currentPlacement.contentKey];
    const currentType = String(current.payload.type ?? current.viewType);
    const nextType = String(descriptor.type ?? "");
    const types = ["image-background-block", "video-background-block", "youtube-video-background-block", "canvas-background-block"];
    if (!types.includes(currentType) || !types.includes(nextType)) {
      throw new TreeCommandError("Background replacement requires two background descriptors");
    }
    // A background is a descriptor of a stable surface, including when it is
    // the root. Never replace the content identity or discard owned relations.
    const { children: _children, relation: _relation, ...payload } = clone(descriptor);
    if (payload.id !== undefined && payload.id !== current.payload.id) throw new TreeCommandError("A background descriptor cannot change the surface identity");
    if (payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)) {
      payload.metadata = { ...(current.payload.metadata as Record<string, unknown> ?? {}), ...payload.metadata };
    }
    this.publish("Change Background", [{ kind: "put-content", record: {
      ...clone(current), viewType: nextType,
      payload: { ...clone(current.payload), ...payload }, revision: current.revision + 1,
    } }], { commandId: "tree.setBackground", subjects: [this.subject(state, currentPlacement.key)] });
    return currentPlacement.key;
  }
}
