// In-memory Stage B workloads. Prints JSON; no documents or memoirs are written.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const result = await build({ stdin: { contents: `
import { decodeDocument } from './src/block-tree/codecs';
import { TreeCommands } from './src/block-tree/commands';
import { applyBlockIdentityNormalization, planBlockIdentityNormalization } from './src/block-tree/identity';
import { MemoryHistoryStore } from './src/history/memory-store';
import { HistoryQueries } from './src/history/query';
import { groupTimeline } from './src/history/grouping';
import { indexHistoricalState } from './src/history/index';
async function main() {
const report = [];
const round = n => +n.toFixed(3);
const elapsed = async fn => { const start = performance.now(); const value = await fn(); return { ms: round(performance.now() - start), value }; };
for (const fixture of [
  { name: 'short-long-history', characters: 100, edits: 120, siblings: 1, annotations: 1, checkpointEvery: 20 },
  { name: 'sparse-checkpoints', characters: 100, edits: 120, siblings: 1, annotations: 1, checkpointEvery: 100 },
  { name: 'long-paragraph', characters: 5600, edits: 30, siblings: 1, annotations: 1, checkpointEvery: 10 },
  { name: 'very-long-paragraph', characters: 25000, edits: 12, siblings: 1, annotations: 1, checkpointEvery: 5 },
  { name: 'dense-annotations', characters: 5600, edits: 20, siblings: 1, annotations: 500, checkpointEvery: 10 },
  { name: 'large-sibling-list', characters: 10, edits: 30, siblings: 300, annotations: 1, checkpointEvery: 10 },
]) {
  const decoded = decodeDocument({ id: 'doc', type: 'document-block', linkedAnnotations: { linked: { type: 'style/bold', value: 'old' } },
    children: Array.from({ length: fixture.siblings }, (_, i) => ({ id: 'p' + i, type: 'standoff-editor-block', text: 'x'.repeat(fixture.characters),
      standoffProperties: Array.from({ length: fixture.annotations }, (_, j) => ({ id: 'a' + j, annotationId: 'linked', start: 1, end: fixture.characters - 2 })) })) }).state;
  const baseline = applyBlockIdentityNormalization(decoded, planBlockIdentityNormalization(decoded));
  const store = new MemoryHistoryStore(baseline, { checkpointEvery: fixture.checkpointEvery, maxCheckpointBytes: 256 * 1024 * 1024, maxEventBytes: 128 * 1024 * 1024, schedule: () => () => {} });
  const repository = store.producer.repository, commands = new TreeCommands(repository, key => key), queries = new HistoryQueries(store);
  const key = repository.readState().contents[repository.readState().placements[repository.readState().rootPlacementKey].contentKey].children[0];
  const captureSamples = [], drainSamples = [], ids = [];
  for (let i = 0; i < fixture.edits; i++) {
    const capture = await elapsed(() => commands.replaceInlineRange(key, 2 + i, 2 + i, i % 9 === 8 ? '. ' : 'a'));
    captureSamples.push(capture.ms); ids.push(store.producer.headRevisionId);
    drainSamples.push((await elapsed(() => store.flush())).ms);
  }
  const head = store.producer.headRevisionId;
  const cold = await elapsed(() => store.getStateAt(store.segmentId, ids.at(-2)));
  const warm = await elapsed(() => store.getStateAt(store.segmentId, ids.at(-2)));
  const index = await elapsed(() => indexHistoricalState(cold.value));
  const subtree = await elapsed(() => queries.getSubtreeAt({ segmentId: store.segmentId, revisionId: head, blockId: 'doc', references: true }));
  const timeline = await elapsed(() => queries.getTimeline({ segmentId: store.segmentId, headRevisionId: head, blockId: 'p0', limit: 10000 }));
  const grouping = await elapsed(() => groupTimeline(store, { segmentId: store.segmentId, headRevisionId: head }));
  const temporalIndex = await elapsed(() => store.rebuildTimelineIndex());
  const comparison = await elapsed(() => queries.compareSubtree({ before: { segmentId: store.segmentId, revisionId: store.baselineRevisionId, blockId: 'doc' }, after: { segmentId: store.segmentId, revisionId: head, blockId: 'doc' } }));
  const beforeSplit = repository.readState().revision;
  const split = await elapsed(() => commands.splitStandoff(key, Math.floor(fixture.characters / 2)));
  const splitEvent = store.producer.headRevisionId;
  await store.flush();
  const splitBytes = Buffer.byteLength(JSON.stringify(await store.getRevision(splitEvent)));
  repository.undo(); await store.flush(); repository.redo(); await store.flush();
  if (repository.readState().revision !== beforeSplit + 3) throw new Error('Undo granularity changed');
  const percentile = (values, p) => [...values].sort((a,b) => a-b)[Math.ceil(values.length * p) - 1];
  report.push({ ...fixture, captureMedianMs: round(percentile(captureSamples, .5)), captureP95Ms: round(percentile(captureSamples, .95)),
    drainMedianMs: round(percentile(drainSamples, .5)), drainP95Ms: round(percentile(drainSamples, .95)),
    coldReplayMs: cold.ms, warmReplayMs: warm.ms, indexRebuildMs: index.ms, subtreeMs: subtree.ms, timelineMs: timeline.ms,
    groupingMs: grouping.ms, temporalIndexRebuildMs: temporalIndex.ms, comparisonMs: comparison.ms, groups: grouping.value.length, groupBytes: Buffer.byteLength(JSON.stringify(grouping.value)), subtreeBytes: Buffer.byteLength(JSON.stringify(subtree.value)), timelineEntries: timeline.value.entries.length,
    splitMs: split.ms, splitBytes, retainedUndoBytes: Buffer.byteLength(JSON.stringify(repository.undoStack)), ...store.diagnostics() });
  store.dispose();
  console.error('Completed history fixture: ' + fixture.name);
}
console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, report }, null, 2));
}
module.exports = main();
`, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', conditions: ['browser'], write: false, logLevel: 'silent' });
const benchmarkModule = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), benchmarkModule, benchmarkModule.exports);
await benchmarkModule.exports;
