import type { ExistingBlockDto } from "../types";

/** Authored wire fixture; deliberately independent of any feature implementation. */
export const unknownFeatureDocument: ExistingBlockDto = {
  id: "portable-document", type: "document-block", children: [
    { id: "ordinary-text", type: "standoff-editor-block", text: "Ordinary text", standoffProperties: [{ id: "unknown-property", type: "future/effect", start: 0, end: 7, metadata: { retain: true } }] },
    { id: "portable-timer", type: "timer-block", timer: { durationSeconds: 301, mode: "paused", remainingMilliseconds: 123456, futureSetting: { preserve: [1, null, "yes"] } },
      metadata: { name: "My timer", unknown: true },
      blockProperties: [{ type: "block/size", metadata: { width: 147, height: 133 } }, { type: "block/position", metadata: { x: 37, y: 81, position: "fixed" } }, { type: "future/property", value: "keep" }],
      children: [{ id: "timer-child", type: "plain-text-block", text: "Preserve nested data" }],
      relation: { future: { opaque: ["retain", 42] } },
    },
  ],
};
