import {build} from 'esbuild';
import {spawn} from 'node:child_process';
const output='dist/server/qualify-sqlite-p3a.mjs';
await build({entryPoints:['scripts/qualify-sqlite-p3a.ts'],outfile:output,bundle:true,platform:'node',format:'esm',target:'node22',external:['better-sqlite3','fs-ext','express'],plugins:[{name:'host-client',setup(b){b.onResolve({filter:/knowledge-sqlite\/client\.mjs$/},()=>({path:'./knowledge-sqlite/client.mjs',external:true}));}}]});
const child=spawn(process.execPath,[output],{stdio:'inherit'});child.on('error',e=>{console.error(e);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
