import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
for (const name of ['history-validation-worker', 'history-derived-worker']) await build({ entryPoints: [fileURLToPath(new URL(`../server/${name}.ts`, import.meta.url))],
  outfile: fileURLToPath(new URL(`../dist/server/${name}.js`, import.meta.url)),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true });
