// Physically remove the feature in a disposable copy, never the working app.
// Node 22+. Builds the copy and runs the same Chrome harness against it.
import { cp, mkdtemp, rm, symlink, readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = process.cwd(), scratch = await mkdtemp(path.join(tmpdir(), 'codex-object-removal-'));
const artifacts = path.join(root, 'artifacts/three-d-object');
let server;
const run = (args, cwd, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk; });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(output)));
});
try {
  await cp(path.join(root, 'src'), path.join(scratch, 'src'), { recursive: true });
  for (const file of ['package.json', 'index.html', 'vite.config.js']) await cp(path.join(root, file), path.join(scratch, file));
  await symlink(path.join(root, 'node_modules'), path.join(scratch, 'node_modules'));
  await rm(path.join(scratch, 'src/features/three-d-object'), { recursive: true });
  const assembly = path.join(scratch, 'src/application/features.ts');
  const source = await readFile(assembly, 'utf8');
  await writeFile(assembly, source.split('\n').filter(line => !line.includes('createThreeDObjectFeature')).join('\n'));
  await mkdir(artifacts, { recursive: true });
  const build = await run([path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], scratch);
  await writeFile(path.join(artifacts, 'removal-build.txt'), build);
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5192', '--strictPort'], { cwd: scratch, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Removal Vite startup timed out')), 15000);
    server.stdout.on('data', chunk => { output += chunk; if (output.includes('127.0.0.1:5192')) { clearTimeout(timer); resolve(); } });
    server.once('error', reject); server.once('exit', code => { clearTimeout(timer); reject(new Error(`Removal Vite exited ${code}`)); });
  });
  const browser = await run([path.join(root, 'scripts/check-3d-object-browser.mjs')], root, { ...process.env, OBJECT_URL: 'http://127.0.0.1:5192/', OBJECT_REMOVED: '1', OBJECT_ARTIFACTS: artifacts });
  console.log(browser);
} finally {
  if (server && server.exitCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exited; }
  await rm(scratch, { recursive: true, force: true });
}
