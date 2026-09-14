import type { ExistingBlockDto, NodeKey } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";

export const DEFAULT_TIMER_SECONDS = 5 * 60;
export const MAX_TIMER_SECONDS = 24 * 60 * 60;

export type TimerMode = "idle" | "running" | "paused";
export interface TimerPayload {
  durationSeconds: number;
  mode: TimerMode;
  runningUntil?: number;
  remainingMilliseconds?: number;
}

const boundedSeconds = (value: unknown) => Math.max(1, Math.min(MAX_TIMER_SECONDS, Math.round(Number(value) || DEFAULT_TIMER_SECONDS)));

export function readTimerPayload(value: unknown): TimerPayload {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const durationSeconds = boundedSeconds(raw.durationSeconds);
  if (raw.mode === "running" && typeof raw.runningUntil === "number" && Number.isFinite(raw.runningUntil) && raw.runningUntil > 0) {
    return { durationSeconds, mode: "running", runningUntil: raw.runningUntil };
  }
  if (raw.mode === "paused") {
    const remaining = typeof raw.remainingMilliseconds === "number" ? raw.remainingMilliseconds : Number.NaN;
    return { durationSeconds, mode: "paused", remainingMilliseconds: Number.isFinite(remaining) ? Math.max(0, Math.min(durationSeconds * 1000, Math.round(remaining))) : durationSeconds * 1000 };
  }
  return { durationSeconds, mode: "idle", remainingMilliseconds: durationSeconds * 1000 };
}

export function timerBlockDto(): ExistingBlockDto {
  return {
    id: crypto.randomUUID(),
    type: "timer-block",
    timer: { durationSeconds: DEFAULT_TIMER_SECONDS, mode: "idle", remainingMilliseconds: DEFAULT_TIMER_SECONDS * 1000 },
    blockProperties: [{ type: "block/size", metadata: { width: 260, height: 260, "min-width": 210 } }],
  };
}

function emptyReplaceableText(editor: ReactiveEditor, key: NodeKey) {
  const node = editor.node(key);
  if (!node || node.children.length || Object.keys(node.ownedRelations).length) return false;
  if (node.viewType === "standoff-editor-block") return node.inlineContent.length === 0;
  return node.viewType === "plain-text-block" && String(node.payload.text ?? "") === "";
}

/** Replaces a genuinely empty text Block; otherwise inserts beside the origin. */
export function createTimerBlock(editor: ReactiveEditor, originKey: NodeKey): string | undefined {
  let origin = editor.node(originKey);
  if (!origin) return;
  if (origin.viewType === "document-window-block") {
    const document = origin.children.find(key => editor.node(key)?.viewType === "document-block");
    if (document) origin = editor.node(document)!;
  }
  const viewId = origin.viewId;
  let placement: string;
  if (emptyReplaceableText(editor, origin.key)) placement = editor.commands.replace(origin.key, timerBlockDto(), "replace");
  else if (origin.viewType === "document-block") placement = editor.commands.insert(timerBlockDto(), { kind: "at", parentKey: origin.key, index: origin.children.length });
  else placement = editor.commands.insert(timerBlockDto(), { kind: "after", anchorKey: origin.key });
  queueMicrotask(() => {
    const timer = editor.nodeForPlacementInView(placement, viewId);
    if (timer) editor.focus.request(timer.key, { reason: "create-timer" });
  });
  return placement;
}
