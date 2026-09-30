// Investigation only. Bundles into a temporary directory; never opens user stores or starts servers.
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const temp=await mkdtemp(path.join(tmpdir(),'mutable-index-runner-'));
try{await build({entryPoints:['src/qualification/native-knowledge/light-benchmark.ts'],outfile:path.join(temp,'benchmark.mjs'),bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire as _createRequire} from 'node:module';const require=_createRequire(import.meta.url);"},target:'node22',logLevel:'warning'});
 for(const size of process.argv.slice(2).length?process.argv.slice(2):['100','1000','10000']){const child=spawn(process.execPath,['--expose-gc',path.join(temp,'benchmark.mjs'),size],{stdio:'inherit'});const code=await new Promise(r=>child.once('exit',code=>r(code??1)));if(code!==0){process.exitCode=code;break;}}
}finally{await rm(temp,{recursive:true,force:true,maxRetries:3});}
