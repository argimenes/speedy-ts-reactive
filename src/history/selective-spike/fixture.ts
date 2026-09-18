/** Isolated fixture authority for tests/measurement. Never imports the live editor. */
import { decodeDocument } from "../../block-tree/codecs";
import { CanonicalRepository } from "../../block-tree/repository";
import { TreeCommands } from "../../block-tree/commands";
import { applyBlockIdentityNormalization, planBlockIdentityNormalization } from "../../block-tree/identity";
import { WholeDocumentCapture, encodeDurableWire, projectWholeDocument } from "../durable-core";
import type { DeepReadonly } from "../../block-tree/commit-capture";
import type { ExistingBlockDto } from "../../block-tree/types";
import type { ResourceSnapshot, ResourceTransition } from "../stage-c-gates/resource";
import type { ReaderIdentity } from "../durable-reader";
import type { ArchiveIO } from "./materialize";
import { bytesOf, type BlobWriter } from "./pages";

export function captureFixture(document: ExistingBlockDto, decorate?: (state: ReturnType<typeof decodeDocument>["state"]) => void) {
  let initial = decodeDocument(document).state; decorate?.(initial);
  initial = applyBlockIdentityNormalization(initial, planBlockIdentityNormalization(initial));
  const repository = new CanonicalRepository(initial, { enforceBlockIdentity: true }), commands = new TreeCommands(repository, key => key);
  const baseline = projectWholeDocument(repository.readState(), "resource"), capture = new WholeDocumentCapture(baseline, 0);
  const events: DeepReadonly<ResourceTransition>[] = [], states: DeepReadonly<ResourceSnapshot>[] = [baseline];
  repository.subscribeHistoryChanges(source => { events.push(capture.capture(source)); states.push(projectWholeDocument(repository.readState(), "resource", events.length)); }, error => { throw error; });
  const key = (id: string) => Object.values(repository.readState().placements).find(p => repository.readState().contents[p.contentKey]?.payload.id === id)!.key;
  return { repository, commands, key, baseline, events, states };
}
export async function fixtureArchive(fixture: ReturnType<typeof captureFixture>, blobs: BlobWriter, segmentId = "segment") {
  const { states, events } = fixture;
  const checkpoints = new Map<number, { hash: string; byteLength: number; chunks: { hash: string; byteLength: number }[] }>();
  for (let sequence = 0; sequence < states.length; sequence += 12) {
    const bytes = bytesOf(states[sequence]), chunks = [];
    for (let offset = 0; offset < bytes.length; offset += 1024 * 1024) {
      const part = bytes.slice(offset, offset + 1024 * 1024), hash = await blobs.digest(part); await blobs.put(hash, part); chunks.push({ hash, byteLength: part.length });
    }
    checkpoints.set(sequence, { hash: await blobs.digest(bytes), byteLength: bytes.length, chunks });
  }
  const revisionId = (sequence: number) => sequence === 0 ? "baseline" : events[sequence - 1].commitId;
  const io: ArchiveIO = { digest: blobs.digest, chunk: blobs.get, revisionId: async sequence => revisionId(sequence),
    path: async sequence => { const checkpointSequence = Math.floor(sequence / 12) * 12; return { checkpoint: checkpoints.get(checkpointSequence)!, checkpointSequence, records: events.slice(checkpointSequence, sequence).map(encodeDurableWire) }; } };
  const identity: ReaderIdentity = { resourceId: "resource", memoirId: "memoir", segmentId, headSequence: events.length, headRevisionId: revisionId(events.length) };
  return { io, identity, revisionId };
}
