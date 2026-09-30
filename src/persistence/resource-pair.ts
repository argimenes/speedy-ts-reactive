/** Canonical resource persistence: one coordinator per canonical repository/resource, never a view. */
import type { CanonicalRepository } from "../block-tree/repository";
import { captureNative, nativeText } from "./native-resource";
import { exportMarkdown, type LinkTarget, type Diagnostic } from "./markdown";
import { freeze, type DeepReadonly } from "../block-tree/commit-capture";
export interface PairGeneration {
  resourceId: string; generation: string; native: string; markdown: string;
  profile: string; targets: readonly LinkTarget[]; diagnostics: readonly Diagnostic[];
}
export interface PairResult {
  phase: "saved" | "failed" | "canonical-saved-markdown-pending" | "confirmation-pending";
  generation?: string; error?: string; conflict?: boolean; dirty?: boolean;
}
export interface PairAdapter {
  save(generation: DeepReadonly<PairGeneration>, acceptMarkdownHash?: string): Promise<PairResult>;
  recover(): Promise<PairResult & { native?: string }>;
}
const enrolled = new WeakMap<CanonicalRepository, Map<string, ResourcePair>>();
export function enrollPair(repository: CanonicalRepository, resourceId: string, adapter: PairAdapter, targets: () => readonly LinkTarget[] = () => []) {
  let resources = enrolled.get(repository); if (!resources) enrolled.set(repository, resources = new Map());
  const existing = resources.get(resourceId);
  if (existing) { if (existing.adapter !== adapter) throw new Error("Resource already enrolled with another pair adapter"); return existing; }
  const pair = new ResourcePair(repository, resourceId, adapter, targets); resources.set(resourceId, pair); return pair;
}
export class ResourcePair {
  private inFlight?: Promise<PairResult>;
  private pending?: DeepReadonly<PairGeneration>;
  private savedNative?: string;
  result: PairResult = { phase: "failed", dirty: true };
  constructor(private repository: CanonicalRepository, readonly resourceId: string, readonly adapter: PairAdapter, private targets: () => readonly LinkTarget[]) {}
  acknowledgeOpen(native: string) {
    if (this.inFlight || this.pending) throw new Error("Cannot change an active save baseline");
    this.savedNative = native;
  }
  get dirty() { try { return this.savedNative !== nativeText(captureNative(this.repository.snapshot(), this.resourceId)); } catch { return true; } }
  save(acceptMarkdownHash?: string): Promise<PairResult> {
    if (this.inFlight) return this.inFlight;
    if (this.pending) return Promise.resolve({ ...this.result, error: "Resolve/recover the pending generation before saving newer edits", dirty: true });
    let generation: DeepReadonly<PairGeneration>;
    try {
      const resource = captureNative(this.repository.snapshot(), this.resourceId), native = nativeText(resource);
      const targets = structuredClone(this.targets()), projection = exportMarkdown(resource, targets);
      generation = freeze({ resourceId: this.resourceId, generation: crypto.randomUUID(), native, markdown: projection.text, profile: projection.profile, targets, diagnostics: projection.diagnostics });
    } catch (error) { return Promise.resolve(this.result = { phase: "failed", error: String(error), dirty: true }); }
    this.pending = generation;
    return this.run(() => this.adapter.save(generation, acceptMarkdownHash), generation.native, generation.generation);
  }
  recover(): Promise<PairResult> {
    if (this.inFlight) return this.inFlight;
    return this.run(() => this.adapter.recover(), this.pending?.native, this.pending?.generation);
  }
  private run(action: () => Promise<PairResult & { native?: string }>, native?: string, expectedGeneration?: string) {
    this.inFlight = (async () => {
      let result: PairResult & { native?: string };
      try { result = await action(); } catch (error) { result = { phase: "failed", error: String(error), generation: expectedGeneration }; }
      if (expectedGeneration && (result.phase === "saved" || result.generation) && result.generation !== expectedGeneration) result = { phase: "failed", error: "Stale save completion", generation: expectedGeneration };
      if (result.phase === "saved") { if (native ?? result.native) this.savedNative = native ?? result.native; this.pending = undefined; }
      // Preflight/encoding rejection has no durable generation to recover.
      if (result.phase === "failed" && !result.generation) this.pending = undefined;
      return this.result = { ...result, dirty: this.dirty };
    })().finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }
}
