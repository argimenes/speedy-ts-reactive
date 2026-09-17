// Finite fault/recovery laboratory. Writes only to a temporary directory.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const hash = text => createHash('sha256').update(text).digest('hex');
const genesis = '0'.repeat(64);
function frame(sequence, previous, body) {
  const payload = JSON.stringify(body), length = Buffer.byteLength(payload);
  return { sequence, previous, payload, length, hash: hash(`${sequence}\n${previous}\n${payload}`) };
}
function scan(bytes) {
  const records = []; let offset = 0;
  for (const line of bytes.split('\n')) {
    if (offset + Buffer.byteLength(line) === Buffer.byteLength(bytes) && line) return { records, incompleteTail: true };
    if (!line) continue;
    const f = JSON.parse(line), expected = frame(f.sequence, f.previous, JSON.parse(f.payload));
    assert.deepEqual(f, expected, 'frame integrity'); records.push(f); offset += Buffer.byteLength(line) + 1;
  }
  return { records, incompleteTail: false };
}
async function syncWrite(path, bytes) {
  const file = await open(path, 'w'); try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}
async function syncDir(path) { const fd = await open(path, 'r'); try { await fd.sync(); } finally { await fd.close(); } }
class Lab {
  constructor(directory) { this.directory = directory; this.records = []; this.writer = undefined; this.queue = Promise.resolve(); }
  async recover() {
    const all = new Map(); this.incompleteTail = false;
    for (const name of ['archive', 'journal']) {
      const bytes = await readFile(join(this.directory, name), 'utf8').catch(e => { if (e.code === 'ENOENT') return ''; throw e; });
      const result = scan(bytes); this.incompleteTail ||= result.incompleteTail;
      if (name === 'archive') assert.equal(result.incompleteTail, false, 'incomplete published archive');
      for (const f of result.records) {
        if (all.has(f.sequence)) assert.deepEqual(all.get(f.sequence), f, 'conflicting duplicate prefix');
        all.set(f.sequence, f);
      }
    }
    this.records = [...all.values()].sort((a,b) => a.sequence-b.sequence);
    let previous = genesis;
    for (const [i,f] of this.records.entries()) { assert.equal(f.sequence, i+1, 'interior sequence gap'); assert.equal(f.previous, previous, 'hash ancestry'); previous=f.hash; }
    // A restarted owner must durably claim a new writer epoch, never inherit old grants.
    this.writer = undefined;
  }
  get head() { return this.records.length; }
  async claim() {
    assert.equal(this.incompleteTail, false, 'quarantine/repair incomplete tail before append');
    const token = randomUUID();
    await this.write([{ kind:'epoch', id:randomUUID(), token }]); this.writer = token; return token;
  }
  async write(bodies) {
    const frames = []; let previous=this.records.at(-1)?.hash ?? genesis;
    for(const body of bodies) { const f=frame(this.head+frames.length+1,previous,body); frames.push(f); previous=f.hash; }
    const fd=await open(join(this.directory,'journal'),'a');
    try { await fd.writeFile(frames.map(f=>JSON.stringify(f)+'\n').join('')); await fd.sync(); } finally { await fd.close(); }
    await syncDir(this.directory); this.records.push(...frames); return frames;
  }
  append(token, expectedHead, bodies) {
    const work = this.queue.then(async()=> {
      // Deliberately small laboratory limits, not production defaults.
      const sizes=bodies.map(body=>Buffer.byteLength(JSON.stringify(body)));
      assert.ok(bodies.length<=256,'batch count limit');
      assert.ok(sizes.every(n=>n<=16*1024),'record byte limit');
      assert.ok(sizes.reduce((a,b)=>a+b,0)<=64*1024,'batch byte limit');
      const ids = new Map(this.records.map(f=>[JSON.parse(f.payload).id,f]));
      const fresh=[]; let duplicateHead=undefined;
      for(const body of bodies) {
        if(ids.has(body.id)) {
          assert.equal(fresh.length,0,'duplicate after fresh suffix');
          assert.equal(ids.get(body.id).payload,JSON.stringify(body),'conflicting duplicate ID'); duplicateHead=ids.get(body.id).sequence;
        } else { fresh.push(body); ids.set(body.id,{payload:JSON.stringify(body)}); }
      }
      if(!fresh.length) return {accepted:bodies.map(b=>b.id),duplicate:true};
      assert.equal(token,this.writer,'fenced writer'); assert.ok(token,'writer grant required');
      assert.equal(duplicateHead ?? expectedHead,this.head,'stale expected head');
      const parents=new Set(this.records.filter(f=>['baseline','revision'].includes(JSON.parse(f.payload).kind)).map(f=>JSON.parse(f.payload).id));
      for(const body of fresh) { if(body.kind==='revision') assert.ok(parents.has(body.stateParent),'missing state parent'); if(['baseline','revision'].includes(body.kind)) parents.add(body.id); }
      await this.write(fresh); return {accepted:bodies.map(b=>b.id),head:this.head,hash:this.records.at(-1).hash};
    }); this.queue=work.catch(()=>{}); return work;
  }
  async consolidate(failAt, concurrentAppend) {
    const prefix=[...this.records], through=prefix.length;
    await syncWrite(join(this.directory,'archive.next'),prefix.map(f=>JSON.stringify(f)+'\n').join(''));
    if(failAt==='before-publish') throw new Error('injected');
    if(concurrentAppend) await concurrentAppend();
    await rename(join(this.directory,'archive.next'),join(this.directory,'archive')); await syncDir(this.directory);
    if(failAt==='after-publish') throw new Error('injected');
    await syncWrite(join(this.directory,'journal.next'),this.records.slice(through).map(f=>JSON.stringify(f)+'\n').join(''));
    if(failAt==='before-rotate') throw new Error('injected');
    await rename(join(this.directory,'journal.next'),join(this.directory,'journal')); await syncDir(this.directory);
    if(failAt==='after-rotate') throw new Error('injected');
  }
}
const directory=await mkdtemp(join(tmpdir(),'codex-preplan-protocol-'));
const checks=[]; const check=(name)=>checks.push(name);
try {
  const lab=new Lab(directory); await lab.recover(); const token=await lab.claim();
  const baseline={kind:'baseline',id:'R100'}, r101={kind:'revision',id:'R101',stateParent:'R100'}, r102={kind:'revision',id:'R102',stateParent:'R101'};
  await lab.append(token,lab.head,[baseline]); const start=lab.head;
  await lab.append(token,start,[r101]); await lab.append(token,start,[r101,r102]); check('overlapping retry accepts only fresh suffix');
  assert.equal((await lab.append('stale',0,[r101,r102])).duplicate,true); check('acknowledgement loss retries identically after head changes');
  await assert.rejects(lab.append(token,lab.head,[{...r102,stateParent:'R100'}])); check('conflicting duplicate rejected');
  const r103={kind:'revision',id:'R103',stateParent:'R100'};
  await lab.append(token,lab.head,[r103]); assert.equal(JSON.parse(lab.records.at(-1).payload).stateParent,'R100'); check('journal order independent of state ancestry');
  await assert.rejects(lab.append(token,lab.head,[{kind:'revision',id:'bad-parent',stateParent:'missing'}])); check('missing baseline/parent not acknowledged');
  const oldHead=lab.head, racing=await Promise.allSettled([lab.append(token,oldHead,[{kind:'revision',id:'winner',stateParent:'R103'}]),lab.append(token,oldHead,[{kind:'revision',id:'loser',stateParent:'R103'}])]);
  assert.equal(racing.filter(r=>r.status==='fulfilled').length,1); check('serialized competing expected-head appends');
  const restarted=new Lab(directory); await restarted.recover(); const newToken=await restarted.claim();
  await assert.rejects(restarted.append(token,restarted.head,[{kind:'revision',id:'old-writer',stateParent:'R100'}])); check('restart epoch fences previous writer');
  await restarted.append(newToken,restarted.head,[{kind:'receipt-prepared',id:'save-1',revision:'R100',artifactHash:'example'}]);
  // Preparing a receipt does not modify a Document or imply publication; all records survive independently.
  check('save preparation is a distinct non-revision record');
  const boundedHead=restarted.head;
  await assert.rejects(restarted.append(newToken,boundedHead,[{kind:'revision',id:'oversize',stateParent:'R100',payload:'😀'.repeat(5000)}]),/record byte limit/);
  await assert.rejects(restarted.append(newToken,boundedHead,Array.from({length:8},(_,i)=>({kind:'revision',id:'batch-'+i,stateParent:'R100',payload:'x'.repeat(10000)}))),/batch byte limit/);
  await assert.rejects(restarted.append(newToken,boundedHead,Array.from({length:257},(_,i)=>({kind:'revision',id:'count-'+i,stateParent:'R100'}))),/batch count limit/);
  assert.equal(restarted.head,boundedHead);check('record bytes, batch bytes and count limits reject before publication');
  for(const phase of ['before-publish','after-publish','before-rotate','after-rotate',undefined]) {
    const expected=restarted.records.length;
    try { await restarted.consolidate(phase); } catch(e) { assert.equal(e.message,'injected'); }
    const reader=new Lab(directory); await reader.recover(); assert.equal(reader.records.length,expected);
    check(`lossless consolidation recovery: ${phase ?? 'complete'}`);
  }
  await restarted.consolidate(undefined,()=>restarted.append(newToken,restarted.head,[{kind:'revision',id:'concurrent-tail',stateParent:'R100'}]));
  const reader=new Lab(directory); await reader.recover(); assert.equal(JSON.parse(reader.records.at(-1).payload).id,'concurrent-tail'); check('concurrent append survives prefix rotation');
  const validJournal=await readFile(join(directory,'journal'),'utf8');
  await writeFile(join(directory,'journal'),validJournal+'{"partial":');
  await reader.recover(); assert.equal(reader.incompleteTail,true); await assert.rejects(reader.claim()); check('incomplete tail detected; append requires explicit repair');
  await writeFile(join(directory,'journal'),validJournal.replace('concurrent-tail','concurrent-fail'));
  await assert.rejects(reader.recover()); check('complete corrupted tail is not treated as incomplete');
  await writeFile(join(directory,'journal'),validJournal);
  // Real process death after a file synchronization: this is not a power-loss test.
  const killed=join(directory,'killed');
  const child=spawn(process.execPath,['--input-type=module','-e',`import {open} from 'node:fs/promises'; const f=await open(process.argv[1],'w'); await f.writeFile('acknowledged'); await f.sync(); process.stdout.write('ready'); setInterval(()=>{},1000);`,killed],{stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);});
  const exit=new Promise(resolve=>child.once('exit',resolve)); child.kill('SIGKILL'); await exit;
  assert.equal(await readFile(killed,'utf8'),'acknowledged'); check('actual SIGKILL after synchronized write preserves bytes');
  // Probe OS lock semantics independently of a Node production dependency choice.
  const lock=join(directory,'owner.lock');
  const holder=spawn('python3',['-c',"import fcntl,sys,time; f=open(sys.argv[1],'w'); fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB); print('locked',flush=True); time.sleep(60)",lock],{stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{holder.stdout.once('data',resolve);holder.once('error',reject);});
  const contender=()=>spawnSync('python3',['-c',"import fcntl,sys; f=open(sys.argv[1],'a'); fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)",lock]);
  assert.notEqual(contender().status,0); const holderExit=new Promise(resolve=>holder.once('exit',resolve)); holder.kill('SIGKILL'); await holderExit; assert.equal(contender().status,0);
  check('OS advisory ownership excludes another process and releases after SIGKILL');
  // Chosen-layout publication probe: immutable segment, manifest switch, then journal rotation.
  for(const phase of ['chunk-durable','manifest-prepared','manifest-published','journal-rotated']) {
    const d=await mkdtemp(join(directory,'generation-'));
    const prefix=restarted.records.slice(0,3),tail=restarted.records.slice(3),lines=rs=>rs.map(f=>JSON.stringify(f)+'\n').join('');
    await syncWrite(join(d,'manifest.json'),JSON.stringify({generation:0,chunks:[]}));
    await syncWrite(join(d,'active.jsonl'),lines([...prefix,...tail]));
    const chunkBytes=lines(prefix);await syncWrite(join(d,'segment-1.jsonl'),chunkBytes);
    if(phase!=='chunk-durable') {
      await syncWrite(join(d,'manifest.next'),JSON.stringify({generation:1,chunks:[{file:'segment-1.jsonl',hash:hash(chunkBytes)}]}));
      if(phase!=='manifest-prepared') {
        await rename(join(d,'manifest.next'),join(d,'manifest.json'));await syncDir(d);
        if(phase==='journal-rotated') {await syncWrite(join(d,'journal.next'),lines(tail));await rename(join(d,'journal.next'),join(d,'active.jsonl'));await syncDir(d);}
      }
    }
    const manifest=JSON.parse(await readFile(join(d,'manifest.json'),'utf8')),recovered=new Map();
    for(const chunk of manifest.chunks) {
      const bytes=await readFile(join(d,chunk.file),'utf8');assert.equal(hash(bytes),chunk.hash);
      for(const f of scan(bytes).records)recovered.set(f.sequence,f);
    }
    for(const f of scan(await readFile(join(d,'active.jsonl'),'utf8')).records) {
      if(recovered.has(f.sequence))assert.deepEqual(recovered.get(f.sequence),f);recovered.set(f.sequence,f);
    }
    assert.deepEqual([...recovered.values()].sort((a,b)=>a.sequence-b.sequence),restarted.records);
    check(`immutable generation recovery: ${phase}`);
  }
  console.log(JSON.stringify({node:process.version,platform:process.platform,checks,scope:'temporary-file and finite protocol model; not production endpoints; fsync/SIGKILL is not power-loss proof'},null,2));
} finally { await rm(directory,{recursive:true,force:true}); }
