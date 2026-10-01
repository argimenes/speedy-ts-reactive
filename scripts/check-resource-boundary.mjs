// Sequential qualification only. No server, user documents or stores are touched.
import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {spawn,execFileSync} from 'node:child_process';
const baselineRevision='fc420bd074ae7ba5bf7cb580962b9af7d81d66f9';
const temp=await mkdtemp(path.join(tmpdir(),'boundary-proof-'));
try{
 for(const mode of ['baseline','qualified'])await build({entryPoints:[process.env.BOUNDARY_TYPING_ONLY?'src/qualification/native-knowledge/boundary-input-benchmark.ts':'src/qualification/native-knowledge/boundary-benchmark.ts'],outfile:path.join(temp,mode+'.mjs'),bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire as _createRequire} from 'node:module';const require=_createRequire(import.meta.url);"},target:'node22',logLevel:'warning',plugins:mode==='baseline'?[{name:'accepted-baseline',setup(b){b.onLoad({filter:/src\/block-tree\/repository\.ts$/},args=>({contents:execFileSync('git',['show',baselineRevision+':src/block-tree/repository.ts'],{encoding:'utf8'}),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
 for(const count of process.argv.slice(2).length?process.argv.slice(2):['1','10','100','300'])for(const mode of ['baseline','qualified']){
  const child=spawn(process.execPath,['--expose-gc',path.join(temp,mode+'.mjs'),count,mode],{stdio:'inherit'});const code=await new Promise(r=>child.once('exit',code=>r(code??1)));if(code!==0){process.exitCode=code;throw Error(`${mode} ${count} failed`);}
 }
}finally{await rm(temp,{recursive:true,force:true,maxRetries:3});}
