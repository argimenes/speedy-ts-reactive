import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({ entryPoints: [fileURLToPath(new URL('../server/history-validation-worker.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('../dist/server/history-validation-worker.js', import.meta.url)),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true });
