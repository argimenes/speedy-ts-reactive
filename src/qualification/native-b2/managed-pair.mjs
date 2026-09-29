/** Isolated B2 managed-filesystem adapter. Never imported by production Save/Open.
 * Replacements MOVE the displaced inode aside, then publish create-only.
 * Preserved prior files are never deleted, including late writes via open handles. */
import { promises as fs } from "node:fs";
import path from "node:path";
import fsExt from "fs-ext";
import { promisify } from "node:util";
const flock = promisify(fsExt.flock);
import { createHash, randomUUID } from "node:crypto";
import { decodeNative } from "../native-b1/resource";
export const hash = value => createHash("sha256").update(value).digest("hex");
const bytes = text => new TextEncoder().encode(text);
const sameHash = (value, expected) => (value === undefined ? null : hash(value)) === expected;
const read = async file => { try { return await fs.readFile(file); } catch (e) { if (e.code !== "ENOENT") throw e; } };
const syncDir = async dir => { const file = await fs.open(dir, "r"); try { await file.sync(); } finally { await file.close(); } };
async function durableWrite(file, data, exclusive = true) { const f = await fs.open(file, exclusive ? "wx" : "w"); try { await f.writeFile(data); await f.sync(); } finally { await f.close(); } }
const fail = (message, conflict = false) => Object.assign(new Error(message), { conflict });
const fields = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(k => keys.includes(k));

