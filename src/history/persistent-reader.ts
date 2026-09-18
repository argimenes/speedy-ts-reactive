/** Production route selection. Certified acceleration is disposable; every
 * failed acceleration read goes through the existing exact full reader. */
import { DurableHistoryReader, type ReaderIdentity, type ReaderIO } from "./durable-reader";
import { compareDurableSubtrees } from "./durable-core";
import { SelectiveReader, type SelectiveIO } from "./selective/reader";
import type { Certificate } from "./selective/contracts";
import type { HistorySelection, HistorySelectionResult } from "./ui-session-source";
import { readTiming } from "./read-timing";

export class PersistentHistoryReader {
  private full: DurableHistoryReader;
  private selective: SelectiveReader;
  private fallback?: HistorySelectionResult;
  private head?: { certificate: string; result: HistorySelectionResult["selected"] };
  private lastCertificate?: Certificate;
  constructor(private identity: ReaderIdentity, private selection: HistorySelection, fullIO: ReaderIO,
    private selectiveIO: Omit<SelectiveIO, "fallback" | "chooseRoute">) {
    this.full = new DurableHistoryReader(identity, selection, fullIO);
    this.selective = new SelectiveReader(identity, { ...selectiveIO, chooseRoute: true,
      certificate: async (...args) => this.lastCertificate = await selectiveIO.certificate(...args),
      fallback: async (sequence, revisionId, _selection, signal) => {
        this.fallback = await this.full.select(sequence, revisionId, signal);
        return this.fallback.selected;
      },
    });
  }
  clear() { this.full.clear(); this.selective.clear(); this.head = undefined; this.lastCertificate = undefined; this.fallback = undefined; }
  async select(sequence: number, revisionId: string, signal?: AbortSignal): Promise<HistorySelectionResult> {
    const start = performance.now(), profile = readTiming(); this.fallback = undefined; this.lastCertificate = undefined;
    const selected = await this.selective.select(sequence, revisionId, this.selection, signal);
    const selectedCertificate = this.lastCertificate as Certificate | undefined;
    if (this.fallback) {
      const value = this.fallback as HistorySelectionResult; this.fallback = undefined;
      value.timing!.route = "full"; value.timing!.fallback = selected.metrics.fallback;
      value.timing!.stages.routeSelection = Math.max(0, selected.metrics.totalMs - (value.timing!.workerMs ?? 0));
      value.timing!.workerMs = performance.now() - start;
      return value;
    }
    const account = (metrics: typeof selected.metrics) => {
      profile.timing.fetchedBytes += metrics.bytes; profile.timing.chunks += metrics.pages;
      for (const name of ["decode", "verify", "fetch"] as const) profile.timing.stages[`selective${name}`] = (profile.timing.stages[`selective${name}`] ?? 0) + metrics[`${name}Ms`];
    };
    account(selected.metrics);
    let head = selected.result, headCertificate = selectedCertificate;
    if (sequence !== this.identity.headSequence) {
      // A cached fixed comparison head never substitutes for current authority.
      const certificate = await this.selectiveIO.certificate(this.identity.headSequence, this.identity.headRevisionId, signal).catch(error => { signal?.throwIfAborted(); if (error?.name === "AbortError") throw error; return undefined; });
      if (certificate && this.head?.certificate === JSON.stringify(certificate)) { head = this.head.result; headCertificate = certificate; profile.timing.headHits++; }
      else {
        this.head = undefined;
        const value = await this.selective.select(this.identity.headSequence, this.identity.headRevisionId, this.selection, signal);
        head = value.result; headCertificate = value.source === "selective" ? this.lastCertificate : undefined; account(value.metrics);
        const fallback = this.fallback as HistorySelectionResult | undefined;
        if (fallback?.timing) {
          profile.timing.fetchedBytes += fallback.timing.fetchedBytes; profile.timing.chunks += fallback.timing.chunks;
          for (const [name, ms] of Object.entries(fallback.timing.stages)) profile.timing.stages[`headFull.${name}`] = ms;
        }
        this.fallback = undefined;
      }
    }
    if (headCertificate && (head.status === "available" || head.status === "unplaced")) this.head = { certificate: JSON.stringify(headCertificate), result: head };
    signal?.throwIfAborted();
    const comparison = profile.measure("comparison", () => compareDurableSubtrees(selected.result, head));
    profile.timing.route = "selective"; profile.timing.workerMs = performance.now() - start;
    return { selected: selected.result, comparison, timing: profile.timing };
  }
}
