import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {spawn,execFileSync} from 'node:child_process';
const temp=await mkdtemp(path.join(tmpdir(),'boundary-legacy-memory-'));
try{
 for(const mode of ['baseline','qualified']){
  const entry=path.join(temp,mode+'.mjs');
  await build({entryPoints:['src/qualification/native-knowledge/boundary-legacy-memory.ts'],outfile:entry,bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'warning',banner:{js:"import {createRequire as _createRequire} from 'node:module';const require=_createRequire(import.meta.url);"},plugins:mode==='baseline'?[{name:'accepted-baseline',setup(b){b.onLoad({filter:/src\/block-tree\/repository\.ts$/},args=>({contents:execFileSync('git',['show','fc420bd074ae7ba5bf7cb580962b9af7d81d66f9:src/block-tree/repository.ts'],{encoding:'utf8'}),loader:'ts',resolveDir:path.dirname(args.path)}));}}]:[]});
  const child=spawn(process.execPath,['--expose-gc',entry,mode],{stdio:'inherit'});const code=await new Promise(resolve=>child.once('exit',code=>resolve(code??1)));if(code)throw Error(`${mode} failed: ${code}`);
 }
}finally{await rm(temp,{recursive:true,force:true});}
