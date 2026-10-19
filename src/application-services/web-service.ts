import {
  recognizeWeb,
  providerEndpoint,
  webCandidate,
} from "../web-resources/registry";
import type { WebCapture, WebOriginal } from "../web-resources/model";
import type { Executor, JobStorage, JobRecord } from "./capabilities";
import { object, jobId } from "./validation";
import type { WebOperations, WebResult } from "./web-contracts";
interface Ports {
  jobs: JobStorage;
  executor: Executor;
  uuid: () => string;
  now: () => string;
  mapsKey?: string;
  acquire: (
    url: string,
    format: "html" | "x-oembed" | "bluesky",
    signal: AbortSignal,
  ) => Promise<{ body: string; endpoint: string }>;
  retain: (
    bytes: Uint8Array,
    signal: AbortSignal,
  ) => Promise<WebCapture["asset"]>;
  read: (ref: WebCapture["asset"], signal: AbortSignal) => Promise<Uint8Array>;
}
/** No canonical knowledge port. Captures and jobs belong to the authorised Vault. */
export class WebResourceService {
  private tail: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private active?: AbortController;
  private closed = false;
  constructor(private p: Ports) {}
  async call<K extends keyof WebOperations>(
    op: K,
    input: WebOperations[K]["input"],
    signal?: AbortSignal,
  ): Promise<WebOperations[K]["output"]> {
    if (this.closed) throw Error("Web resources closed");
    const v = input as any;
    object(
      v,
      op === "web.embed"
        ? ["source"]
        : op === "web.import"
          ? ["id", "source"]
          : ["id"],
    );
    signal?.throwIfAborted();
    if (op === "web.embed") {
      const i = recognizeWeb(v.source);
      if (i.provider !== "google-maps" || !i.location)
        throw Error("No supported map location");
      const key = this.p.mapsKey;
      if (!key)
        return {
          message:
            "Maps Embed is not configured. Open the original in Google Maps.",
        } as any;
      if (!/^[\w-]{20,200}$/.test(key))
        throw Error("Invalid host Maps Embed key configuration");
      const url = new URL("https://www.google.com/maps/embed/v1/place");
      url.searchParams.set("key", key);
      url.searchParams.set(
        "q",
        i.location.placeId
          ? "place_id:" + i.location.placeId
          : i.location.query,
      );
      return { url: url.href } as any;
    }
    jobId(v.id);
    if (!["web.import", "web.resume"].includes(op))
      throw Error("Unsupported web operation");
    if (this.queued >= 8) throw Error("Web capture queue full");
    this.queued++;
    try {
      if (op === "web.import") {
        if (!webCandidate(v.source))
          throw Error("Use the specialized resource importer");
        recognizeWeb(v.source);
        await this.p.jobs.create(v.id, {
          kind: "web-resource",
          source: v.source,
        });
      }
      const task = this.tail.then(() => this.run(v.id, signal));
      this.tail = task.catch(() => {});
      return (await task) as any;
    } finally {
      this.queued--;
    }
  }
  private async run(id: string, signal?: AbortSignal) {
    if (this.closed) throw Error("Web resources closed");
    signal?.throwIfAborted();
    const c = (this.active = new AbortController()),
      abort = () => c.abort(),
      timer = setTimeout(abort, 60000);
    signal?.addEventListener("abort", abort, { once: true });
    let lease;
    try {
      lease = await this.p.jobs.acquire(id);
      let r = await this.p.jobs.load(id);
      if (r.preparation.kind !== "web-resource") throw Error("Wrong job type");
      const checkpoint = async (
        state: JobRecord["summary"]["state"],
        data: unknown,
        error?: string,
      ) => {
        const result = await this.p.jobs.putResult(
          id,
          new TextEncoder().encode(JSON.stringify(data)),
        );
        r = await this.p.jobs.checkpoint(
          {
            ...r,
            result,
            summary: { ...r.summary, state, ...(error ? { error } : {}) },
          },
          r.summary.revision,
        );
      };
      let data: any = r.result
        ? JSON.parse(
            new TextDecoder().decode(
              await this.p.jobs.readResult(id, r.result),
            ),
          )
        : {};
      if (r.summary.state === "completed") {
        await this.p.read(data.capture.asset, c.signal);
        return { capture: data.capture, jobId: id };
      }
      await checkpoint("running", data);
      try {
        if (!data.asset) {
          const i = recognizeWeb(r.preparation.source),
            endpoint = providerEndpoint(i);
          let original: WebOriginal = {
            version: 1,
            source: i.source,
            format: "url",
            capturedAt: this.p.now(),
          };
          if (endpoint)
            try {
              c.signal.throwIfAborted();
              const response = await this.p.acquire(
                endpoint.url,
                endpoint.format,
                c.signal,
              );
              original = { ...original, ...response, format: endpoint.format };
            } catch (e) {
              c.signal.throwIfAborted();
              original.failure = String(e).slice(0, 500);
            }
          c.signal.throwIfAborted();
          data = {
            asset: await this.p.retain(
              new TextEncoder().encode(JSON.stringify(original)),
              c.signal,
            ),
            snapshotId: this.p.uuid(),
            capturedAt: original.capturedAt,
          };
          await checkpoint("running", data);
        }
        const bytes = await this.p.read(data.asset, c.signal),
          result = (await this.p.executor.run(
            { kind: "web-project", bytes },
            c.signal,
          )) as WebResult;
        c.signal.throwIfAborted();
        const capture: WebCapture = {
          version: 1,
          snapshotId: data.snapshotId,
          source: r.preparation.source,
          capturedAt: data.capturedAt,
          asset: data.asset,
          projection: result.projection,
        };
        await checkpoint("completed", { capture });
        return { capture, jobId: id };
      } catch (e) {
        await checkpoint(
          c.signal.aborted ? "cancelled" : "failed",
          data,
          String(e).slice(0, 500),
        );
        throw Error(
          `${String(e)}. Resume using mutable-web-job:${id}; retained originals are preserved.`,
        );
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      this.active = undefined;
      await lease?.close();
    }
  }
  async close() {
    this.closed = true;
    this.active?.abort();
    await this.tail;
  }
}
