import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const temp=await mkdtemp(path.join(tmpdir(),'boundary-p1-scheduling-'));
try{
 const entry=path.join(temp,'probe.mjs');
 await build({entryPoints:['src/qualification/native-knowledge/boundary-scheduling-benchmark.ts'],outfile:entry,bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'warning'});
 const child=spawn(process.execPath,['--expose-gc',entry],{stdio:'inherit'});
 const code=await new Promise(resolve=>child.once('exit',code=>resolve(code??1)));if(code)process.exitCode=code;
}finally{await rm(temp,{recursive:true,force:true});}
