// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { clone } from '../src/block-tree/clone';
import { decodeDocument } from '../src/block-tree/codecs';
import { CanonicalRepository } from '../src/block-tree/repository';
import { TreeCommands } from '../src/block-tree/commands';
import { WholeDocumentCapture, encodeDurableWire, encodeHistoryDocument, projectWholeDocument } from '../src/history/durable-core';
import type { DeepReadonly } from '../src/block-tree/commit-capture';
import type { ResourceTransition } from '../src/history/stage-c-gates/resource';
import { createHistoryValidator } from './history-validator';

let workerDirectory: string, workerUrl: URL;
beforeAll(async () => {
  workerDirectory = await mkdtemp(path.join(tmpdir(), 'history-validator-test-'));
  const outfile = path.join(workerDirectory, 'worker.mjs');
  await build({ entryPoints: ['server/history-validation-worker.ts'], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22' });
  workerUrl = pathToFileURL(outfile);
});
afterAll(async () => { if (workerDirectory) await rm(workerDirectory, { recursive: true, force: true }); });
const validator = (maxPending = 8) => createHistoryValidator({ workerUrl, maxPending });
function fixture() {
  const state = decodeDocument({ type: 'document-block', id: 'doc', children: [{ type: 'standoff-editor-block', id: 'p', text: 'hello' }] }).state;
  const repository = new CanonicalRepository(state, { enforceBlockIdentity: true }), commands = new TreeCommands(repository, k => k);
  const baseline = projectWholeDocument(state, 'r'), capture = new WholeDocumentCapture(baseline, state.revision), events: DeepReadonly<ResourceTransition>[] = [];
  const root = state.placements[state.rootPlacementKey], paragraph = state.contents[root.contentKey].children[0];
  repository.subscribeHistoryChanges(e => events.push(capture.capture(e)), error => { throw error; });
  return { repository, commands, baseline, events, capture, paragraph };
}

describe('isolated native semantic history verification', () => {
  it('reconstructs exact transitions, checks incremental byte accounting at checkpoint12 and verifies the saved artifact', async () => {
    const v = validator(), s = fixture(), checkpointWire = encodeDurableWire(s.baseline), records: string[] = [];
    try {
      await v.validateBaseline(checkpointWire, 'r');
      for (let i = 0; i < 12; i++) {
        if (i === 5) {
          const state = s.repository.readState(), key = state.placements[s.paragraph].contentKey, record = clone(state.contents[key]);
          // Escaping a tag in an existing payload changes encoding overhead for
          // unchanged fields; byte accounting must still be exact.
          record.payload.$codexHistoryValue = ['ordinary', 'authored', 'payload']; record.revision++;
          s.repository.commit('Authored payload', [{ kind: 'put-content', record }]);
        } else s.commands.replaceInlineRange(s.paragraph, 1, 2, i % 2 ? 'Z' : 'ab');
        const event = s.events.at(-1)!, wire = encodeDurableWire(event);
        const result = await v.validateAppend({ checkpointWire, records: [...records], wire, resourceId: 'r', expectedSourceRevision: i });
        expect(result.revisionId).toBe(event.commitId); expect(result.metadata.affectedBlockIds).toEqual(['doc', 'p']);
        const oracle = projectWholeDocument(s.repository.readState(), 'r', s.capture.localRevision);
        if (i === 11) expect(result.checkpointWire).toBe(encodeDurableWire(oracle));
        else expect(result.checkpointWire).toBeUndefined();
        records.push(wire);
      }
      const revisionId = s.events.at(-1)!.commitId, oracle = projectWholeDocument(s.repository.readState(), 'r', s.capture.localRevision);
      const document = encodeHistoryDocument(oracle, 'memoir', { segmentId: 'segment', revisionId });
      await v.validateArtifact({ checkpointWire, records, document, memoirId: 'memoir', segmentId: 'segment', revisionId });
      await v.validateArtifact({ checkpointWire, records, document: { ...document, metadata: { filename: 'display-only.json' } }, memoirId: 'memoir', segmentId: 'segment', revisionId });
      const forged = clone(document); forged.document.blocks.find(b => b.id === 'p')!.inline = [{ kind: 'text', text: 'forged' }];
      await expect(v.validateArtifact({ checkpointWire, records, document: forged, memoirId: 'memoir', segmentId: 'segment', revisionId })).rejects.toThrow('does not equal');
      await expect(v.validateArtifact({ checkpointWire, records, document, memoirId: 'memoir', segmentId: 'segment', revisionId: 'other' })).rejects.toThrow('revision mismatch');
    } finally { await v.dispose(); }
  });

  it('rejects wrong identities/preimages/path distance and has a bounded retryable queue', async () => {
    const v = validator(1), s = fixture(), checkpointWire = encodeDurableWire(s.baseline);
    try {
      const first = v.validateBaseline(checkpointWire, 'r');
      await expect(v.validateBaseline(checkpointWire, 'r')).rejects.toMatchObject({ status: 503 }); await first;
      await expect(v.validateBaseline(checkpointWire, 'wrong')).rejects.toThrow('identity');
      await expect(v.validateBaseline(encodeDurableWire({ ...s.baseline, revision: 1 }), 'r')).rejects.toThrow('revision zero');
      s.commands.replaceInlineRange(s.paragraph, 1, 2, 'Z');
      const event = clone(s.events[0]) as ResourceTransition;
      const patch = event.contents.find(c => c.kind === 'patch-content');
      if (!patch || patch.kind !== 'patch-content') throw new Error('Missing expected patch');
      patch.sequences[0].removed[0] = 'forged-preimage';
      await expect(v.validateAppend({ checkpointWire, records: [], wire: encodeDurableWire(event), resourceId: 'r', expectedSourceRevision: 0 })).rejects.toThrow(/preimage|precondition/);
      await expect(v.validateAppend({ checkpointWire, records: Array(12).fill(encodeDurableWire(s.events[0])), wire: encodeDurableWire(s.events[0]), resourceId: 'r', expectedSourceRevision: 12 })).rejects.toThrow('nearer checkpoint');
      await v.validatePortable(encodeHistoryDocument(s.baseline, 'memoir'));
      await expect(v.validatePortable({ format: 'codex-history-document', version: 999 })).rejects.toThrow('unsupported');
    } finally { await v.dispose(); }
  });
});
