import { ErrorBoundary, Show, onCleanup } from "solid-js";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { CodexFeature } from "../feature-api";
import { PhosphorView } from "../features/phosphor/view";
import {
  chars,
  newDocument,
  validate,
  readSettings,
  TAG,
  type ScreenData,
  type Mark,
} from "../features/phosphor/model";
import type { PhosphorPort } from "../features/phosphor/port";
import { nativeDocumentSession } from "../persistence/native-session";
import {
  createDocumentVaults,
  type DocumentVaultLease,
} from "./document-vault";
import { sqliteIndexLifecycle } from "./sqlite-index-lifecycle";
import { entityService, registerEntityContext } from "./entity-service";

export function openPhosphor(
  editor: ReactiveEditor,
  example: Parameters<typeof newDocument>[0] = "blank",
  documentPlacement?: string,
) {
  const root = editor.repository.state.rootPlacementKey,
    state = editor.repository.readState(),
    host = state.contents[state.placements[root].contentKey];
  if (host.viewType !== "workspace-block")
    throw Error("Open Phosphor from the Mutable workspace.");
  const desktop =
    host.children.find((k) =>
      [
        "image-background-block",
        "canvas-background-block",
        "video-background-block",
        "youtube-video-background-block",
      ].includes(state.contents[state.placements[k].contentKey].viewType),
    ) ?? root;
  let doc = documentPlacement,
    resourceId = "";
  editor.commands.transaction("Open Phosphor", () => {
    const bank =
      host.children.find(
        (k) =>
          state.contents[state.placements[k].contentKey].viewType ===
          "workspace-object-bank-block",
      ) ??
      editor.commands.insert(
        {
          id: crypto.randomUUID(),
          type: "workspace-object-bank-block",
          children: [],
        },
        {
          kind: "at",
          parentKey: root,
          index: editor.commands.childrenOf(root).length,
        },
      );
    if (!doc) {
      const dto = newDocument(example);
      resourceId = String(dto.id);
      doc = editor.commands.insert(dto, {
        kind: "at",
        parentKey: bank,
        index: editor.commands.childrenOf(bank).length,
      });
    }
    const win = editor.commands.insert(
      {
        id: crypto.randomUUID(),
        type: "window-block",
        metadata: {
          title: "Phosphor",
          position: { x: 28, y: 30 },
          size: { w: 1260, h: 820 },
          zIndex:
            Math.max(
              0,
              ...Object.values(state.contents).map(
                (c) => Number((c.payload.metadata as any)?.zIndex) || 0,
              ),
            ) + 1,
        },
        children: [],
      },
      { kind: "at", parentKey: desktop, index: 0 },
    );
    editor.commands.transclude(doc!, { kind: "at", parentKey: win, index: 0 });
  });
  if (resourceId) nativeDocumentSession(editor).trackCandidate(resourceId);
}
export function phosphorPort(
  editor: ReactiveEditor,
  key: string,
): PhosphorPort {
  const native = nativeDocumentSession(editor),
    policy = () => ({
      version: 1 as const,
      opaqueTypes: editor.registry.typesWithCapability("opaque-widget"),
    });
  const node = () => editor.node(key)!;
  const textNode = () => {
    const n = node();
    if (!n || n.children.length !== 1)
      throw Error("Unsupported Screen structure. Content has been preserved.");
    const child = editor.node(n.children[0]);
    if (
      child?.viewType !== "standoff-editor-block" ||
      child.inlineContent.some((k) => editor.node(k)?.viewType !== "text-cell")
    )
      throw Error(
        "This Screen requires a plain character text Block. Content has been preserved.",
      );
    return child;
  };
  const document = () =>
    editor.blockQueries
      .ancestors(key)
      .find((n) => n.viewType === "document-block")!;
  const id = () =>
    String(
      (document().payload.metadata as any)?.documentId ?? document().payload.id,
    );
  let lease: DocumentVaultLease | undefined,
    service: ReturnType<typeof entityService> | undefined;
  const vaults = createDocumentVaults(
    native,
    editor.features.sqliteKnowledge
      ? (root) => sqliteIndexLifecycle(root, policy())
      : undefined,
  );
  const release = registerEntityContext(editor, {
    accepts: (k) => k === textNode().key || k === key,
    vault: () => {
      if (!lease) throw Error("Save in the current Cavern first.");
      return lease;
    },
  });
  onCleanup(() => {
    service?.dispose();
    release();
    lease?.release();
    vaults.dispose();
  });
  const entities = async () => {
    if (!lease)
      lease = await vaults.acquire(
        (await native.defaultVault()) ?? native.location(id())?.folder ?? ".",
      );
    else await lease.refresh();
    return (service ??= entityService(editor, textNode().key));
  };
  const read = (): ScreenData => {
    const child = textNode();
    return {
      text: child.inlineContent
        .map((k) => String(editor.node(k)?.payload.text ?? ""))
        .join(""),
      marks: JSON.parse(
        JSON.stringify(child.payload.standoffProperties ?? []),
      ) as Mark[],
      settings: readSettings(node().payload.phosphor),
    };
  };
  return {
    read,
    revision: () => editor.repository.state.revision,
    title: () =>
      String((document()?.payload.metadata as any)?.title ?? "Untitled"),
    commit(next, label, expected) {
      if (
        expected !== undefined &&
        editor.repository.state.revision !== expected
      )
        throw Error("The Document changed during this action. Try again.");
      validate(next);
      const old = read(),
        a = chars(old.text),
        b = chars(next.text);
      let start = 0;
      while (start < a.length && start < b.length && a[start] === b[start])
        start++;
      let end = a.length,
        tail = b.length;
      while (end > start && tail > start && a[end - 1] === b[tail - 1]) {
        end--;
        tail--;
      }
      const child = textNode();
      editor.commands.transaction(label, () => {
        if (start !== end || start !== tail)
          editor.commands.replaceInlineRange(
            child.key,
            start,
            end,
            b.slice(start, tail).join(""),
            label,
          );
        editor.commands.setPayloadField(
          child.key,
          "standoffProperties",
          next.marks,
          label,
        );
        editor.commands.setPayloadField(key, "phosphor", next.settings, label);
        const doc = document(),
          meta = doc.payload.metadata as any,
          oldTags = new Set<string>(meta?.phosphorIndexedTags ?? []);
        const independent = (meta?.tags ?? []).filter(
            (t: string) => !oldTags.has(t),
          ),
          indexed = [
            ...new Set(
              next.marks
                .filter((p) => p.type === TAG && !p.isDeleted)
                .map((p) => String(p.value)),
            ),
          ].filter((t) => !independent.includes(t)),
          tags = [...new Set([...independent, ...indexed])];
        if (
          JSON.stringify(tags) !== JSON.stringify(meta?.tags ?? []) ||
          JSON.stringify(indexed) !==
            JSON.stringify(meta?.phosphorIndexedTags ?? [])
        )
          editor.commands.setPayloadField(
            doc.key,
            "metadata",
            { ...meta, tags, phosphorIndexedTags: indexed },
            label,
          );
      });
    },
    rename(title) {
      const doc = document();
      editor.commands.setPayloadField(
        doc.key,
        "metadata",
        { ...(doc.payload.metadata as object), title },
        "Rename Phosphor Document",
      );
    },
    undo: () => {
      editor.repository.undo();
    },
    redo: () => {
      editor.repository.redo();
    },
    mount(root, input) {
      return editor.mounts.register(key, {
        root,
        focusElement: input,
        inputPolicy: "opaque-widget",
        focus: () => input.focus({ preventScroll: true }),
      });
    },
    status: () => native.status(id()),
    location: () => native.location(id()),
    async save(folder, filename) {
      const result = await native.save(id(), { folder, filename });
      if (result.phase !== "saved") throw Error(native.status(id()));
      try {
        if (!lease && editor.features.sqliteKnowledge)
          lease = await vaults.acquire((await native.defaultVault()) ?? folder);
        await lease?.refresh(true);
      } catch (e) {
        return (
          native.status(id()) +
          "; knowledge refresh unavailable: " +
          String(e instanceof Error ? e.message : e)
        );
      }
      return native.status(id());
    },
    async open(folder, filename) {
      const resourceId = await native.open({ folder, filename });
      const state = editor.repository.readState(),
        doc = Object.values(state.contents).find(
          (c) =>
            c.viewType === "document-block" &&
            String((c.payload.metadata as any)?.documentId ?? c.payload.id) ===
              resourceId,
        );
      if (
        !doc?.children.some(
          (k) =>
            state.contents[state.placements[k].contentKey].viewType ===
            "phosphor-screen-block",
        )
      )
        throw Error(
          "This is not a Phosphor Screen. Open it in Flint; the Document was not converted.",
        );
      const placement = Object.values(state.placements).find(
        (p) =>
          p.contentKey === doc.key &&
          (p.kind === "owned" || p.resourceRegistration),
      );
      if (!placement) throw Error("Document ownership is unavailable");
      openPhosphor(editor, "blank", placement.key);
    },
    newDocument: (example) => openPhosphor(editor, example),
    async searchEntities(query) {
      const api = await entities();
      const result = await api.search(
        { query, scope: "vault", stream: "all", match: "partial" },
        new AbortController().signal,
      );
      return result.candidates;
    },
    async createEntity(name) {
      const api = await entities();
      return api.create({
        id: crypto.randomUUID(),
        operationId: crypto.randomUUID(),
        name,
      });
    },
  };
}
export function createPhosphorFeature(editor: ReactiveEditor): CodexFeature {
  return {
    id: "phosphor",
    activate(scope) {
      scope.own(
        editor.registry.register(
          {
            type: "phosphor-screen-block",
            capabilities: ["container", "selectable"],
            view: (props) => (
              <Show when={scope.active()}>
                <ErrorBoundary
                  fallback={(error) => (
                    <div class="phosphor ph-unsupported" role="alert">
                      This Screen cannot be edited in Phosphor.{" "}
                      {String(error.message)} Open the Document in Flint to
                      inspect its Blocks.
                    </div>
                  )}
                >
                  <PhosphorView
                    port={phosphorPort(editor, props.nodeKey)}
                    nixie={editor.features.phosphorNixie}
                    studioDrift={editor.features.phosphorStudioDrift}
                  />
                </ErrorBoundary>
              </Show>
            ),
          },
          scope.owner,
        ),
      );
      scope.own(
        editor.commandRegistry.register(
          {
            id: "phosphor.open",
            label: "Open Phosphor",
            canExecute: () =>
              editor.repository.state.contents[
                editor.repository.state.placements[
                  editor.repository.state.rootPlacementKey
                ].contentKey
              ].viewType === "workspace-block",
            execute: () => openPhosphor(editor, "rain"),
          },
          scope.owner,
        ),
      );
    },
  };
}
