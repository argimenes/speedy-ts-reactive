// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {defaultReader,validateReader,themeCss} from './reader';
import {SearchShards,searchEntry,words,SEARCH_LIMITS} from './search';
import {readerPage} from './shell';
import {publicProjection} from './projection';
import {decodeBlockTree} from '../block-tree/codecs';
import {captureNative,nativeText} from '../persistence/native-resource';
import {candidate,publicSemantics} from './research';
import {PackageDataReader,type PackageData} from '../interchange/package/data';
const profile={title:'Public title',route:'index.html',images:false,outboundLinks:false,includeMargins:false,reader:defaultReader()};
it('allows only bounded theme tokens, preserves static reading and rejects authored CSS/URLs',()=>{
 for(const name of ['reader','compact'] as const)for(const colour of ['paper','slate','high-contrast'] as const){const r={...defaultReader(),theme:{...defaultReader().theme,name,colour}};validateReader(r);expect(themeCss(r.theme)).not.toMatch(/url\(|@import/);}
 for(const patch of [{size:1000},{colour:'url(https://private)'},{font:'<script>'},{arbitrary:'x'}])expect(()=>validateReader({...defaultReader(),theme:{...defaultReader().theme,...patch}})).toThrow();
 const html=readerPage({...profile,reader:{...defaultReader(),preset:'static',search:false}},'index.html','<Title>','<p>Text</p>');expect(html).not.toContain('<script');expect(html).toContain('&lt;Title&gt;');expect(html).toContain('<p>Text</p>');
});
it('search normalizes Unicode, weights titles/headings and bounds shards without truncation',async()=>{
 expect(words('ＡＢＢＥＹ Rome Étoile')).toEqual(['abbey','rome','étoile']);const e=searchEntry('a.html','Abbey','Rome abbey',['Rome']);expect(e.terms.abbey).toBeGreaterThan(e.terms.rome);
 const output:Array<[string,string]>=[],shards=new SearchShards(async(p,t)=>{output.push([p,t]);});for(let i=0;i<6;i++)await shards.add(searchEntry(`page-${i}.html`,'Title','word '.repeat(40000)));await shards.flush();expect(output.length).toBeGreaterThan(1);expect(output.every(([,s])=>new TextEncoder().encode(s).length<=SEARCH_LIMITS.shard)).toBe(true);expect(output.flatMap(([,s])=>JSON.parse(s))).toHaveLength(6);
 expect(()=>searchEntry('large.html','Title','word '.repeat(300000))).toThrow('1 MiB');
 const bounded=new SearchShards(async()=>{}),large=searchEntry('large.html','Title','word '.repeat(150000));await expect((async()=>{for(let i=0;i<50;i++)await bounded.add(large);await bounded.flush();})()).rejects.toThrow('32 MiB');
});
it('uses only reading-reachable annotations and text as public/search inputs',()=>{
 const state=decodeBlockTree({id:'document-secret-id',type:'document-block',metadata:{secret:'PRIVATE_METADATA_CANARY'},children:[{id:'text',type:'standoff-editor-block',text:'Abbey in Rome',standoffProperties:[{id:'private-property-id',type:'codex/entity-reference',value:'private-entity-id',start:0,end:4,attributes:{secret:'PRIVATE_ATTRIBUTE_CANARY'}}]},{id:'archive',type:'mutable/package-data-block',packageContext:{data:{secret:'PRIVATE_ARCHIVE_CANARY'}}}],relations:{leftMargin:{id:'margin',type:'standoff-editor-block',text:'PRIVATE_MARGIN_CANARY'}}}).state;
 const projection=publicProjection(new TextEncoder().encode(nativeText(captureNative(state,'document-secret-id'))),profile,'vault',undefined,id=>'b-'+Buffer.from(id).toString('hex'));
 const bytes=projection.html+JSON.stringify(projection.search);expect(bytes).not.toMatch(/PRIVATE_|private-entity-id|document-secret-id|private-property-id/);expect(projection.targets).toMatchObject([{kind:'entity',id:'private-entity-id',sourceVault:'vault'}]);expect(projection.search?.terms.abbey).toBe(1);
});
it('projects only selected fields, never Claim closure participants or raw archival attributes',()=>{
 const data:PackageData={kind:'mutable-package-data',version:1,readOnly:true,encoding:'sqlite-storage-class-v1',provenance:{},selection:{},unresolved:[],excluded:[],tables:[{name:'Entity',classification:'canonical',columns:['guid','name','description','attributes','typename'],rows:[[['text','private-guid'],['text','Approved name'],['text','PRIVATE_DESCRIPTION_CANARY'],['text','PRIVATE_ATTRIBUTES_CANARY'],['text','Person']]]}]};
 const c=candidate(new PackageDataReader(data),{kind:'entity',id:'private-guid'},'e-'+'a'.repeat(32))!;
 const result=publicSemantics({source:{kind:'live'},fingerprint:'a'.repeat(64),candidates:[c],diagnostics:[]},[],[{key:c.key,fields:[]}]);expect(JSON.stringify(result.entries)).toContain('Approved name');expect(JSON.stringify(result.entries)).not.toMatch(/PRIVATE_|private-guid/);expect(publicSemantics({source:{kind:'live'},fingerprint:'a'.repeat(64),candidates:[c],diagnostics:[]},[],[{key:c.key,fields:['description']}]).entries[0].description).toBe('PRIVATE_DESCRIPTION_CANARY');
});
it('keeps overlapping reviewed references accessible without nesting anchor elements',()=>{
 const state=decodeBlockTree({id:'doc',type:'document-block',metadata:{documentId:'doc'},children:[{id:'text',type:'standoff-editor-block',text:'Abbey Rome',standoffProperties:[{id:'a',type:'codex/entity-reference',value:'one',start:0,end:7},{id:'b',type:'codex/entity-reference',value:'two',start:3,end:9}]}]}).state;
 const entries=['one','two'].map((name,i)=>({key:'e-'+String(i).repeat(32),name,kind:'entity' as const,kindLabel:'Place'})),research={fingerprint:'f'.repeat(64),entries,bindings:entries.map((e,i)=>({resourceId:'doc',kind:'entity' as const,id:['one','two'][i],key:e.key}))};
 const p=publicProjection(new TextEncoder().encode(nativeText(captureNative(state,'doc'))),profile,'vault',undefined,id=>'b-'+Buffer.from(id).toString('hex'),research);
 expect(p.html).not.toMatch(/<a[^>]*>[^<]*<a/);for(const e of entries)expect(p.html).toContain(`entities/${e.key}.html`);expect(p.diagnostics.join(' ')).toContain('Overlapping links');
});
