// In-memory benchmark: no files or user documents are modified.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const result = await build({ stdin: { contents: `
import { ReactiveEditor } from './src/reactive-editor/editor';
const originalClone = globalThis.structuredClone;
let cloneMs = 0;
globalThis.structuredClone = function(value, options) {
  const start = performance.now(); const result = originalClone(value, options);
  cloneMs += performance.now() - start; return result;
};
const report = [];
for (const size of [1000, 5000, 10000, 25000]) {
  const editor = new ReactiveEditor({ type: 'document-block', children: Array.from({length: size / 100}, (_, i) => ({ id: 'p' + i, type: 'standoff-editor-block', text: 'x'.repeat(100), standoffProperties: [], children: [] })) });
  const projection = editor.createView('bench');
  const key = projection.state.nodes[projection.state.rootKey].children[0];
  let snapshots = 0; const snapshot = editor.repository.snapshot.bind(editor.repository);
  editor.repository.snapshot = () => { snapshots++; return snapshot(); };
  cloneMs = 0; const samples = [];
  for (let i = 0; i < 3; i++) {
    let t = performance.now(); editor.commands.replaceInlineRange(key, 50, 50, 'a'); samples.push(performance.now() - t);
    t = performance.now(); editor.commands.replaceInlineRange(key, 50, 51, ''); samples.push(performance.now() - t);
  }
  report.push({ characters: size, paragraphCharacters: 100, meanEditMs: +(samples.reduce((a,b) => a+b) / samples.length).toFixed(2), minEditMs: +Math.min(...samples).toFixed(2), maxEditMs: +Math.max(...samples).toFixed(2), snapshotsPerEdit: snapshots/6, cloneMsPerEdit: +(cloneMs/6).toFixed(2) });
  editor.dispose();
}
console.log(JSON.stringify(report, null, 2));
`, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', conditions: ['browser'], write: false, logLevel: 'silent' });
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), { exports: {} }, {});
