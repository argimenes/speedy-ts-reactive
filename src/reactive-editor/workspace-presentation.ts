import { createSignal } from "solid-js";
import type { ExistingBlockDto } from "../block-tree/types";

export interface WorkspaceObject {
  id: string;
  target: ({ kind: "block"; blockId: string } | { kind: "document"; documentId: string }) & Record<string, unknown>;
  label?: string;
  desktopHostBlockId?: string;
  [key: string]: unknown;
}
export interface CanvasBounds { x: number; y: number; width: number; height: number; [key: string]: unknown }
export interface CanvasCamera { x: number; y: number; zoom: number; [key: string]: unknown }
export interface CanvasLayout {
  version: 1;
  camera: CanvasCamera;
  placements: Array<{ id: string; objectId: string; bounds: CanvasBounds; order: number; [key: string]: unknown }>;
  background?: { type: string; metadata: Record<string, unknown>; [key: string]: unknown };
  [key: string]: unknown;
}
export interface WorkspacePresentation {
  version: 1;
  active: string;
  objects: WorkspaceObject[];
  presentations: {
    desktop?: { version: 1; kind: "legacy-tree"; [key: string]: unknown };
    canvas?: CanvasLayout;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
export interface PresentationSnapshot { revision: number; present: boolean; value?: unknown }
export type PresentationRead =
  | { status: "absent" }
  | { status: "valid"; value: WorkspacePresentation }
  | { status: "opaque"; reason: string };

function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, any>;
}
function id(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Expected a nonempty identity.");
}
function number(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("Invalid presentation geometry.");
}
function point(value: Record<string, any>) { number(value.x, -1e9, 1e9); number(value.y, -1e9, 1e9); }
function bounds(value: unknown) { const b = record(value); point(b); number(b.width, 1, 1e6); number(b.height, 1, 1e6); }
function camera(value: unknown) { const c = record(value); point(c); number(c.zoom, .05, 16); }

/** Validate known v1 data without stripping future fields. Missing live targets
 * are resolution issues, not a reason to discard saved placements. */
export function validateWorkspacePresentation(value: unknown): WorkspacePresentation {
  const root = record(value);
  if (root.version !== 1) throw new Error("Unsupported workspace presentation version.");
  id(root.active);
  if (!Array.isArray(root.objects)) throw new Error("Expected a workspace object directory.");
  const objects = new Set<string>();
  for (const item of root.objects) {
    const object = record(item); id(object.id);
    if (objects.has(object.id)) throw new Error(`Duplicate workspace object ${object.id}.`);
    objects.add(object.id);
    const target = record(object.target);
    if (target.kind === "block") id(target.blockId);
    else if (target.kind === "document") id(target.documentId);
    else throw new Error("Unsupported workspace object target.");
    if (object.label !== undefined && typeof object.label !== "string") throw new Error("Invalid object label.");
    if (object.desktopHostBlockId !== undefined) id(object.desktopHostBlockId);
  }
  const presentations = record(root.presentations);
  if (presentations.desktop !== undefined) {
    const desktop = record(presentations.desktop);
    if (desktop.version !== 1 || desktop.kind !== "legacy-tree") throw new Error("Unsupported Desktop layout.");
  }
  if (presentations.canvas !== undefined) {
    const canvas = record(presentations.canvas);
    if (canvas.version !== 1) throw new Error("Unsupported Canvas layout version.");
    camera(canvas.camera);
    if (!Array.isArray(canvas.placements)) throw new Error("Expected Canvas placements.");
    const placements = new Set<string>(), placedObjects = new Set<string>();
    for (const value of canvas.placements) {
      const placement = record(value); id(placement.id); id(placement.objectId);
      if (placements.has(placement.id)) throw new Error(`Duplicate Canvas placement ${placement.id}.`);
      if (!objects.has(placement.objectId)) throw new Error(`Unknown directory object ${placement.objectId}.`);
      if (placedObjects.has(placement.objectId)) throw new Error("Multiple Canvas occurrences of an object are not supported.");
      placements.add(placement.id); placedObjects.add(placement.objectId);
      bounds(placement.bounds); number(placement.order, -1e9, 1e9);
      if (!Number.isInteger(placement.order)) throw new Error("Canvas order must be an integer.");
    }
    if (canvas.background !== undefined) {
      const background = record(canvas.background); id(background.type); record(background.metadata);
    }
  }
  if (!Object.hasOwn(presentations, root.active)) throw new Error("The saved active presentation has no layout.");
  return structuredClone(root) as WorkspacePresentation;
}

export function readWorkspacePresentation(root: ExistingBlockDto): PresentationRead {
  const metadata = root.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || !Object.hasOwn(metadata, "workspacePresentation")) return { status: "absent" };
  try { return { status: "valid", value: validateWorkspacePresentation((metadata as Record<string, unknown>).workspacePresentation) }; }
  catch (error) { return { status: "opaque", reason: error instanceof Error ? error.message : String(error) }; }
}

