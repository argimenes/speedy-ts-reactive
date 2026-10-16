import {parse} from 'parse5';
import {markdownTree,type MarkdownAdapter} from '../markdown-import';
import {escapeHtml} from '../export-plan';
import {managedAsset,assetKey} from '../managed-asset';
import {relativeLink} from './plan';
/** Reconcile only known original bindings. Edited/new targets are not inferred from title/basename. */
export function rewriteCollectionSource(source:string,format:'markdown'|'html',collection:any,path:string,paths:Record<string,string>,assets:Record<string,string>) {
 const edits:Array<{start:number;end:number;text:string}>=[],diagnostics=new Set<string>();
 const bindings=(Array.isArray(collection?.bindings)?collection.bindings:[]) as Array<{path:string;id?:string;image:boolean;url:string;wiki:boolean}>;
 const target=(url:string,image:boolean,wiki=false)=>{
  if(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url))return;
  // Exact authored spelling and kind must have resolved at import. An ambiguous/new link
  // must not become active merely because other bindings happen to name one candidate.
  const b=bindings.find(b=>b.url===url&&b.wiki===wiki&&b.image===image),asset=b&&managedAsset(collection?.assets?.[b.path]);
  const out=b&&(image?(asset&&assets[assetKey(asset)]):(b.id&&paths[b.id]));
  if(!out){diagnostics.add(`Source reference retained unresolved: ${url}`);return;}
  return relativeLink(path,out);
 };
 if(format==='markdown'){
  const adapter:MarkdownAdapter={
   text(n){const start=n.position?.start.offset;if(start===undefined||source.slice(start,n.position?.end.offset)!==n.value)return;
    for(const m of n.value.matchAll(/(!?)\[\[([^\]\r\n]+)\]\]/g)){const [url,label,...extra]=m[2].split('|');if(extra.length)continue;const to=target(url,!!m[1],true);if(to)edits.push({start:start+m.index!,end:start+m.index!+m[0].length,text:`${m[1]}[${(label??url).replace(/[\\\[\]]/g,'\\$&')}](<${to}>)`});}
    return undefined;
   },
   reference(n,url,image){const to=target(url,image),start=n.position?.start.offset,end=n.position?.end.offset;if(!to||start===undefined||end===undefined)return;
    const label='children' in n&&n.children.length?source.slice(n.children[0].position?.start.offset,n.children.at(-1)?.position?.end.offset):'alt' in n?String(n.alt??'').replace(/[\\\[\]]/g,'\\$&'):url;
    edits.push({start,end,text:`${image?'!':''}[${label}](<${to}>)`});return [];
   },
  };markdownTree(source,adapter);
 }else {
  const tree=parse(source,{sourceCodeLocationInfo:true});
  const visit=(n:any)=>{for(const a of n.attrs??[])if((n.tagName==='a'&&a.name==='href')||(n.tagName==='img'&&a.name==='src')){const to=target(a.value,n.tagName==='img'),loc=n.sourceCodeLocation?.attrs?.[a.name];if(to&&loc)edits.push({start:loc.startOffset,end:loc.endOffset,text:`${a.name}="${escapeHtml(to)}"`});}for(const c of n.childNodes??[])visit(c);};visit(tree);
  diagnostics.add('HTML source export includes a restrictive CSP; scripts, external resources and forms are disabled.');
 }
 let output=source;for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
 if(format==='html')output=`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">\n${output}`;
 return {text:output,diagnostics:[...diagnostics]};
}
