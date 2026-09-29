// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { decodeBlockTree } from "../../block-tree/codecs";
import { captureNative, nativeBytes, decodeNative } from "./resource";
import { publishNativeResources } from "./owned-resource-files.mjs";

const cleanup = [];
afterEach(async () => { for (const dir of cleanup.splice(0)) await fs.rm(dir, { recursive: true, force: true }); });
async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mutable-b12-")); cleanup.push(dir);
  const doc = (id, children = []) => ({ id, type: "document-block", metadata: { documentId: id }, children: [{ id: `${id}-text`, type: "standoff-editor-block", text: id }, ...children] });
  const state = decodeBlockTree(doc("a", [doc("b")])).state;
  const a = captureNative(state, "a"), b = captureNative(state, "b");
  const locations = new Map(["a", "b", "c"].map(id => [id, path.join(dir, `${id}.mutable.json`)]));
  return { dir, a, b, locations, read: id => fs.readFile(locations.get(id)), names: () => fs.readdir(dir) };
}
it("publishes B before A, reopens both native files, and never embeds B in A", async () => {
  const f = await fixture(), result = await publishNativeResources([f.a, f.b], f.locations);
  expect(result).toEqual({ status: "complete", published: ["b", "a"], verified: [] });
  expect(nativeBytes(decodeNative(await f.read("a")))).toEqual(nativeBytes(f.a));
  expect(nativeBytes(decodeNative(await f.read("b")))).toEqual(nativeBytes(f.b));
  expect(Object.values(decodeNative(await f.read("a")).contents).map(c => c.payload.id)).not.toContain("b");
  expect((await f.names()).sort()).toEqual(["a.mutable.json", "b.mutable.json"]);
});
it("does not claim completion or publish A if B has no durable file/location", async () => {
  const f = await fixture();
  expect(await publishNativeResources([f.a], f.locations)).toMatchObject({ status: "incomplete", published: [], error: "Missing owned native resource b" });
  expect(await f.names()).toEqual([]);
  const missing = new Map([["a", f.locations.get("a")]]);
  expect(await publishNativeResources([f.a, f.b], missing)).toMatchObject({ status: "incomplete", published: [], error: "No location for b" });
});
it("saves B independently with owner unavailable, then locates B while saving A", async () => {
  const f = await fixture(); expect((await publishNativeResources([f.b], f.locations)).status).toBe("complete");
  expect(await publishNativeResources([f.a], f.locations)).toMatchObject({ status: "complete", published: ["a"] });
});
it.each(["b", "a"])("fault before publishing %s leaves an honest partial state and can retry", async fail => {
  const f = await fixture();
  const failed = await publishNativeResources([f.a, f.b], f.locations, { beforePublish: async id => { if (id === fail) throw Error("injected write failure"); } });
  expect(failed).toMatchObject({ status: "incomplete", error: "injected write failure", published: fail === "a" ? ["b"] : [] });
  expect(await f.names()).toEqual(fail === "a" ? ["b.mutable.json"] : []);
  const retry = await publishNativeResources([f.a, f.b], f.locations); expect(retry.status).toBe("complete");
  expect(retry.verified).toEqual(fail === "a" ? ["b"] : []);
});
it("re-saves only B after independent editing; A's bytes and identity remain unchanged", async () => {
  const f = await fixture(); await publishNativeResources([f.a, f.b], f.locations);
  const beforeA = await f.read("a"), beforeB = await f.read("b");
  const envelope = JSON.parse(beforeB.toString()); envelope.document.blocks.find(b => b.id === "b").properties.title = "Edited B";
  const changed = decodeNative(new TextEncoder().encode(JSON.stringify(envelope)));
  expect(await publishNativeResources([changed], f.locations)).toMatchObject({ status: "incomplete", published: [] });
  expect(await publishNativeResources([changed], f.locations, { expected: new Map([["b", beforeB]]) })).toMatchObject({ status: "complete", published: ["b"] });
  expect(await f.read("a")).toEqual(beforeA); expect((await f.read("b")).equals(beforeB)).toBe(false);
});
it("rejects identity mismatch, corrupt dependency and stale expected bytes without publishing A", async () => {
  const f = await fixture(); await fs.writeFile(f.locations.get("b"), nativeBytes(f.a));
  expect(await publishNativeResources([f.a], f.locations)).toMatchObject({ status: "incomplete", error: "Catalog identity mismatch" });
  await fs.writeFile(f.locations.get("b"), "broken");
  expect((await publishNativeResources([f.a], f.locations)).status).toBe("incomplete");
  expect(await f.names()).toEqual(["b.mutable.json"]);
});
it("rejects conflicting owner evidence from the supplied durable catalog", async () => {
  const f = await fixture(); await publishNativeResources([f.a, f.b], f.locations);
  const c = JSON.parse(new TextDecoder().decode(nativeBytes(f.a)));
  c.resourceId = c.document.resourceId = "c"; c.document.root.target.blockId = "c"; c.document.root.placementId = "c-root";
  const root = c.document.blocks.find(b => b.id === "a"); root.id = "c"; root.properties.metadata.documentId = "c";
  root.children = root.children.filter(p => p.target.kind === "external"); root.children[0].placementId = "c-owns-b"; c.document.blocks = [root];
  expect(await publishNativeResources([decodeNative(new TextEncoder().encode(JSON.stringify(c)))], f.locations)).toMatchObject({ status: "incomplete", published: [], error: "Conflicting durable resource owners" });
});
it("detects loss of a dependency during publication instead of claiming a complete A/B save", async () => {
  const f = await fixture(); await publishNativeResources([f.b], f.locations);
  const result = await publishNativeResources([f.a], f.locations, { beforePublish: async () => fs.unlink(f.locations.get("b")) });
  expect(result.status).toBe("incomplete"); expect(result.published).toEqual(["a"]);
  // A is an individually valid file, but the pair is explicitly incomplete.
  expect(decodeNative(await f.read("a")).resourceId).toBe("a");
});