/** Merge only the captured sidecar into an already encoded workspace root. */
export function withWorkspacePresentation(root: ExistingBlockDto, snapshot?: PresentationSnapshot): ExistingBlockDto {
  if (!snapshot?.present) return root;
  const metadata = root.metadata && typeof root.metadata === "object" && !Array.isArray(root.metadata) ? root.metadata : {};
  return { ...root, metadata: { ...metadata, workspacePresentation: structuredClone(snapshot.value) } };
}

/** Session-owned, deliberately limited state. No editor, observers, registry,
 * repository writes or history enrollment. Unknown envelopes stay read-only. */
export class WorkspacePresentationState {
  private readonly revisionSignal = createSignal(0);
  private readonly savedSignal = createSignal(0);
  private value?: unknown;
  private present: boolean;
  private readonly readStatus: PresentationRead;
  private disposed = false;

  constructor(root: ExistingBlockDto, readonly enabled: boolean) {
    this.readStatus = readWorkspacePresentation(root);
    this.present = this.readStatus.status !== "absent";
    if (this.present) this.value = structuredClone((root.metadata as Record<string, unknown>).workspacePresentation);
  }
  revision() { return this.revisionSignal[0](); }
  dirty() { return this.revision() !== this.savedSignal[0](); }
  issue(): string | undefined {
    if (this.readStatus.status === "opaque") return `${this.readStatus.reason} Presentation data was preserved; Desktop is shown.`;
    const active = this.read()?.active;
    if (active !== undefined && active !== "desktop") return "The saved presentation is not available in this build. Its layout and preference were preserved; Desktop is shown.";
  }
  read(): WorkspacePresentation | undefined {
    this.revision();
    if (!this.present || this.readStatus.status === "opaque") return;
    return structuredClone(this.value) as WorkspacePresentation;
  }
  capture(): PresentationSnapshot {
    if (this.disposed) throw new Error("Workspace presentation session is disposed.");
    return { revision: this.revision(), present: this.present, ...(this.present ? { value: structuredClone(this.value) } : {}) };
  }
  markSaved(snapshot: PresentationSnapshot) {
    if (!this.disposed && snapshot.revision === this.revision()) this.savedSignal[1](snapshot.revision);
  }
  private commit(value: WorkspacePresentation) {
    if (this.disposed) throw new Error("Workspace presentation session is disposed.");
    if (!this.enabled) throw new Error("Canvas workspace state is disabled.");
    if (this.readStatus.status === "opaque") throw new Error("Cannot edit unsupported presentation data.");
    const validated = validateWorkspacePresentation(value);
    if (this.present && JSON.stringify(validated) === JSON.stringify(this.value)) return;
    this.value = validated; this.present = true;
    this.revisionSignal[1](n => n + 1);
  }
  /** C supplies a validated derivation later. B does not discover/assign IDs or
   * generate layouts, and an existing layout can never be overwritten here. */
  initializeCanvas(objects: WorkspaceObject[], canvas: CanvasLayout) {
    const value = this.read();
    if (value?.presentations.canvas !== undefined) throw new Error("Canvas layout already exists.");
    if (value && value.objects.length) throw new Error("Initialize Canvas must not replace an existing object directory.");
    this.commit({ ...(value ?? { version: 1, active: "desktop", presentations: { desktop: { version: 1, kind: "legacy-tree" } } }), objects, presentations: { ...(value?.presentations ?? { desktop: { version: 1, kind: "legacy-tree" } }), canvas } });
  }
  setCamera(next: CanvasCamera) {
    const value = this.read();
    if (!value?.presentations.canvas) throw new Error("Canvas layout does not exist.");
    value.presentations.canvas.camera = { ...value.presentations.canvas.camera, ...next };
    this.commit(value);
  }
  setBounds(placementId: string, next: CanvasBounds) {
    const value = this.read(), placement = value?.presentations.canvas?.placements.find(item => item.id === placementId);
    if (!placement || !value) throw new Error("Canvas placement does not exist.");
    placement.bounds = { ...placement.bounds, ...next };
    this.commit(value);
  }
  dispose() { this.disposed = true; }
}
