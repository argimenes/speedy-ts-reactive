import type { ExistingBlockDto, NodeKey } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";

export const DEFAULT_TIMER_SECONDS = 5 * 60;
export const MAX_TIMER_SECONDS = 24 * 60 * 60;
export const DEFAULT_TIMER_SIZE = 130;
export const MIN_TIMER_SIZE = 110;

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

export function timerBlockDto(position?: { x: number; y: number }): ExistingBlockDto {
  return {
    id: crypto.randomUUID(),
    type: "timer-block",
    timer: { durationSeconds: DEFAULT_TIMER_SECONDS, mode: "idle", remainingMilliseconds: DEFAULT_TIMER_SECONDS * 1000 },
    blockProperties: [
      { type: "block/size", metadata: { width: DEFAULT_TIMER_SIZE, height: DEFAULT_TIMER_SIZE, "min-width": MIN_TIMER_SIZE } },
      ...(position ? [{ type: "block/position", metadata: { ...position, position: "fixed" } }] : []),
    ],
  };
}

function initialPosition(editor: ReactiveEditor, originKey: NodeKey) {
  const rect = editor.mounts.get(originKey)?.root.getBoundingClientRect();
  if (!rect) return { x: 24, y: 80 };
  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
  return {
    x: Math.max(8, Math.min(rect.left - DEFAULT_TIMER_SIZE, viewportWidth - DEFAULT_TIMER_SIZE - 8)),
    y: Math.max(8, Math.min(rect.top, viewportHeight - DEFAULT_TIMER_SIZE - 8)),
  };
}

/** Adds a persistent timer beside the origin in the model and anchors its floating view to the origin on screen. */
export function createTimerBlock(editor: ReactiveEditor, originKey: NodeKey): string | undefined {
  let origin = editor.node(originKey);
  if (!origin) return;
  const position = initialPosition(editor, origin.key);
  if (origin.viewType === "document-window-block") {
    const document = origin.children.find(key => editor.node(key)?.viewType === "document-block");
    if (document) origin = editor.node(document)!;
  }
  const viewId = origin.viewId;
  let placement: string;
  if (origin.viewType === "document-block") placement = editor.commands.insert(timerBlockDto(position), { kind: "at", parentKey: origin.key, index: origin.children.length });
  else placement = editor.commands.insert(timerBlockDto(position), { kind: "after", anchorKey: origin.key });
  queueMicrotask(() => {
    const timer = editor.nodeForPlacementInView(placement, viewId);
    if (timer) editor.focus.request(timer.key, { reason: "create-timer" });
  });
  return placement;
}
