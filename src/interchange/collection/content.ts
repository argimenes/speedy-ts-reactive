import type { HtmlNode } from '../html-ast';
import { parseClipboardHtml } from '../html-ast';
import { importSemanticHtml } from '../html-import';
import { importMarkdown, type MarkdownAdapter } from '../markdown-import';
import { plainFragment } from '../serializer';
import { documentFragment } from '../document-import';
import { sourceFragment } from '../source-block';
import { decodeSource } from '../file-input';
import type { MutableFragment } from '../fragment';
import { materializeFragment } from '../materialize';
import { captureNative, nativeText } from '../../persistence/native-resource';
import { hash } from '../package/archive';
import type { Entry, CollectionPlan, DocumentPlan } from './plan';
import { resolvePath } from './plan';
import { assetKey, type AssetManifest } from '../managed-asset';
export type Binding = {marker:string;path:string;id?:string;image:boolean;url:string;wiki:boolean};
export type PreparedDocument = {fragment:MutableFragment;bindings:Binding[];diagnostics:string[];source?:string;format:'markdown'|'html'|'text'};
const text=(value:string):HtmlNode=>({nodeName:'#text',value});
const node=(tagName:string,children:HtmlNode[],attrs:Record<string,string>):HtmlNode=>({nodeName:tagName,tagName,childNodes:children,attrs:Object.entries(attrs).map(([name,value])=>({name,value}))});
/** Adapt the existing parser's semantic nodes only: never regex-rewrite code, raw HTML or URLs. */
export function collectionMarkdown(source:string, path:string, entries:Entry[], documents:DocumentPlan[]) {
 const bindings:Binding[]=[],diagnostics=new Set<string>(),nonce=crypto.randomUUID();
 const resolve=(url:string,image:boolean,children:HtmlNode[],literal:string,wiki=false,title?:string|null):HtmlNode[]|undefined=>{
  const result=resolvePath(path,url,entries,wiki);
  if(result.external){if(image)diagnostics.add(`Remote image retained without acquisition: ${url}`);return wiki?[text(literal)]:undefined;}
  const entry=result.entry,doc=entry&&documents.find(d=>d.source===entry.path&&d.status!=='skipped');
  if(!entry||image&&entry.kind!=='image'||!image&&!doc){diagnostics.add(`${url}: ${result.reason??(image?'Document transclusion is unsupported':'Target is not an imported document')}`);return [text(literal)];}
  const binding:Binding={marker:`https://collection.invalid/${nonce}/${bindings.length}`,path:entry.path,image,url,wiki,...(doc?{id:doc.id}:{})};bindings.push(binding);
  const target=binding.marker;
  return [node(image?'img':'a',image?[]:children,image?{src:target,alt:children.map(c=>c.value??'').join(''),...(title?{title}:{})}:{href:target,...(title?{title}:{})})];
 };
 const adapter:MarkdownAdapter={
  text(n){
   // Only an unchanged literal text node is eligible. Escaped brackets and entities stay literal.
   const raw=source.slice(n.position?.start.offset??0,n.position?.end.offset??0);if(raw!==n.value)return;
   const out:HtmlNode[]=[];let at=0;
   for(const m of n.value.matchAll(/(!?)\[\[([^\]\r\n]+)\]\]/g)){
    out.push(text(n.value.slice(at,m.index)));const [target,label,...extra]=m[2].split('|');
    if(extra.length||!target||m[1]&&label!==undefined){out.push(text(m[0]));diagnostics.add(`Unsupported wiki syntax: ${m[0]}`);}
    else out.push(...resolve(target,!!m[1],[text(label??target)],m[0],true)??[text(m[0])]);
    at=m.index!+m[0].length;
   }
   out.push(text(n.value.slice(at)));return out;
  },
  reference(n,url,image,children){return resolve(url,image,children,source.slice(n.position?.start.offset??0,n.position?.end.offset??0),false,'title' in n?n.title:undefined);},
 };
 if(/^---\r?\n/.test(source))diagnostics.add('YAML frontmatter has no active metadata semantics; its original source is retained in collection provenance.');
 if(/(?:\^\w+|%%|\{\{)/.test(source))diagnostics.add('Plugin syntax and block identifiers are retained without interpretation.');
 const imported=importMarkdown(source,undefined,adapter);if(imported.notice)diagnostics.add(imported.notice);
 return {fragment:imported.fragment??plainFragment(''),bindings,diagnostics:[...diagnostics]};
}
export async function prepareCollectionDocument(blob:Blob,entry:Entry,plan:CollectionPlan):Promise<PreparedDocument> {
 const bytes=new Uint8Array(await blob.arrayBuffer());if(await hash(bytes)!==entry.hash)throw Error('Source changed after inventory. Reselect and review.');
 const {source}=decodeSource(bytes),format=entry.kind as PreparedDocument['format'];let fragment:MutableFragment,bindings:Binding[]=[],diagnostics:string[]=[];
 if(format==='markdown')({fragment,bindings,diagnostics}=collectionMarkdown(source,entry.path,plan.entries,plan.documents));
 else if(format==='html'){
  const parsed=parseClipboardHtml(source),nonce=crypto.randomUUID();
  const walk=(n:HtmlNode)=>{for(const a of n.attrs??[])if((n.tagName==='a'&&a.name==='href')||(n.tagName==='img'&&a.name==='src')){
   const result=resolvePath(entry.path,a.value,plan.entries),image=n.tagName==='img',doc=result.entry&&plan.documents.find(d=>d.source===result.entry!.path&&d.status!=='skipped');
   if(result.entry&&(image?result.entry.kind==='image':!!doc)){const b={marker:`https://collection.invalid/${nonce}/${bindings.length}`,path:result.entry.path,image,url:a.value,wiki:false,...(doc?{id:doc.id}:{})};bindings.push(b);a.value=b.marker;}
   else if(!result.external)diagnostics.push(`${a.value}: ${result.reason??'Unsupported target'}`);
  }for(const c of n.childNodes??[])walk(c);};walk(parsed.tree);
  const result=importSemanticHtml(parsed.tree);fragment=result.fragment??plainFragment('');if(result.notice)diagnostics.push(result.notice);
 }else fragment=plainFragment(source);
 if(fragment.embeds.filter(e=>e.type==='image-cell').length>20)throw Error('Per-document image limit: 20 image descriptors.');
 if(plan.mode==='source'&&format!=='text')fragment=sourceFragment(format,source);
 return {fragment,bindings,diagnostics,format,...(plan.mode==='source'||/^---\r?\n/.test(source)?{source}:{})};
}
export function collectionNative(prepared:PreparedDocument,plan:CollectionPlan,doc:DocumentPlan,assets:Record<string,AssetManifest>) {
 const f=structuredClone(prepared.fragment);
 for(const e of f.embeds){const ref=e.asset;const a=ref?.kind==='local'?f.assets.find(a=>a.localId===ref.id):undefined;const url=a?.source.url??e.data.src;const binding=prepared.bindings.find(b=>b.image&&b.marker===url),asset=binding&&assets[binding.path];
  if(asset){const ref={kind:'managed' as const,cavernId:asset.cavernId,assetId:asset.assetId};e.data={alt:String(e.data.alt??''),...(typeof e.data.title==='string'?{title:e.data.title}:{}),src:'',asset:ref,width:typeof e.data.width==='number'&&e.data.width>0&&e.data.width<=16384?e.data.width:asset.width??0,height:typeof e.data.height==='number'&&e.data.height>0&&e.data.height<=16384?e.data.height:asset.height??0};if(a)a.source=ref;}
 }
 const wrapped=documentFragment(f,doc.source.split('/').at(-1)!.replace(/\.[^.]+$/,''),doc.path.split('/').at(-1)!);
 const native=materializeFragment(wrapped,{cavernId:plan.cavernId},new Map(Object.values(assets).map(a=>[assetKey(a),a.assetId])));
 const root=native.state.contents[native.state.placements[native.roots[0]].contentKey];root.payload.id=doc.id;
 const metadata=root.payload.metadata as any;
 root.payload.metadata={...metadata,documentId:doc.id,collection:{version:1,operationId:plan.id,dialect:'mutable-markdown-vault-v1',sourcePath:doc.source,sourceHash:plan.entries.find(e=>e.path===doc.source)!.hash,format:prepared.format,mode:plan.mode,diagnostics:prepared.diagnostics,bindings:prepared.bindings.map(({marker,...b})=>b),assets,...(prepared.source!==undefined?{originalSource:prepared.source}:{})}};
 root.payload.linkedAnnotations=native.linkedAnnotations??{};
 // Only operation-generated markers can become trusted references. Generic clipboard admission is unchanged.
 for(const c of Object.values(native.state.contents))for(const p of (c.payload.standoffProperties??[]) as any[]){const binding=prepared.bindings.find(b=>!b.image&&b.marker===p.value);if(binding?.id){p.type='codex/block-reference';p.value=binding.id;p.metadata={documentId:binding.id};}}
 const value=nativeText(captureNative(native.state,doc.id));if(new TextEncoder().encode(value).length>20*1024*1024)throw Error('Native document exceeds the writer limit.');return value;
}
