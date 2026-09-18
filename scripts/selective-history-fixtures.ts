import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { captureFixture, fixtureArchive } from "../src/history/selective-spike/fixture";
import { SelectiveMaterializer, type ArchiveIO } from "../src/history/selective-spike/materialize";
import { SELECTIVE_LIMITS, type BlobWriter } from "../src/history/selective-spike/pages";
export async function prepare(directory: string, name: string, surrounding: number, selectedLength = 200, materialize = true) {
  const home = path.join(directory, name); await mkdir(path.join(home, "blobs"), { recursive: true });
  let storedBytes = 0; const written = new Set<string>();
  const blobs: BlobWriter = {
    digest: async bytes => createHash("sha256").update(bytes).digest("hex"),
    get: async (hash, signal) => { signal?.throwIfAborted(); if (!/^[a-f0-9]{64}$/.test(hash)) throw Error("Invalid hash"); return new Uint8Array(await readFile(path.join(home, "blobs", hash))); },
    put: async (hash, bytes) => {
      if (written.has(hash)) return;
      if (storedBytes + bytes.length > SELECTIVE_LIMITS.buildBytes) throw Error("Spike disk budget exceeded");
      await writeFile(path.join(home, "blobs", hash), bytes, { flag: "wx" }); written.add(hash); storedBytes += bytes.length;
    },
  };
  const f = captureFixture({ id: "doc", type: "document-block", children: [
    { id: "target", type: "standoff-editor-block", text: "a".repeat(selectedLength), standoffProperties: [{ id: "bold", type: "style/bold", start: 0, end: 4 }] },
    ...Array.from({ length: Math.ceil(surrounding / 100) }, (_, n) => ({ id: `background-${n}`, type: "standoff-editor-block", text: "b".repeat(Math.min(100, surrounding - n * 100)) })),
  ] });
  f.commands.replaceInlineRange(f.key("target"), 1, 2, "XY"); f.repository.undo(); f.repository.redo();
  const generated = await fixtureArchive(f, blobs), metadata = { name, selectedLength, surrounding, identity: generated.identity,
    revisions: Array.from({ length: f.states.length }, (_, sequence) => generated.revisionId(sequence)),
    texts: ["a".repeat(selectedLength), "aXY" + "a".repeat(selectedLength - 2), "a".repeat(selectedLength), "aXY" + "a".repeat(selectedLength - 2)] };
  for (let sequence = 0; sequence < f.states.length; sequence++) await writeFile(path.join(home, `path-${sequence}.json`), JSON.stringify(await generated.io.path(sequence)));
  await writeFile(path.join(home, "metadata.json"), JSON.stringify(metadata));
  const archive: ArchiveIO = { digest: blobs.digest, chunk: blobs.get, path: async sequence => JSON.parse(await readFile(path.join(home, `path-${sequence}.json`), "utf8")), revisionId: async sequence => metadata.revisions[sequence] };
  const authority = new SelectiveMaterializer(metadata.identity, archive, blobs), baselineBytes = (await archive.path(0)).checkpoint.byteLength;
  const archiveBytes = storedBytes, builds = [];
  for (let sequence = 0; materialize && sequence < f.states.length; sequence++) {
    const before = storedBytes, build = await authority.build(sequence);
    builds.push({ sequence, buildMs: build.buildMs, records: build.records, addedBytes: storedBytes - before });
  }
  return { metadata, blobs, archive, authority, stats: { name, selectedLength, surrounding, baselineBytes, archiveBytes, derivedBytes: storedBytes - archiveBytes, build: builds } };
}
