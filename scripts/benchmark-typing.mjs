// In-memory Stage A comparison. No files or user documents are modified.
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
let cloneMs = 0;
globalThis.structuredClone = function(value, options) {
  const start = performance.now(); const result = originalClone(value, options);
  cloneMs += performance.now() - start; return result;
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
  for (const capture of [false, true]) {
    const repository = new CanonicalRepository(baseline, { enforceBlockIdentity: true });
    const occurrences = new OccurrenceIndex();
    const commands = new TreeCommands(repository, key => occurrences.resolve(key));
    const projection = new BlockTreeProjection(repository, 'bench', occurrences);
    const key = projection.state.nodes[projection.state.rootKey].children[0];
    let snapshots = 0, lastEvent, captureErrors = [];
    const snapshot = repository.snapshot.bind(repository);
    repository.snapshot = () => { snapshots++; return snapshot(); };
    const stop = capture ? repository.subscribeCommits(event => { lastEvent = event; }, error => captureErrors.push(String(error))) : () => {};
    const samples = new Map();
    const pendingSamples = [];
    let measured = false;
    const measure = (operation, action) => {
      lastEvent = undefined; cloneMs = 0; snapshots = 0;
      const start = performance.now(); action(); const elapsed = performance.now() - start;
      if (snapshots) throw new Error('Fast path took a whole-document snapshot: ' + operation);
      if (capture && (!lastEvent || captureErrors.length)) throw new Error('Missing capture: ' + captureErrors.join(', '));
      if (measured) {
        pendingSamples.push({ operation, elapsed, cloneMs, snapshots, event: lastEvent });
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
        meanCloneMs: round(rows.reduce((sum,r) => sum + r.cloneMs, 0) / rows.length), snapshots: rows.reduce((sum,r) => sum + r.snapshots, 0),
        meanRecords: round(records.reduce((a,b) => a+b, 0) / rows.length), maxRecords: Math.max(...records),
        meanBytes: Math.round(bytes.reduce((a,b) => a+b, 0) / rows.length), maxBytes: Math.max(...bytes),
      });
    }
    stop(); projection.dispose();
  }
}
console.log(JSON.stringify({ warmupCycles: 5, measuredCycles: 20, strictIdentity: true, report }, null, 2));
`, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', conditions: ['browser'], write: false, logLevel: 'silent' });
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), { exports: {} }, {});
