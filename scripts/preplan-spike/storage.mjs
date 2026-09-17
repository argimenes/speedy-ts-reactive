// Bounded temporary-file measurement; no authored Documents or memoirs are modified.
import assert from 'node:assert/strict';
import { mkdtemp, open, rm, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createGzip } from 'node:zlib';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { core, round, summary, timed } from './support.mjs';
const api=await core(), dir=await mkdtemp(join(tmpdir(),'codex-preplan-storage-'));
const report={node:process.version,platform:process.platform,arch:process.arch,workloads:[]};
async function durable(path,bytes) { const f=await open(path,'w');try{await f.writeFile(bytes);await f.sync();}finally{await f.close();} }
try {
  let largeBaseline;
  for(const characters of [100,5600,25000]) {
    const baseline=api.fixture(characters), repository=new api.CanonicalRepository(baseline,{enforceBlockIdentity:true}), commands=new api.TreeCommands(repository,k=>k);
    const key=baseline.contents[baseline.placements[baseline.rootPlacementKey].contentKey].children[0], events=[];
    repository.subscribeHistoryChanges(event=>events.push(event),error=>{throw error;});
    for(let i=0;i<12;i++) commands.replaceInlineRange(key,1,1,i%4===3?'😀':'a');
    const encoded=api.encodeWire(baseline); largeBaseline=encoded;
    const encode=[],decode=[],hash=[],write=[],replay=[];
    for(let i=0;i<5;i++) {
      encode.push((await timed(()=>api.encodeWire(baseline))).ms);
      decode.push((await timed(()=>api.decodeWire(encoded))).ms);
      hash.push((await timed(()=>createHash('sha256').update(encoded).digest('hex'))).ms);
      write.push((await timed(()=>durable(join(dir,'checkpoint'),encoded))).ms);
    }
    let state=api.decodeWire(encoded), eventBytes=[],eventEncode=[],eventDecode=[];
    const checkpoints=new Map([[0,encoded]]);
    for(let i=0;i<events.length;i++) {
      const ew=await timed(()=>api.encodeWire(events[i])); eventEncode.push(ew.ms); eventBytes.push(Buffer.byteLength(ew.result));
      const decoded=await timed(()=>api.decodeWire(ew.result)); eventDecode.push(decoded.ms);
      const applied=await timed(()=>api.applyHistoryChanges(state,decoded.result)); replay.push(applied.ms); state=applied.result;
      if((i+1)%4===0)checkpoints.set(i+1,api.encodeWire(state));
    }
    assert.deepEqual(state,repository.snapshot());
    const coldByDistance=[];
    for(const distance of [0,4,12]) {
      const index=12-distance;
      const result=await timed(()=>{let candidate=api.decodeWire(checkpoints.get(index));for(let i=index;i<12;i++)candidate=api.applyHistoryChanges(candidate,api.decodeWire(api.encodeWire(events[i])));return candidate;});
      assert.deepEqual(result.result,state);coldByDistance.push({distance,ms:round(result.ms)});
    }
    const gz=await timed(()=>gzipSync(encoded));
    const restored=await timed(()=>api.decodeWire(gunzipSync(gz.result).toString())); assert.deepEqual(restored.result,baseline);
    report.workloads.push({characters,edits:12,baselineJsonBytes:Buffer.byteLength(JSON.stringify(baseline)),baselineWireBytes:Buffer.byteLength(encoded),gzipBytes:gz.result.length,gzipMs:round(gz.ms),gunzipAndDecodeMs:round(restored.ms),checkpointEncode:summary(encode),checkpointDecode:summary(decode),sha256:summary(hash),checkpointWriteAndSync:summary(write),eventBytes:{min:Math.min(...eventBytes),max:Math.max(...eventBytes)},eventEncode:summary(eventEncode),eventDecode:summary(eventDecode),applyAndValidate:summary(replay),coldByDistance});
    console.error(`Measured wire/storage fixture ${characters}`);
  }
  // Byte-layout experiment, not a fabricated long revision history: repeated checkpoint-shaped records.
  const payload=largeBaseline, target=128*1024*1024, copies=Math.ceil(target/Buffer.byteLength(payload));
  const monolithic=join(dir,'archive.json');
  const build=await timed(async()=>{const f=await open(monolithic,'w');try{await f.writeFile('{"records":[');for(let i=0;i<copies;i++)await f.writeFile((i?',':'')+payload);await f.writeFile(']}');await f.sync();}finally{await f.close();}});
  const bytes=(await stat(monolithic)).size;
  let parsed;
  global.gc?.(); const rssBefore=process.memoryUsage().rss, heapBefore=process.memoryUsage().heapUsed;
  const read=await timed(async()=>{parsed=JSON.parse(await readFile(monolithic,'utf8'));return parsed.records.length;});
  assert.equal(read.result,copies); global.gc?.(); const rssAfter=process.memoryUsage().rss, heapAfter=process.memoryUsage().heapUsed; parsed=undefined; global.gc?.();
  const monolithicGzip=join(dir,'archive.json.gz');
  const gzipArchive=await timed(async()=>{await pipeline(createReadStream(monolithic),createGzip(),createWriteStream(monolithicGzip));const f=await open(monolithicGzip,'r+');try{await f.sync();}finally{await f.close();}});
  const openCompressedArchive=await timed(async()=>JSON.parse(gunzipSync(await readFile(monolithicGzip)).toString()).records.length);
  assert.equal(openCompressedArchive.result,copies);global.gc?.();
  const chunk=gzipSync(payload); const publish=await timed(async()=>{
    for(let i=0;i<copies;i++)await durable(join(dir,`checkpoint-${i}.gz`),chunk);
    await durable(join(dir,'manifest.next'),JSON.stringify({generation:1,checkpoints:Array.from({length:copies},(_,i)=>({file:`checkpoint-${i}.gz`,bytes:chunk.length})),journalBase:0}));
    await rename(join(dir,'manifest.next'),join(dir,'manifest.json'));const d=await open(dir,'r');try{await d.sync();}finally{await d.close();}
  });
  const openManifest=await timed(async()=>JSON.parse(await readFile(join(dir,'manifest.json'),'utf8')));
  const oneCheckpoint=await timed(async()=>api.decodeWire(gunzipSync(await readFile(join(dir,'checkpoint-0.gz'))).toString()));
  assert.deepEqual(oneCheckpoint.result,api.decodeWire(payload));
  const publishManifest=await timed(async()=>{await durable(join(dir,'manifest.next'),JSON.stringify({...openManifest.result,generation:2}));await rename(join(dir,'manifest.next'),join(dir,'manifest.json'));const d=await open(dir,'r');try{await d.sync();}finally{await d.close();}});
  report.layout={kind:'synthetic repeated checkpoint payloads, not a long exact timeline',targetBytes:target,copies,monolithicBytes:bytes,streamBuildAndSyncMs:round(build.ms),eagerReadParseMs:round(read.ms),gcAvailable:!!global.gc,observedRssIncreaseBytes:rssAfter-rssBefore,retainedParsedHeapDeltaBytes:heapAfter-heapBefore,compressedMonolithicBytes:(await stat(monolithicGzip)).size,compressedMonolithicBuildAndSyncMs:round(gzipArchive.ms),compressedMonolithicReadInflateParseMs:round(openCompressedArchive.ms),compressedChunkBytes:chunk.length,totalChunkBytes:chunk.length*copies,chunkPublicationMs:round(publish.ms),manifestBytes:(await stat(join(dir,'manifest.json'))).size,manifestOpenMs:round(openManifest.ms),oneCheckpointLoadAndDecodeMs:round(oneCheckpoint.ms),manifestReplacementAndSyncMs:round(publishManifest.ms)};
  report.limits=['Five checkpoint samples and twelve edits per fixture; no p99 or sustained editor throughput claim','Filesystem cache not evicted; cold replay means cold reconstructed state, not cold OS page cache','RSS delta is observational, not isolated retained-heap accounting','128 MiB layout experiment uses repeated checkpoint-shaped records; compression is fixture-dependent','No multi-GB test, power-loss test or production archive format implemented'];
  console.log(JSON.stringify(report,null,2));
} finally {await rm(dir,{recursive:true,force:true});}
