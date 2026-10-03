import {expect,it} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {recognizeCompatibleDocument} from './compatible-document';
import {resourceToRepository} from '../history/durable-core';
import {encodeDocument} from '../block-tree/codecs';
import {nativeText} from './native-resource';
it('reports actual historical codec round-trip capability without using suffix as permission',()=>{
 const rows=[];
 for(const name of readdirSync('data').filter(n=>n.endsWith('.json'))){
  try {const recognized=recognizeCompatibleDocument(readFileSync('data/'+name));const state=resourceToRepository(recognized.resource);const encoded=encodeDocument(state);const again=recognizeCompatibleDocument(new TextEncoder().encode(JSON.stringify(encoded)));
   const semantic=r=>{const v=JSON.parse(nativeText(r));delete v.document.root.placementId;for(const b of v.document.blocks){for(const e of b.children??[])delete e.placementId;for(const e of Object.values(b.relations?.owned??{}))delete e.placementId;}return JSON.stringify(v);};
   const same=semantic(recognized.resource)===semantic(again.resource);rows.push({name,format:recognized.format,roundTrip:same});
  }catch(e){rows.push({name,error:String(e)});}
 }
 console.log('ACTUAL_CORPUS_CODEC',JSON.stringify(rows));expect(rows.some(r=>r.name==='raven.json'&&r.roundTrip)).toBe(true);
});
