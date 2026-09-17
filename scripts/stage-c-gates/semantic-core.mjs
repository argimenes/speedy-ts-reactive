import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
export async function semanticCore() {
  const source = `
import {openLegacyInMemory} from './src/block-tree/portable-spike/codec';
import {projectOwned} from './src/history/stage-c-gates/resource';
import {encodeGateDocument,decodeGateDocument} from './src/history/stage-c-gates/portable';
import {openGateEditor} from './src/history/stage-c-gates/editor';
import {captureBlocks,cloneBlocks} from './src/block-tree/clipboard';
import {encodeWire,decodeWire} from './src/history/preplan-spike/wire';
function normalize(legacy,resourceId) {
 const session=openLegacyInMemory(legacy,resourceId); if(session.status!=='ready') return session;
 const root=session.state.placements[session.state.rootPlacementKey];
 const ids=new Map(session.bindings.placementIds);
 for(const p of Object.values(session.state.placements)) if(p.kind==='inline') ids.set(p.key,'private-cell:'+p.key);
 const snapshot=projectOwned(session.state,resourceId,{contents:new Map(Object.keys(session.state.contents).map(k=>[k,resourceId])),placementIds:ids,externalTargets:new Map(),root:{key:root.key,contentKey:root.contentKey,placementId:ids.get(root.key)}},0);
 const editor=openGateEditor(snapshot); const baseline=editor.snapshot(); editor.stop();
 return {status:'ready',document:encodeGateDocument(baseline),baselineWire:encodeWire(baseline)};
}
function reopen(document) {const editor=openGateEditor(decodeGateDocument(document)); const baseline=editor.snapshot();editor.stop();return {document:encodeGateDocument(baseline),baselineWire:encodeWire(baseline)};}
function duplicate(document,resourceId) {
 const editor=openGateEditor(decodeGateDocument(document));
 const fragment=cloneBlocks(captureBlocks(editor.repository.snapshot(),[editor.repository.readState().rootPlacementKey])); editor.stop();
 const state=fragment.state, root=state.placements[state.rootPlacementKey];
 const snapshot=projectOwned(state,resourceId,{contents:new Map(Object.keys(state.contents).map(k=>[k,resourceId])),placementIds:new Map(),externalTargets:new Map(),root:{key:root.key,contentKey:root.contentKey,placementId:root.placementId}},0);
 return {document:encodeGateDocument(snapshot),baselineWire:encodeWire(snapshot)};
}
module.exports={normalize,reopen,duplicate,encodeWire,decodeWire};`;
  const compiled = await build({ stdin: { contents: source, resolveDir: fileURLToPath(new URL('../../', import.meta.url)), loader: 'ts' }, bundle: true,
    platform: 'node', format: 'cjs', conditions: ['browser'], write: false, logLevel: 'silent' });
  const module = { exports: {} }; new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}
