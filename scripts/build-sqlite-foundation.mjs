import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Keep native addons external and SQL adjacent to the worker. No browser imports or auto-start.
const source = new URL('../src/knowledge-sqlite/', import.meta.url);
const destination = new URL('../dist/server/knowledge-sqlite/', import.meta.url);
for (const name of ['client.mjs', 'paths.mjs', 'foundation.mjs', 'schema.mjs', 'reconcile.mjs',
  'migrations/mutable/0001-foundation.sql', 'migrations/audit/0001-foundation.sql']) {
  const target = new URL(name, destination);
  await mkdir(new URL('.', target), { recursive: true });
  await copyFile(new URL(name, source), target);
}
await build({entryPoints:[fileURLToPath(new URL('worker-entry.mjs',source))],outfile:fileURLToPath(new URL('worker.mjs',destination)),bundle:true,platform:'node',format:'esm',target:'node22',external:['better-sqlite3','fs-ext']});
await build({entryPoints:[fileURLToPath(new URL('../server/sqlite-saved-indexer.ts',import.meta.url))],outfile:fileURLToPath(new URL('../dist/server/sqlite-saved-indexer.js',import.meta.url)),bundle:true,platform:'node',format:'esm',target:'node22',external:['fs-ext']});
await build({entryPoints:[fileURLToPath(new URL('../server/sqlite-knowledge-host.ts',import.meta.url))],outfile:fileURLToPath(new URL('../dist/server/sqlite-knowledge-host.js',import.meta.url)),bundle:true,platform:'node',format:'esm',target:'node22',external:['fs-ext','express'],plugins:[{name:'host-owned-worker-client',setup(b){b.onResolve({filter:/knowledge-sqlite\/client\.mjs$/},()=>({path:'./knowledge-sqlite/client.mjs',external:true}));}}]});
