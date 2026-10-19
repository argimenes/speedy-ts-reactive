// @vitest-environment jsdom
import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { captureNative, nativeBytes } from "../persistence/native-resource";
import { decodeBlockTree } from "../block-tree/codecs";
import {
  createPackage,
  openPackage,
  nativeInventory,
} from "../interchange/package/format";
import {
  packageFragment,
  materializePackage,
} from "../interchange/package/native";
import { hash } from "../interchange/package/archive";
import { WEB_BLOCK } from "./model";
import { webProjection } from "./parse";
const data = {
    kind: "mutable-package-data",
    version: 1,
    readOnly: true,
    encoding: "sqlite-storage-class-v1",
    tables: [],
    provenance: {},
    selection: {},
    unresolved: [],
    excluded: [],
  } as any,
  schema = { kind: "mutable-knowledge-schema", version: 1, tables: [] };
it("round-trips an exact ICS original and H preview across Vaults without live activation, fresh occurrence identity, and detects projection tampering", async () => {
  const original = {
      adapter:"everyday-v1" as const,
      file:{name:"Invitation.ics"},
      version: 1 as const,
      source: "mutable-file:Invitation.ics",
      format: "calendar" as const,
      body: "\uFEFFBEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:original\r\nSUMMARY:Invitation\r\nDTSTART:20261020T100000Z\r\nX-AUTHORED:keep\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
      capturedAt: "2026-10-19T00:00:00Z",
    },
    bytes = new TextEncoder().encode(JSON.stringify(original)),
    asset = {
      kind: "managed" as const,
      cavernId: "source",
      assetId: "sha256:" + (await hash(bytes)),
    };
  const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='),c=>c.charCodeAt(0)),thumbnail={kind:'managed' as const,cavernId:'source',assetId:'sha256:'+await hash(png)};
  const capture = {
      version: 1,
      snapshotId: randomUUID(),
      source: original.source,
      capturedAt: original.capturedAt,
      asset,
      projection: webProjection(original),
    },
    doc = randomUUID(),
    dto = {
      id: doc,
      type: "document-block",
      children: [
        {
          id: "original-occurrence",
          type: WEB_BLOCK,
          web: capture,
          webThumbnail:thumbnail,
          webJobId: randomUUID(),
        },
      ],
    },
    native = captureNative(decodeBlockTree(dto).state, doc),
    assets = [{ reference: asset, mediaType: "application/json", bytes },{reference:thumbnail,mediaType:"image/png",bytes:png}];
  expect(nativeInventory(native, true).assets).toEqual([asset,thumbnail]);
  const archive = await createPackage(
      nativeBytes(native),
      { resourceId: doc, cavernId: "source" },
      data,
      schema,
      assets,
    ),
    opened = await openPackage(archive);
  expect(Array.from(opened.assets.find(a=>a.reference.assetId===asset.assetId)!.bytes)).toEqual(Array.from(bytes));
  expect(Array.from(opened.assets.find(a=>a.reference.assetId===thumbnail.assetId)!.bytes)).toEqual(Array.from(png));
  const copy = materializePackage(
      packageFragment(opened.snapshot, "source"),
      "target",
      [],
      {
        data,
        schema,
        source: opened.manifest.source,
        assetBindings: [
          ["source/" + asset.assetId, { ...asset, cavernId: "target" }],
          ["source/" + thumbnail.assetId, { ...thumbnail, cavernId: "target" }],
        ],
      },
    ),
    block = Object.values(copy.state.contents).find(
      (c) => c.viewType === WEB_BLOCK,
    )!;
  expect(block.payload.id).not.toBe("original-occurrence");
  expect((block.payload.web as any).asset.cavernId).toBe("target");
  expect((block.payload.web as any).source).toBe(original.source);
  expect(block.payload.webJobId).toBeUndefined();
  expect((block.payload.webThumbnail as any).cavernId).toBe("target");
  expect(JSON.stringify(block.payload)).not.toMatch(
    /srcdoc|widgets\.js|embed\/v1/,
  );
  (dto.children[0].web.projection as any).title = "forged";
  const bad = captureNative(decodeBlockTree(dto).state, doc),
    badPackage = createPackage(
      nativeBytes(bad),
      { resourceId: doc, cavernId: "source" },
      data,
      schema,
      assets,
    );
  await expect(badPackage).rejects.toThrow("projection");
});
