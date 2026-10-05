/** Build the established workers and invoke the disposable-vault importer. */
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
async function run(args){const child=spawn(process.execPath,args,{stdio:'inherit'});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0)process.exit(Number(code)||1);}
await run([fileURLToPath(new URL('./build-history-worker.mjs',import.meta.url))]);
await run([fileURLToPath(new URL('./build-sqlite-foundation.mjs',import.meta.url))]);
await run([fileURLToPath(new URL('../dist/server/mutable-legacy-import.mjs',import.meta.url)),...process.argv.slice(2)]);
