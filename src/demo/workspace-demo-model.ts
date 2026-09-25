import type { ExistingBlockDto } from "../block-tree/types";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerApplicationViews } from "../application/features";
import manuscriptUrl from "../assets/hosted/demo/medieval-template.jpg";
import embeddedPageUrl from "../assets/hosted/demo/embedded-page.html?url";
import { workspaceBuilderTypes, workspaceDocumentFixture } from "./workspace-document";
import type { ReactiveEditorConfiguration } from "../configuration";

export function walkDemoBlocks(block: ExistingBlockDto): ExistingBlockDto[] {
  const relations = Object.values(block.relation ?? {}).filter(
    (value): value is ExistingBlockDto => !!value && typeof value === "object" && "type" in value,
  );
  return [block, ...(block.children ?? []).flatMap(walkDemoBlocks), ...relations.flatMap(walkDemoBlocks)];
}

export const demoSourceCounts = Object.freeze({
  blocks: walkDemoBlocks(workspaceDocumentFixture).length,
  types: new Set(walkDemoBlocks(workspaceDocumentFixture).map((block) => block.type)).size,
});

export function createWorkspaceDemoDocument(): ExistingBlockDto {
  const document = structuredClone(workspaceDocumentFixture);
  walkDemoBlocks(document).forEach((block, index) => {
    block.id = `workspace-demo-${index}`;
    const metadata = { ...(block.metadata as Record<string, unknown> | undefined) };
    if (block.type === "document-block") metadata.name = "Workspace sample document";
    if (block.type === "document-tab-block") {
      metadata.name ??= (block.children?.[0]?.metadata as Record<string, unknown> | undefined)?.name;
    }
    // Retain the original links, but keep initial loading independent of remote hosts.
    if (block.type === "image-block") {
      metadata.originalUrl = metadata.url;
      metadata.url = manuscriptUrl;
      metadata.alt = "Manuscript sample from the project's existing local assets";
    }
    if (block.type === "iframe-block") {
      metadata.originalUrl = metadata.url;
      metadata.url = embeddedPageUrl;
      metadata.title = "Local embedded document sample";
    }
    block.metadata = metadata;
  });
  return document;
}

export function assertWorkspaceTypes(editor: ReactiveEditor, document: ExistingBlockDto): void {
  const types = new Set([
    "universe-block",
    ...workspaceBuilderTypes,
    ...walkDemoBlocks(document).map((block) => block.type ?? "unknown-block"),
  ]);
  const missing = [...types].filter((type) => typeof editor.registry.resolve(type)?.view !== "function");
  if (missing.length) throw new Error(`Missing workspace Block views: ${missing.join(", ")}`);
}

export function createWorkspaceDemoEditor(configuration: ReactiveEditorConfiguration = {}): ReactiveEditor {
  const document = createWorkspaceDemoDocument();
  const editor = createWorkspaceEditor(document, configuration);
  assertWorkspaceTypes(editor, document);
  return editor;
}

export function createWorkspaceEditor(document: ExistingBlockDto, configuration: ReactiveEditorConfiguration = {}): ReactiveEditor {
  const editor = new ReactiveEditor(document, configuration);
  registerApplicationViews(editor);
  return editor;
}
