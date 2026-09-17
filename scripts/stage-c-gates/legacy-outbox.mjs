// G2 lifecycle proof only: temporary files, origin, browser profile and endpoints.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, open } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { isolatedBrowser } from './browser.mjs';
import { semanticCore } from './semantic-core.mjs';
import { openStore, admitMemoir, openWriter, readCheckpoint, hash } from './store.mjs';
import { closeFilesystemWorkers } from './filesystem.mjs';
const api = await semanticCore(), browser = await isolatedBrowser();
const directory = await mkdtemp(join(tmpdir(), 'codex-stage-c-legacy-'));
const original = join(directory, 'Legacy'), chosen = join(directory, 'Chosen');
await mkdir(original); await mkdir(chosen);
const legacyBytes = JSON.stringify({ id: 'legacy-doc', type: 'document-block', children: [{ type: 'standoff-editor-block', text: 'A😀é', relation: { leftMargin: { id: 'margin', type: 'left-margin-block', children: [] } } }] });
await writeFile(join(original, 'old.json'), legacyBytes);
const identity = { resourceId: randomUUID(), memoirId: randomUUID(), enrollmentId: randomUUID() };
const normalized = api.normalize(JSON.parse(legacyBytes), identity.resourceId); assert.equal(normalized.status, 'ready');
let writer, memoir, receipts = [], saved;
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Stage C isolated legacy outbox proof</title>'); return; }
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/normalize') { response.end(JSON.stringify({ ...normalized, identity, artifactHash: hash(legacyBytes) })); return; }
    if (request.url === '/reopen') { response.end(JSON.stringify(api.reopen(normalized.document))); return; }
    if (request.url === '/save' && request.method === 'POST') {
      const parts = []; let size = 0;
      for await (const part of request) { size += part.length; if (size > 1024 * 1024) throw new Error('gate request cap'); parts.push(part); }
      const body = JSON.parse(Buffer.concat(parts));
      assert.deepEqual(body.identity, identity); assert.deepEqual(body.document, normalized.document);
      saved = JSON.stringify(body.document);
      const file = await open(join(chosen, 'modern.json'), 'wx');
      try { await file.writeFile(saved); await file.sync(); } finally { await file.close(); }
      const parent = await open(chosen, 'r'); try { await parent.sync(); } finally { await parent.close(); }
      const store = await openStore(chosen, true); memoir = await admitMemoir(store, identity, 'modern.json');
      writer = await openWriter(memoir, { enrollmentId: identity.enrollmentId });
      for (const packet of body.packets) {
        const checkpoint = await writer.publishCheckpoint(Buffer.from(packet.wire));
        const record = { kind: 'baseline', id: packet.id, checkpoint, ...(packet.origin ? { origin: packet.origin } : {}) };
        assert.equal(record.stateParent, undefined);
        await writer.append(writer.token, writer.head, [record]); receipts.push(record);
      }
      const receipt = { kind: 'save-published', id: randomUUID(), revisionId: receipts.at(-1).id, artifactHash: hash(saved) };
      await writer.append(writer.token, writer.head, [receipt]); response.end(JSON.stringify({ accepted: receipts.map(r => r.id), artifactHash: receipt.artifactHash })); return;
    }
    response.statusCode = 404; response.end('{}');
  } catch (error) { response.statusCode = 500; response.end(JSON.stringify({ error: error.message })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const initialize = `(async()=>{
 window.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('codex-g2-legacy',1);r.onupgradeneeded=()=>{r.result.createObjectStore('meta');r.result.createObjectStore('packets');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 window.inspect=()=>new Promise((resolve,reject)=>{const tx=db.transaction(['meta','packets']);const meta=tx.objectStore('meta').get('session'),packets=tx.objectStore('packets').getAll();tx.oncomplete=()=>resolve({meta:meta.result,packets:packets.result});tx.onabort=()=>reject(tx.error);});
 window.put=(meta,packet)=>new Promise((resolve,reject)=>{const tx=db.transaction(['meta','packets'],'readwrite',{durability:'strict'});if(meta)tx.objectStore('meta').put(meta,'session');tx.objectStore('packets').add(packet,packet.id);tx.oncomplete=()=>resolve(tx.durability);tx.onabort=()=>reject(tx.error);});return true;
})()`;
try {
  let page = await browser.launch(); await page.navigate(origin); await page.evaluate(initialize);
  const first = await page.evaluate(`(async()=>{const data=await(await fetch('/normalize')).json();const meta={identity:data.identity,artifactHash:data.artifactHash,document:data.document};const durability=await put(meta,{id:'first-normalization',wire:data.baselineWire});return {durability,...await inspect()};})()`);
  assert.equal(first.durability, 'strict'); assert.equal(first.packets.length, 1);
  await assert.rejects(access(join(original, '.memory'))); await assert.rejects(access(join(chosen, '.memory')));
  await browser.kill(); page = await browser.launch(); await page.navigate(origin); await page.evaluate(initialize);
  const recovered = await page.evaluate('inspect()'); assert.deepEqual(recovered, { meta: first.meta, packets: first.packets });
  const second = await page.evaluate(`(async()=>{const state=await inspect(), fresh=await(await fetch('/reopen')).json();if(JSON.stringify(fresh.document)!==JSON.stringify(state.meta.document))throw Error('semantic identity changed');await put(undefined,{id:'reopened-normalization',wire:fresh.baselineWire,origin:{kind:'load-projection',priorRevisionId:'first-normalization'}});return inspect();})()`);
  const oldState = api.decodeWire(first.packets[0].wire), freshState = api.decodeWire(second.packets[1].wire);
  assert.notEqual(oldState.rootPlacementKey, freshState.rootPlacementKey);
  assert.deepEqual(await readFile(join(original, 'old.json'), 'utf8'), legacyBytes);
  const acknowledgement = await page.evaluate(`(async()=>{const state=await inspect();const response=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identity:state.meta.identity,document:state.meta.document,packets:state.packets})});const ack=await response.json();if(!response.ok)throw Error(JSON.stringify(ack));await new Promise((resolve,reject)=>{const tx=db.transaction(['packets','meta'],'readwrite',{durability:'strict'});for(const id of ack.accepted)tx.objectStore('packets').delete(id);tx.objectStore('meta').put({...state.meta,serverAck:ack},'session');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});return {ack,state:await inspect()};})()`);
  assert.equal(acknowledgement.state.packets.length, 0); assert.equal(acknowledgement.ack.artifactHash, hash(saved));
  assert.deepEqual(api.reopen(JSON.parse(await readFile(join(chosen, 'modern.json'), 'utf8'))).document, normalized.document);
  for (const record of receipts) assert.deepEqual(api.decodeWire((await readCheckpoint(memoir, record.checkpoint)).toString()), record.id === 'first-normalization' ? oldState : freshState);
  assert.equal(receipts[1].origin.kind, 'load-projection'); assert.equal(receipts[1].stateParent, undefined);
  await assert.rejects(access(join(original, '.memory'))); await assert.rejects(access(join(directory, '.memory')));
  console.log(JSON.stringify({ gate: 'G2 legacy/outbox/first-save', browser: page.version.product, node: process.version,
    checks: ['legacy bytes unchanged on Open and normalization', 'strict IndexedDB preserves assigned resource/Block/Placement identities across browser SIGKILL', 'normal reopen uses fresh runtime keys with an explicit projection origin, not a state parent', 'first deliberate Save creates modern bytes and memoir only in chosen parent', 'both exact canonical baselines verify after durable server publication', 'server acknowledgement deletion and metadata commit are atomic', 'new-format reopen preserves semantic identities/content'],
    limits: ['isolated experimental codecs/endpoints; no production Save/Open replacement', 'single local Chromium/Node/macOS run; not power-loss or browser eviction proof', 'this test restores normalization identity evidence, not unsaved edits or historical content into the live Document'] }, null, 2));
} finally {
  await writer?.close(); await closeFilesystemWorkers(); await browser.close();
  await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true });
}
