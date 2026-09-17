// In-memory Stage B comparison (off/full/compact). No files or user documents are modified.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const result = await build({ stdin: { contents: `
import { decodeDocument } from './src/block-tree/codecs';
import { TreeCommands } from './src/block-tree/commands';
import { CanonicalRepository } from './src/block-tree/repository';
import { BlockTreeProjection } from './src/block-tree/projection';
import { OccurrenceIndex } from './src/block-tree/occurrences';
import { applyBlockIdentityNormalization, planBlockIdentityNormalization } from './src/block-tree/identity';
const originalClone = globalThis.structuredClone;
let cloneMs = 0, cloneCalls = 0, retainCloneProbe = false; const cloneProbe = [];
globalThis.structuredClone = function(value, options) {
  const start = performance.now(); const result = originalClone(value, options);
  cloneMs += performance.now() - start; cloneCalls++; if (retainCloneProbe) cloneProbe.push(result); return result;
};
const round = value => +value.toFixed(3);
const percentile = (values, p) => [...values].sort((a,b) => a-b)[Math.max(0, Math.ceil(values.length * p) - 1)];
const report = [];
for (const fixture of [
  ...[1000, 5000, 10000, 25000].map(characters => ({ characters, paragraphCharacters: 100 })),
  { characters: 5600, paragraphCharacters: 5600 },
  { characters: 25000, paragraphCharacters: 25000 },
]) {
  const decoded = decodeDocument({ id: 'doc', type: 'document-block', children: Array.from({length: fixture.characters / fixture.paragraphCharacters}, (_, i) => ({
    id: 'p' + i, type: 'standoff-editor-block', text: 'x'.repeat(fixture.paragraphCharacters),
    standoffProperties: [{ id: 'annotation' + i, type: 'style/bold', start: 10, end: fixture.paragraphCharacters - 10 }], children: [],
  })) }).state;
  const baseline = applyBlockIdentityNormalization(decoded, planBlockIdentityNormalization(decoded));
  const unrelated = new Set(Object.values(baseline.contents).filter(c => c.viewType === 'standoff-editor-block' && c.payload.id !== 'p0').map(c => c.key));
  for (const capture of ['off', 'full', 'compact']) {
    const repository = new CanonicalRepository(baseline, { enforceBlockIdentity: true });
    const occurrences = new OccurrenceIndex();
    const commands = new TreeCommands(repository, key => occurrences.resolve(key));
    const projection = new BlockTreeProjection(repository, 'bench', occurrences);
    const key = projection.state.nodes[projection.state.rootKey].children[0];
    let snapshots = 0, lastEvent, captureErrors = [];
    const snapshot = repository.snapshot.bind(repository);
    repository.snapshot = () => { snapshots++; return snapshot(); };
    const stop = capture === 'off' ? () => {} : repository[capture === 'full' ? 'subscribeCommits' : 'subscribeHistoryChanges'](event => { lastEvent = event; }, error => captureErrors.push(String(error)));
    const samples = new Map();
    const pendingSamples = [];
    let measured = false;
    const measure = (operation, action) => {
      lastEvent = undefined; cloneMs = 0; cloneCalls = 0; snapshots = 0;
      const start = performance.now(); action(); const elapsed = performance.now() - start;
      if (snapshots) throw new Error('Fast path took a whole-document snapshot: ' + operation);
      if (capture !== 'off' && (!lastEvent || captureErrors.length)) throw new Error('Missing capture: ' + captureErrors.join(', '));
      if (measured) {
        pendingSamples.push({ operation, elapsed, cloneMs, cloneCalls, snapshots, event: lastEvent });
      }
    };
    const cycle = () => {
      measure('typing', () => commands.replaceInlineRange(key, 50, 50, 'a'));
      measure('deletion', () => commands.replaceInlineRange(key, 50, 51, ''));
      measure('undo', () => repository.undo());
      measure('redo', () => repository.redo());
      measure('empty-insertion', () => commands.insertEmptyStandoffSibling(key, 'after'));
      measure('undo', () => repository.undo());
      measure('redo', () => repository.redo());
      measure('undo', () => repository.undo());
      measure('split', () => commands.splitStandoff(key, Math.floor(fixture.paragraphCharacters / 2)));
      measure('undo', () => repository.undo());
      measure('redo', () => repository.redo());
      measure('undo', () => repository.undo());
    };
    for (let i = 0; i < 5; i++) cycle();
    measured = true;
    for (let i = 0; i < 20; i++) {
      cycle();
      // Serialize after the cycle's timed edits, retaining at most one cycle
      // of large paragraph events. Subsequent samples retain only metrics.
      for (const { operation, event, ...metrics } of pendingSamples) {
        if (event?.contents.some(delta => unrelated.has(delta.key))) throw new Error('Unchanged paragraph captured');
        const list = samples.get(operation) ?? []; samples.set(operation, list);
        list.push({ ...metrics,
          bytes: event ? Buffer.byteLength(JSON.stringify(event), 'utf8') : 0,
          records: event ? event.contents.length + event.placements.length : 0,
          sequenceKeys: event ? event.contents.reduce((sum, c) => sum + (c.kind === 'patch-content'
            ? c.sequences.reduce((n, s) => n + s.removed.length + s.inserted.length, 0)
            : (c.before?.children?.length ?? 0) + (c.before?.inlineContent?.length ?? 0) + (c.after?.children?.length ?? 0) + (c.after?.inlineContent?.length ?? 0)), 0) : 0,
          fallbacks: event?.contents.filter(c => c.kind === 'record-content' && c.before && c.after).length ?? 0,
          fullRecords: event?.contents.filter(c => c.kind !== 'patch-content').length ?? 0,
        });
      }
      pendingSamples.length = 0;
      lastEvent = undefined;
    }
    // Undo/redo samples include text, empty-paragraph and split routes.
    for (const [operation, rows] of samples) {
      const bytes = rows.map(row => row.bytes), records = rows.map(row => row.records);
      report.push({ ...fixture, capture, operation, samples: rows.length,
        medianMs: round(percentile(rows.map(r => r.elapsed), .5)), p95Ms: round(percentile(rows.map(r => r.elapsed), .95)),
        meanCloneCalls: round(rows.reduce((sum,r) => sum + r.cloneCalls, 0) / rows.length),
        maxFallbacks: Math.max(...rows.map(r => r.fallbacks)), maxCapturedSequenceKeys: Math.max(...rows.map(r => r.sequenceKeys)), meanFullRecords: round(rows.reduce((sum,r) => sum + r.fullRecords, 0) / rows.length),
        meanCloneMs: round(rows.reduce((sum,r) => sum + r.cloneMs, 0) / rows.length), snapshots: rows.reduce((sum,r) => sum + r.snapshots, 0),
        meanRecords: round(records.reduce((a,b) => a+b, 0) / rows.length), maxRecords: Math.max(...records),
        meanBytes: Math.round(bytes.reduce((a,b) => a+b, 0) / rows.length), maxBytes: Math.max(...bytes),
      });
    }
    // Separate untimed clone-volume probe; regular timings do not serialize or
    // retain additional clone arguments. Explicit JS array spreads are not
    // structuredClone calls and remain a documented lower-bound limitation.
    retainCloneProbe = true;
    commands.replaceInlineRange(key, 50, 50, 'z');
    retainCloneProbe = false;
    const typingStructuredCloneBytes = cloneProbe.reduce((sum, value) => sum + Buffer.byteLength(JSON.stringify(value) ?? ''), 0);
    cloneProbe.length = 0;
    repository.undo();
    const undoBytes = Buffer.byteLength(JSON.stringify(repository.undoStack)), redoBytes = Buffer.byteLength(JSON.stringify(repository.redoStack));
    for (const row of report.filter(row => row.characters === fixture.characters && row.paragraphCharacters === fixture.paragraphCharacters && row.capture === capture)) {
      row.typingStructuredCloneBytes = typingStructuredCloneBytes; row.retainedUndoBytes = undoBytes; row.retainedRedoBytes = redoBytes;
    }
    stop(); projection.dispose();
  }
}
console.log(JSON.stringify({ warmupCycles: 5, measuredCycles: 20, strictIdentity: true, report }, null, 2));
`, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', conditions: ['browser'], write: false, logLevel: 'silent' });
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), { exports: {} }, {});
