// @vitest-environment jsdom
import { expect, it } from "vitest";
import { WorkspaceSession } from "./workspace-session";
import { materializeLocalWorkspace } from "../reactive-editor/workspace-manifest";
import { spatialDocumentPreview } from "./spatial-document-preview";
const documentDto = { id: "doc", type: "document-block", metadata: { documentId: "doc", title: "Mountain notebook" }, children: [
  { id: "heading", type: "standoff-editor-block", text: "At the lake", blockProperties: [{ type: "block/font/size/h2" }] },
  { id: "body", type: "plain-text-block", text: "The lights reflected in the water." },
  { id: "photo", type: "image-block", metadata: { url: "/lake.jpg", alt: "Lake at night" } },
] };
function open(doc = documentDto) { return new WorkspaceSession(materializeLocalWorkspace({ type: "workspace-block", children: ["one", "two"].map(id => ({ id, type: "document-window-block", children: [structuredClone(doc)] })) }), { features: { spatialWorkspace: true, canvasWorkspace: true } }); }
it("uses bounded actual text/headings/images, shares a digest and refreshes only at desk boundaries", () => {
  const s = open(); try {
    s.selectPresentation("spatial"); const a = s.spatial!, objects = a.objects(), before = objects[0].preview!;
    expect(before.title).toBe("Mountain notebook"); expect(before.blocks).toEqual([
      { kind: "text", text: "At the lake", heading: 2 }, { kind: "text", text: "The lights reflected in the water." }, { kind: "image", url: "/lake.jpg", alt: "Lake at night" },
    ]);
    expect(objects[1].preview).toBe(before);
    expect(a.document.activate(objects[0].id)).toBe(true);
    const body = Object.values(s.projection.state.nodes).find(n => n.payload.id === "body")!;
    s.editor.commands.setPayloadField(body.key, "text", "A new observation.");
    expect(a.objects()[0].preview).toBe(before); expect(a.objects()[1].preview).toBe(before);
    a.document.release(); const next = a.objects()[0].preview!;
    expect(next).not.toBe(before); expect(next.blocks[1]).toEqual({ kind: "text", text: "A new observation." }); expect(a.objects()[1].preview).toBe(next);
    const saved = JSON.stringify(s.editor.persistence.captureWorkspace().document); expect(saved).not.toContain('"preview"');
    s.selectPresentation("desktop"); s.editor.commands.setPayloadField(body.key, "text", "Desktop observation."); s.selectPresentation("spatial");
    expect(a.objects()[0].preview!.blocks[1]).toEqual({ kind: "text", text: "Desktop observation." });
  } finally { s.dispose(); }
});
it("caps large documents and skips unsafe image URLs without evaluating authored markup", () => {
  const s = open({ ...documentDto, children: Array.from({ length: 50 }, (_, i) => ({ id: "p" + i, type: "plain-text-block", text: "<script>not HTML</script>".repeat(1000) })) } as typeof documentDto);
  try {
    const state = s.editor.repository.state, root = Object.values(state.contents).find(c => c.payload.id === "doc")!;
    const preview = spatialDocumentPreview(state, root, "Fallback");
    expect(preview.truncated).toBe(true); expect(preview.blocks).toHaveLength(1); expect(preview.blocks[0].kind === "text" && preview.blocks[0].text.length).toBe(6000);
  } finally { s.dispose(); }
});
