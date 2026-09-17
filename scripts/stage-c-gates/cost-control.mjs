// Diagnose a sustained gate failure without changing or disabling ordinary undo.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { isolatedBrowser } from './browser.mjs';
import { costPreflight } from './cost-preflight.mjs';
const hostResources = await costPreflight();
const mode = process.env.G3_MODE ?? 'off', seconds = Number(process.env.G3_SECONDS ?? 180);
if (!['off', 'compact'].includes(mode)) throw Error('control mode');
const compiled = await build({ stdin: { contents: `
import {costFixture} from './src/history/stage-c-gates/cost-fixture';
window.run=async()=>{
 const s=costFixture(25000); let callbacks=0; const errors=[];
 if('${mode}'==='compact')s.repository.subscribeHistoryChanges(()=>callbacks++,e=>errors.push(String(e)));
 const start=performance.now();
 for(let i=0;i<${seconds * 5};i++){
  const wait=i*200-(performance.now()-start);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
  const before=performance.now();s.edit(i);const elapsed=performance.now()-before;
  if(i%25===0 || i===${seconds * 5 - 1}){
   const stack=s.repository.undoStack;
   await fetch('/telemetry',{method:'POST',body:JSON.stringify({edits:i+1,callbacks,errors,elapsedMs:performance.now()-start,lastEditMs:elapsed,heap:{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize,jsHeapSizeLimit:performance.memory.jsHeapSizeLimit},undoEntries:stack.length,lastUndoEntryEncodedBytes:JSON.stringify(stack.at(-1)).length,completed:i===${seconds * 5 - 1}})});
  }
 }
};`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent' });
const browser = await isolatedBrowser(), samples = [];
const server = createServer(async (request, response) => {
  if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><script type="module" src="/control.js"></script>'); return; }
  if (request.url === '/control.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(compiled.outputFiles[0].text); return; }
  if (request.url === '/telemetry') { const parts = []; for await (const part of request) parts.push(part); const sample = JSON.parse(Buffer.concat(parts)); samples.push(sample); console.log(JSON.stringify({ mode, ...sample })); response.end('{}'); return; }
  response.statusCode = 404; response.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let error, version;
try {
  const page = await browser.launch(); version = page.version; await page.navigate(`http://127.0.0.1:${server.address().port}`);
  for (let i = 0; i < 100 && !await page.evaluate('typeof window.run === "function"'); i++) await new Promise(resolve => setTimeout(resolve, 50));
  await page.evaluate('void window.run()');
  for (let i = 0; i < seconds / 5 + 8; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    if (samples.at(-1)?.completed) break;
    await page.evaluate('true');
  }
} catch (e) { error = String(e.stack ?? e); }
finally {
  const output = { mode, hostResources, date: new Date().toISOString(), node: process.version, browser: version, requestedSeconds: seconds, completed: !!samples.at(-1)?.completed, error, samples, diagnostics: browser.diagnostics };
  await writeFile(`BLOCK_SCOPED_HISTORY_STAGE_C_G3_${mode.toUpperCase()}_CONTROL.json`, JSON.stringify(output, null, 2) + '\n');
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
