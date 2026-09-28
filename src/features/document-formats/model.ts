import type { ExistingBlockDto } from "../../block-tree/types";

/** A bounded set of starting arrangements, not a template registry. */
export const documentFormats = [
  { id: "page", label: "Page Document", template: "blank", theme: "default", width: 840, height: 620 },
  { id: "simple", label: "Simple Document", template: "blank", theme: "plain", width: 640, height: 520 },
  { id: "sticky-note", label: "Sticky Note", template: "blank", theme: "butter", width: 340, height: 340 },
  { id: "journal", label: "Journal", template: "lined-journal", theme: "cream-paper", width: 720, height: 660 },
  { id: "diary", label: "Diary", template: "dated-entry", theme: "rose-paper", width: 660, height: 620 },
  { id: "letter", label: "Letter", template: "correspondence", theme: "ivory", width: 740, height: 700 },
  { id: "card", label: "Card", template: "index-card", theme: "cream-paper", width: 580, height: 380 },
  { id: "notebook", label: "Notebook", template: "three-sections", theme: "sage", width: 760, height: 640 },
  { id: "framed", label: "Framed Document", template: "illuminated-manuscript", theme: "parchment", width: 780, height: 700 },
] as const;
export type DocumentFormat = typeof documentFormats[number]["id"];
export type DocumentFormatMetadata = { version: 1; format: DocumentFormat; template: string; theme: string };

export function readDocumentFormat(metadata: unknown): DocumentFormatMetadata | undefined {
  const value = (metadata as { documentFormat?: DocumentFormatMetadata } | undefined)?.documentFormat;
  return value?.version === 1 && documentFormats.some(item => item.id === value.format) ? value : undefined;
}

/** Initial host geometry only; saved workspace geometry remains authoritative. */
export function documentFormatPresentation(metadata: unknown) {
  const format = readDocumentFormat(metadata);
  const definition = documentFormats.find(item => item.id === format?.format);
  return definition ? { size: { w: definition.width, h: definition.height },
    windowType: definition.id === "sticky-note" ? "window-block" : "document-window-block" } : undefined;
}

export function createFormattedDocument(format: DocumentFormat = "page", now = new Date()) {
  const definition = documentFormats.find(item => item.id === format);
  if (!definition) throw new Error("Unknown Document format.");
  const text = (value = "", heading = false): ExistingBlockDto => ({ id: crypto.randomUUID(), type: "standoff-editor-block", text: value,
    ...(heading ? { blockProperties: [{ type: "block/font/size", value: "h3" }] } : {}) });
  const date = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(now);
  let children: ExistingBlockDto[] = [text()];
  switch (format) {
    case "journal": children = [text("Journal", true), { id: crypto.randomUUID(), type: "container-block", children: [text()] }]; break;
    case "diary": children = [text(date, true), text()]; break;
    case "letter": children = [text(date), text("Recipient name\nAddress"), text("Dear …,"), text(), text("With best wishes,"), text("Your name")]; break;
    case "card": children = [text("Untitled card", true), text()]; break;
    case "notebook": children = [{ id: crypto.randomUUID(), type: "document-tab-row-block", children: ["Notes", "Ideas", "References"].map((name, index) => ({
      id: crypto.randomUUID(), type: "document-tab-block", metadata: { name, active: index === 0 }, children: [text(name, true), text()],
    })) }]; break;
    case "framed": children = [text("A book of small wonders", true), text("Here begins a place for observations, stories, and things worth keeping."), text()]; break;
  }
  const id = crypto.randomUUID();
  const document: ExistingBlockDto = { id, type: "document-block", metadata: { documentId: id, folder: ".", filename: `${id}.json`,
    documentFormat: { version: 1, format, template: definition.template, theme: definition.theme } satisfies DocumentFormatMetadata }, children };
  return { document, title: format === "page" ? "Untitled document" : definition.label,
    size: { w: definition.width, h: definition.height },
    // The existing plain Window supports small notes without Document chrome/minimum width.
    windowType: format === "sticky-note" ? "window-block" : "document-window-block" };
}
