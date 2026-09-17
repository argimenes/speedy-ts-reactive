import type { ExistingBlockDto } from "../types";
import type { PortableDocument } from "./codec";

export const legacyTree: ExistingBlockDto = {
  id: "doc", type: "document-block", metadata: { title: "Portable fixture" },
  linkedAnnotations: { emphasis: { type: "style/bold", value: "bold" } },
  children: [
    { id: "left", type: "container-block", children: [
      { id: "paragraph", type: "standoff-editor-block", text: "A😀é漢\n", children: null,
        standoffProperties: [{ id: "annotation", annotationId: "emphasis", start: 1, end: 3 }],
        relation: { leftMargin: { id: "margin", type: "left-margin-block", children: [
          { id: "note", type: "plain-text-block", text: "Margin", relation: null },
        ] }, opaque: { id: "not-a-reference", data: [null, false, 7] } },
      },
    ] },
    { id: "right", type: "container-block", children: [] },
  ],
};

/** Definitions deliberately appear out of traversal order. IDs are opaque strings. */
export const sharedContainer: PortableDocument = {
  format: "codex-portable-document-spike", version: 1, resourceId: "resource-shared",
  root: { placementId: "root", blockId: "doc", kind: "owned" },
  blocks: [
    { id: "paragraph", type: "standoff-editor-block", properties: {}, inline: [
      { kind: "text", text: "😀é" },
      { kind: "image", properties: { assetId: "image-1", src: "/asset.png", alt: "Image", width: 20, custom: { caption: "Kept" } } },
      { kind: "text", text: " tail" },
    ] },
    { id: "doc", type: "document-block", properties: {}, children: [
      { placementId: "container-original", blockId: "container", kind: "owned" },
      { placementId: "container-reference", blockId: "container", kind: "reference" },
    ] },
    { id: "container", type: "container-block", properties: {}, children: [
      { placementId: "shared-child-edge", blockId: "paragraph", kind: "owned" },
    ] },
  ],
};
