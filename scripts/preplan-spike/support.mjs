import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
export async function core() {
  const source = `
import {decodeDocument} from './src/block-tree/codecs';
import {applyBlockIdentityNormalization,planBlockIdentityNormalization} from './src/block-tree/identity';
import {CanonicalRepository} from './src/block-tree/repository';
import {TreeCommands} from './src/block-tree/commands';
import {encodeWire,decodeWire} from './src/history/preplan-spike/wire';
import {applyHistoryChanges} from './src/history/replay';
function fixture(length) {
 const s=decodeDocument({id:'doc',type:'document-block',children:[{id:'p',type:'standoff-editor-block',text:'x'.repeat(length),standoffProperties:[{id:'a',start:0,end:1,type:'style/bold'}]}]}).state;
 return applyBlockIdentityNormalization(s,planBlockIdentityNormalization(s));
}
module.exports={fixture,CanonicalRepository,TreeCommands,encodeWire,decodeWire,applyHistoryChanges};`;
  const compiled=await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'cjs',conditions:['browser'],write:false,logLevel:'silent'});
  const module={exports:{}}; new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports); return module.exports;
}
export const round=n=>+n.toFixed(3);
export const summary=values=>({samples:values.length,medianMs:round([...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]),p95Ms:round([...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1])});
export async function timed(fn) {const start=performance.now();const result=await fn();return {result,ms:performance.now()-start};}
