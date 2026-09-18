// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { queryDurableSubtree } from "../durable-core";
import { HistoricalPreview } from "../../rendering/block-history";
import { captureFixture } from "./fixture";
import { compactPreview } from "./preview";
import { CompactPreviewView } from "./preview-view";
describe("compact display projection (never replay authority)", () => {
  it("matches existing inert preview markup for Unicode/annotations, containers, placeholders and statuses", () => {
    const f = captureFixture({ id: "doc", type: "document-block", children: [
      { id: "p", type: "standoff-editor-block", text: "a🙂<b>", standoffProperties: [{ type: "style/bold", start: 0, end: 2 }, { type: "style/italics", start: 1, end: 3 }] },
      { id: "empty", type: "plain-text-block", text: "" }, { id: "timer", type: "timer-block" },
    ] });
    for (const result of [queryDurableSubtree(f.baseline, { blockId: "doc", revisionId: "baseline" }),
      ...(["unknown-block", "unplaced", "ambiguous-occurrence", "incomplete"] as const).map(status => ({ status, blockId: "missing", revisionId: "baseline" } as const))]) {
      const left = document.createElement("div"), right = document.createElement("div"), model = compactPreview(result);
      const a = render(() => <HistoricalPreview result={result} />, left), b = render(() => <CompactPreviewView value={model} />, right);
      expect(right.innerHTML.replace(/<!--.*?-->/gs, "")).toBe(left.innerHTML.replace(/<!--.*?-->/gs, ""));
      expect(Object.isFrozen(model)).toBe(true); expect(model).not.toHaveProperty("fragment"); a(); b();
    }
  });
});
