// @vitest-environment jsdom
import { it, expect } from "vitest";
import { createRoot } from "solid-js";
import Database from "better-sqlite3";
import { ReactiveEditor } from "../reactive-editor/editor";
import { materializeLocalWorkspace } from "../reactive-editor/workspace-manifest";
import { phosphorPort } from "../application/phosphor";
import {
  captureNative,
  nativeBytes,
  admitNative,
} from "../persistence/native-resource";
import { projectSaved } from "./saved-projection";
import { migrate } from "./schema.mjs";
import { reconcile } from "./reconcile.mjs";
import {
  newDocument,
  paint,
  copyRectangle,
  stamp,
  ATTRIBUTES,
  ENTITY,
  TAG,
} from "../features/phosphor/model";

it("native history, fresh admission and SQLite preserve exact cells and invisible semantic anchors", async () => {
  const dto = newDocument("poem"),
    editor = new ReactiveEditor(
      materializeLocalWorkspace({
        id: "work",
        type: "workspace-block",
        children: [
          { id: "bank", type: "workspace-object-bank-block", children: [dto] },
        ],
      }),
    );
  const fresh = new ReactiveEditor(
    materializeLocalWorkspace({
      id: "fresh-work",
      type: "workspace-block",
      children: [
        { id: "fresh-bank", type: "workspace-object-bank-block", children: [] },
      ],
    }),
  );
  const view = editor.createView("test"),
    node = (id: string) =>
      Object.values(view.state.nodes).find((n) => n.payload.id === id)!;
  let dispose!: () => void;
  const port = createRoot((d) => {
    dispose = d;
    return phosphorPort(editor, node(dto.children![0].id!).key);
  });
  const db = new Database(":memory:");
  try {
    const before = port.read();
    let next = paint(before, [{ column: 3, row: 10 }], "*", [...ATTRIBUTES]);
    next = paint(
      next,
      [{ column: 5, row: 12 }],
      String.fromCodePoint(0x1fbb2),
      [ATTRIBUTES[1]],
    );
    next = paint(next, [{ column: 6, row: 12 }], "\uf813", [ATTRIBUTES[0]]);
    next.marks.push(
      {
        id: "entity",
        type: ENTITY,
        value: "canonical-work",
        metadata: { entityName: "The Waste Land" },
        start: 10 * 41 + 3,
        end: 10 * 41 + 3,
      },
      {
        id: "tag",
        type: TAG,
        value: "invisible-star",
        start: 10 * 41 + 3,
        end: 10 * 41 + 3,
      },
    );
    next = stamp(
      next,
      copyRectangle(next, { left: 3, right: 4, top: 10, bottom: 11 }),
      { column: 20, row: 15 },
    );
    port.commit(next, "Duplicate semantic rectangle");
    expect(port.read()).toEqual(next);
    port.undo();
    expect(port.read()).toEqual(before);
    port.redo();
    expect(port.read()).toEqual(next);
    const bytes = nativeBytes(
      captureNative(editor.repository.snapshot(), String(dto.id)),
    );
    const bank = Object.values(fresh.repository.state.contents).find(
      (c) => c.payload.id === "fresh-bank",
    )!;
    admitNative(fresh.repository, bytes, bank.key);
    expect(
      nativeBytes(captureNative(fresh.repository.snapshot(), String(dto.id))),
    ).toEqual(bytes);
    const guid = "18e2b9ce-d3e7-4a14-b67d-b265437bcad8",
      projection = await projectSaved(bytes, guid);
    migrate(db, "mutable", { fresh: true, vaultGuid: guid });
    reconcile(
      db,
      projection,
      { path: "poem.ink", contentHash: projection.contentHash },
      null,
    );
    const segments = db
      .prepare(
        "SELECT startIndex,endIndex,targetEntityGuid FROM StandoffProperty WHERE targetEntityGuid=? ORDER BY startIndex",
      )
      .all("canonical-work");
    expect(segments).toEqual([
      { startIndex: 413, endIndex: 414, targetEntityGuid: "canonical-work" },
      { startIndex: 635, endIndex: 636, targetEntityGuid: "canonical-work" },
    ]);
    expect(
      projection.blocks
        .flatMap((b) => b.segments)
        .filter((s) => s.typename === TAG),
    ).toHaveLength(3);
    expect(
      db
        .prepare(
          "SELECT count(*) n FROM BlockSearch WHERE BlockSearch MATCH 'light'",
        )
        .get(),
    ).toEqual({ n: 1 });
    expect(
      projection.blocks.find(
        (b) => b.block.guid === dto.children![0].children![0].id,
      )!.block.text,
    ).toBe(next.text);
  } finally {
    dispose();
    editor.dispose();
    fresh.dispose();
    db.close();
  }
});
