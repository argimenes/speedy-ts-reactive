// Qualification-only source instrumentation. No measurement hook enters production.
// Timings are inclusive/nested and must not be summed as exclusive phase costs.
import ts from 'typescript';
export function activationMeasurement() {
 const functions = {
  '/application/document-application-capabilities.tsx': {deriveVaultState:'vault.derive',activateSaved:'activation.live-validation-and-navigation',navigate:'navigation',openDocument:'occurrence.open'},
  '/application/document-vault.ts': {refresh:'discovery.refresh'},
  '/application/saved-result-activation.ts': {prepare:'activation.prepare'},
  '/persistence/native-session.ts': {request:'request',openResource:'native.openResource',openVerified:'native.openVerified',bind:'native.bind',verifySelected:'native.verifySelected'},
  '/persistence/native-resource.ts': {decodeNative:'native.decode',admitNative:'native.admission'},
  '/block-tree/repository.ts': {commit:'repository.commit'},
  '/rendering/transient-document-view.tsx': {TransientDocumentView:'occurrence.construct'},
 };
 return {name:'native-activation-measurement',enforce:'pre',transform(code,id){
  const file=id.split('?')[0],key=Object.keys(functions).find(k=>file.endsWith(k));if(!key)return;
  const source=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS),edits=[];
  const wrap=(start,end,label,async,body=false)=>{const method=async?'async':'sync';edits.push({at:start,text:(body?'return ':'')+`globalThis.__activationMetrics.${method}(${label}, ${async?'async ':''}() => ${body?'{':'('}`});edits.push({at:end,text:body?'});':'))'});};
  const visit=node=>{
   if((ts.isFunctionDeclaration(node)||ts.isMethodDeclaration(node)||ts.isFunctionExpression(node)||ts.isArrowFunction(node))&&node.body&&ts.isBlock(node.body)){
    const name=node.name?.getText(source)??(ts.isVariableDeclaration(node.parent)?node.parent.name.getText(source):undefined),label=functions[key][name];
    if(label)wrap(node.body.getStart(source)+1,node.body.end-1,label==='request'?'"native.request."+action':JSON.stringify(label),!!node.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword),true);
   }
   if(ts.isCallExpression(node)){
    const name=node.expression.getText(source);
    if(key.includes('document-application-capabilities')&&['observeLive','runSearchWorker','revealMatch','editor.focus.request','mount.restoreInlineSelection','mount.restoreSelection'].includes(name))
     wrap(node.getStart(source),node.end,JSON.stringify('navigation.'+name),['observeLive','runSearchWorker','revealMatch'].includes(name));
    if(key.includes('/block-tree/repository')&&name==='batch'&&source.text.slice(node.pos,node.end).includes('this.setState(reconcile(next))'))wrap(node.getStart(source),node.end,'"repository.publication"',false);
   }
   ts.forEachChild(node,visit);
  };
  visit(source);edits.sort((a,b)=>b.at-a.at);for(const e of edits)code=code.slice(0,e.at)+e.text+code.slice(e.at);return code;
 }};
}
export const measurementBootstrap = `globalThis.__activationMetrics={active:false,events:[],sync(label,fn){if(!this.active)return fn();const start=performance.now();try{return fn()}finally{this.events.push({label,start,ms:performance.now()-start})}},async async(label,fn){if(!this.active)return fn();const start=performance.now();try{return await fn()}finally{this.events.push({label,start,ms:performance.now()-start})}}};`;
