import { copyFile, mkdir } from 'node:fs/promises';

// Keep native addons external and SQL adjacent to the worker. No browser imports or auto-start.
const source = new URL('../src/knowledge-sqlite/', import.meta.url);
const destination = new URL('../dist/server/knowledge-sqlite/', import.meta.url);
for (const name of ['client.mjs', 'worker.mjs', 'paths.mjs', 'foundation.mjs', 'schema.mjs',
  'migrations/mutable/0001-foundation.sql', 'migrations/audit/0001-foundation.sql']) {
  const target = new URL(name, destination);
  await mkdir(new URL('.', target), { recursive: true });
  await copyFile(new URL(name, source), target);
}