export class ManagedPair {
  constructor({ root, resourceId, nativeName, markdownName, locations = new Map(), fault = async () => {} }) {
    if (![nativeName, markdownName].every(n => typeof n === "string" && /^[^./\\][^/\\]*$/.test(n)) || nativeName === markdownName || !nativeName.endsWith(".mutable.json") || !markdownName.endsWith(".md")) throw Error("Invalid pair locations");
    this.root = root; this.resourceId = resourceId; this.nativeName = nativeName; this.markdownName = markdownName;
    this.locations = new Map(locations); this.fault = fault;
    this.home = path.join(root, `.mutable-pair-${hash(resourceId)}`);
  }
  file(kind) { return path.join(this.root, kind === "native" ? this.nativeName : this.markdownName); }
  async lock(action) {
    await fs.mkdir(this.home, { recursive: true });
    const lock = await fs.open(path.join(this.home, "writer.lock"), "a+");
    try { await flock(lock.fd, "exnb"); } catch (e) { await lock.close(); if (["EAGAIN", "EWOULDBLOCK"].includes(e.code)) return { phase: "failed", conflict: true, error: "Another cooperating writer holds the resource lock" }; throw e; }
    try { return await action(); } finally { await flock(lock.fd, "un"); await lock.close(); }
  }
  async receipt() {
    const raw = await read(path.join(this.home, "receipt.json")); if (!raw) return;
    const r = JSON.parse(raw);
    if (!fields(r, ["version", "resourceId", "generation", "nativeHash", "markdownHash", "nativeName", "markdownName"]) || r.version !== 1 || r.resourceId !== this.resourceId || r.nativeName !== this.nativeName || r.markdownName !== this.markdownName || ![r.nativeHash, r.markdownHash].every(h => /^[0-9a-f]{64}$/.test(h))) throw fail("Invalid pair receipt", true);
    return r;
  }
  async dependencies(native) {
    const owner = decodeNative(bytes(native)); if (owner.resourceId !== this.resourceId) throw fail("Native resource identity mismatch", true);
    const known = new Map([[owner.resourceId, owner]]);
    for (const [id, location] of this.locations) {
      if (id === owner.resourceId) continue;
      const data = await read(location); if (!data) continue;
      const r = decodeNative(data); if (r.resourceId !== id) throw fail("Dependency catalog identity mismatch", true); known.set(id, r);
    }
    const claims = new Map();
    const owned = r => Object.values(r.placements).filter(p => p.kind === "owned" && p.target.kind === "external");
    for (const [id, r] of known) for (const p of owned(r)) {
      const child = p.target.reference.source.resourceId;
      if (claims.has(child)) throw fail("Conflicting owned-resource evidence", true); claims.set(child, id);
    }
    const visit = (id, active = new Set()) => {
      if (active.has(id)) throw fail("Owned-resource cycle", true);
      const r = known.get(id); if (!r) throw fail(`Required owned resource unavailable: ${id}`);
      for (const p of owned(r)) {
        const t = p.target.reference, child = known.get(t.source.resourceId), root = child?.placements[child.rootPlacementKey];
        if (!child || root.target.kind !== "local" || child.contents[root.target.contentKey].payload.id !== t.targetId) throw fail(`Required owned resource unavailable: ${t.source.resourceId}`);
        visit(t.source.resourceId, new Set(active).add(id));
      }
    }; visit(owner.resourceId);
  }
  async save(generation, acceptMarkdownHash) {
    return this.lock(async () => {
      try {
        if (await read(path.join(this.home, "pending.json"))) throw fail("Recover the pending generation first", true);
        if (generation.resourceId !== this.resourceId || !/^[a-zA-Z0-9-]+$/.test(generation.generation)) throw fail("Wrong save identity/generation");
        await this.dependencies(generation.native);
        const prior = await this.receipt();
        const expected = { native: prior?.nativeHash ?? null, markdown: acceptMarkdownHash ?? prior?.markdownHash ?? null };
        for (const kind of ["native", "markdown"]) if (!sameHash(await read(this.file(kind)), expected[kind])) throw fail(`External ${kind} changes or unknown destination`, true);
        const dir = path.join(this.home, generation.generation); await fs.mkdir(dir);
        await durableWrite(path.join(dir, "native"), generation.native); await durableWrite(path.join(dir, "markdown"), generation.markdown);
        const intent = { version: 1, resourceId: this.resourceId, generation: generation.generation, nativeName: this.nativeName, markdownName: this.markdownName,
          profile: generation.profile, nativeHash: hash(generation.native), markdownHash: hash(generation.markdown), expected };
        await durableWrite(path.join(dir, "intent.json"), JSON.stringify(intent)); await syncDir(dir);
        await durableWrite(path.join(this.home, "pending.json"), JSON.stringify({ version: 1, generation: generation.generation })); await syncDir(this.home);
        return await this.attempt(intent);
      } catch (error) { return { phase: "failed", error: error.message, conflict: !!error.conflict }; }
    });
  }
  async pending() {
    const raw = await read(path.join(this.home, "pending.json")); if (!raw) return;
    const p = JSON.parse(raw);
    if (!fields(p, ["version", "generation"]) || p.version !== 1 || !/^[a-zA-Z0-9-]+$/.test(p.generation)) throw fail("Invalid pending record", true);
    const intent = JSON.parse(await fs.readFile(path.join(this.home, p.generation, "intent.json")));
    if (!fields(intent, ["version", "resourceId", "generation", "nativeName", "markdownName", "profile", "nativeHash", "markdownHash", "expected"]) || intent.version !== 1 || intent.resourceId !== this.resourceId || intent.generation !== p.generation || intent.nativeName !== this.nativeName || intent.markdownName !== this.markdownName || !fields(intent.expected, ["native", "markdown"]) || ![intent.nativeHash, intent.markdownHash, ...Object.values(intent.expected)].every(h => h === null || /^[0-9a-f]{64}$/.test(h))) throw fail("Invalid pair intent", true);
    return intent;
  }
  async recover() {
    return this.lock(async () => {
      try {
        const intent = await this.pending();
        if (intent) return this.attempt(intent);
        const receipt = await this.receipt(); if (!receipt) return { phase: "failed", error: "No pair to recover" };
        for (const kind of ["native", "markdown"]) if (!sameHash(await read(this.file(kind)), receipt[kind + "Hash"])) throw fail(`External ${kind} changes`, true);
        const native = (await fs.readFile(this.file("native"))).toString(); await this.dependencies(native);
        return { phase: "saved", generation: receipt.generation, native };
      } catch (error) { return { phase: "failed", error: error.message, conflict: !!error.conflict }; }
    });
  }
  async displaced(intent, kind) {
    const backup = path.join(this.home, intent.generation, `${kind}.previous`), prior = await read(backup);
    if (prior && !sameHash(prior, intent.expected[kind])) throw fail(`External ${kind} write preserved in ${backup}`, true);
  }
  async publish(intent, kind, data) {
    const file = this.file(kind), desired = intent[kind + "Hash"], priorHash = intent.expected[kind];
    await this.displaced(intent, kind);
    if (sameHash(await read(file), desired)) return;
    await this.fault(`before-${kind}`, { file, intent });
    const current = await read(file);
    const backup = path.join(this.home, intent.generation, `${kind}.previous`);
    if (await read(backup)) {
      if (current) throw fail(`Unexpected ${kind} after interrupted replacement`, true);
    } else if (current !== undefined) {
      if (priorHash === null) throw fail(`Unknown ${kind} destination`, true);
      // Rename preserves the ACTUAL displaced inode, even if another writer raced.
      await fs.rename(file, backup); await syncDir(this.root); await syncDir(path.dirname(backup));
      await this.fault(`displaced-${kind}`, { file, backup, intent });
      await this.displaced(intent, kind);
    } else if (priorHash !== null) throw fail(`Expected ${kind} disappeared`, true);
    const temp = path.join(this.home, intent.generation, `${kind}.publish-${randomUUID()}`);
    await durableWrite(temp, data);
    try { await this.fault(`publish-${kind}`, { file, intent }); await fs.link(temp, file); await syncDir(this.root); }
    catch (error) { if (error.code === "EEXIST") throw fail(`External ${kind} created during publication; all files preserved`, true); throw error; }
    finally { await fs.unlink(temp); }
    await this.fault(`after-${kind}`, { file, intent });
    await this.displaced(intent, kind);
    if (!sameHash(await read(file), desired)) throw fail(`External ${kind} changes after publication`, true);
  }
  async attempt(intent) {
    try {
      const dir = path.join(this.home, intent.generation), native = await fs.readFile(path.join(dir, "native")), markdown = await fs.readFile(path.join(dir, "markdown"));
      if (hash(native) !== intent.nativeHash || hash(markdown) !== intent.markdownHash) throw fail("Captured generation bytes changed", true);
      await this.dependencies(native.toString());
      await this.publish(intent, "native", native); await this.publish(intent, "markdown", markdown);
      await this.fault("before-receipt", { intent });
      await this.dependencies(native.toString());
      for (const kind of ["native", "markdown"]) { await this.displaced(intent, kind); if (!sameHash(await read(this.file(kind)), intent[kind + "Hash"])) throw fail(`External ${kind} changes at confirmation`, true); }
      const receipt = { version: 1, resourceId: this.resourceId, generation: intent.generation, nativeName: this.nativeName, markdownName: this.markdownName, nativeHash: intent.nativeHash, markdownHash: intent.markdownHash };
      const temp = path.join(this.home, `receipt-${randomUUID()}`); await durableWrite(temp, JSON.stringify(receipt)); await fs.rename(temp, path.join(this.home, "receipt.json")); await syncDir(this.home);
      await this.fault("after-receipt", { intent });
      await fs.unlink(path.join(this.home, "pending.json")); await syncDir(this.home);
      return { phase: "saved", generation: intent.generation, native: native.toString() };
    } catch (error) {
      const canonical = sameHash(await read(this.file("native")), intent.nativeHash), md = sameHash(await read(this.file("markdown")), intent.markdownHash);
      return { phase: canonical ? md ? "confirmation-pending" : "canonical-saved-markdown-pending" : "failed", generation: intent.generation, error: error.message, conflict: !!error.conflict };
    }
  }
  /** Read-only compare/import input. Never treats Markdown as native authority. */
  async compare(generated) { const external = await read(this.file("markdown")); return { external: external?.toString(), externalHash: external ? hash(external) : null, generated }; }
}
