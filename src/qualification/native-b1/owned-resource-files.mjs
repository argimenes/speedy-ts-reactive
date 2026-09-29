/** B1.2 filesystem proof only. No server route or product persistence imports.
 * Explicit resource-ID -> location evidence; locations never imply ownership.
 * Uses the existing store's temp-file, sync and publish pattern. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { decodeNative, nativeBytes } from "./resource";

const rootId = resource => resource.contents[resource.placements[resource.rootPlacementKey].target.contentKey].payload.id;
const ownedEdges = resource => Object.values(resource.placements).filter(p => p.kind === "owned" && p.target.kind === "external");
const same = (a, b) => Buffer.from(a).equals(Buffer.from(b));

/** One finite caller-supplied set and catalog. No discovery daemon, transaction
 * journal, owner backlink or Workspace envelope. expected holds prior file bytes
 * when replacing a resource; a missing entry authorizes creation only. */
export async function publishNativeResources(resources, locations, { expected = new Map(), beforePublish = async () => {} } = {}) {
  const published = [], verified = [];
  try {
    const requested = new Map();
    for (const resource of resources) {
      if (requested.has(resource.resourceId)) throw Error("Duplicate save identity");
      const bytes = nativeBytes(resource); requested.set(resource.resourceId, { resource: decodeNative(bytes), bytes });
    }
    const located = new Map(), current = new Map(), paths = new Set();
    for (const [id, location] of locations) {
      const absolute = path.resolve(location);
      if (paths.has(absolute)) throw Error("Conflicting catalog locations"); paths.add(absolute);
      let data;
      try { data = await fs.readFile(location); } catch (e) { if (e.code !== "ENOENT") throw e; }
      if (data) {
        const resource = decodeNative(data);
        if (resource.resourceId !== id) throw Error("Catalog identity mismatch");
        located.set(id, resource); current.set(id, data);
      }
    }
    for (const [id, value] of requested) {
      if (!locations.has(id)) throw Error(`No location for ${id}`);
      const prior = current.get(id);
      if (prior && !same(prior, value.bytes) && (!expected.has(id) || !same(expected.get(id), prior))) throw Error(`Stale or conflicting native file ${id}`);
      if (!prior && expected.has(id)) throw Error(`Expected native file disappeared ${id}`);
      located.set(id, value.resource);
    }
    // Global within this supplied catalog, never a claim about unloaded stores.
    const owners = new Map();
    for (const [id, resource] of located) for (const edge of ownedEdges(resource)) {
      const target = edge.target.reference, childId = target.source.resourceId;
      if (owners.has(childId)) throw Error("Conflicting durable resource owners");
      owners.set(childId, id);
      const child = located.get(childId);
      if (!child || rootId(child) !== target.targetId) throw Error(`Missing owned native resource ${childId}`);
    }
    const visiting = new Set(), visited = new Set(), order = [];
    const visit = id => {
      if (visiting.has(id)) throw Error("Durable resource ownership cycle");
      if (visited.has(id)) return;
      visiting.add(id);
      for (const edge of ownedEdges(located.get(id))) visit(edge.target.reference.source.resourceId);
      visiting.delete(id); visited.add(id); if (requested.has(id)) order.push(id);
    };
    for (const id of requested.keys()) visit(id);
    for (const id of order) {
      const { resource, bytes } = requested.get(id), location = locations.get(id);
      for (const edge of ownedEdges(resource)) {
        const target = edge.target.reference, childLocation = locations.get(target.source.resourceId);
        const child = childLocation && decodeNative(await fs.readFile(childLocation));
        if (!child || child.resourceId !== target.source.resourceId || rootId(child) !== target.targetId) throw Error("Owned dependency unavailable before publication");
      }
      const old = current.get(id);
      if (old && same(old, bytes)) { verified.push(id); continue; }
      let temporary;
      try {
        temporary = path.join(path.dirname(location), `.native-proof-${randomUUID()}.tmp`);
        const file = await fs.open(temporary, "wx");
        try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
        await beforePublish(id); // fault injection only
        if (old) {
          if (!same(await fs.readFile(location), old)) throw Error("Native file changed during publication");
          await fs.rename(temporary, location);
        } else await fs.link(temporary, location); // no overwrite on first publication
        const directory = await fs.open(path.dirname(location), "r");
        try { await directory.sync(); } finally { await directory.close(); }
        published.push(id);
      } finally { if (temporary) await fs.unlink(temporary).catch(e => { if (e.code !== "ENOENT") throw e; }); }
    }
    // Completion means every requested resource and owned dependency is readable
    // and identified at the end, not merely that A's rename succeeded.
    for (const id of visited) {
      const actual = decodeNative(await fs.readFile(locations.get(id)));
      if (!same(nativeBytes(actual), nativeBytes(located.get(id)))) throw Error("Native set changed before completion");
    }
    return { status: "complete", published, verified };
  } catch (error) { return { status: "incomplete", published, verified, error: error.message }; }
}
