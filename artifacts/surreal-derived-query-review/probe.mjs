// Inspection only. Executes the existing, unchanged server indexer in mem://.
// Does not import server/index.ts (which starts HTTP/persistent storage), touch appdb,
// or introduce a production adapter. Run from the repository root.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {transform} from 'esbuild';
import {Surreal,RecordId} from 'surrealdb';
import {surrealdbNodeEngines} from '@surrealdb/node';
const source=await readFile('server/index.ts','utf8');
const fragment=source.slice(source.indexOf('const saveDocumentIndex ='),source.indexOf("app.get('/test.html'"));
assert(fragment.includes('const generateIndex ='));
const {code}=await transform(fragment,{loader:'ts',format:'cjs',target:'es2022'});
const db=new Surreal({engines:surrealdbNodeEngines()});await db.connect('mem://');await db.use({namespace:'inspection',database:'derived'});
const index=new Function('db','RecordId',code+'\nreturn saveDocumentIndex;')(db,RecordId);
const count=async table=>Number((await db.query(`SELECT count() AS total FROM ${table} GROUP ALL`))[0][0]?.total??0);
const record=async sql=>(await db.query(sql))[0];
const results={scope:'Unmodified server/index.ts indexing functions, installed SurrealDB embedded mem engine; no live database inspected or changed',checks:[]};
const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);results.checks.push({name,actual});};
try {
 const doc={id:'root-block',type:'document-block',metadata:{documentId:'canonical-resource',filepath:'/fixture/paper.json'},linkedAnnotations:{shared:{type:'codex/entity-reference',value:'agent-a'}},children:[{id:'paragraph',type:'standoff-editor-block',text:'A🧭BC',standoffProperties:[{id:'entity-mention',type:'codex/entity-reference',value:'agent-a',start:1,end:1},{id:'native-reference',type:'codex/block-reference',value:'target-root',metadata:{documentId:'target-resource'},start:2,end:3}],blockProperties:[]}],relation:{leftMargin:{id:'margin',type:'standoff-editor-block',text:'Margin'}}};
 await index(doc);
 check('Document key is root Block ID, not canonical resource ID',(await record('SELECT * FROM Document')).map(r=>String(r.id)),['Document:⟨root-block⟩']);
 const text=(await record('SELECT * FROM TextBlock'))[0];
 check('Document row omits linked definition registry',Object.hasOwn((await record('SELECT * FROM Document'))[0],'linkedAnnotations'),false);
 check('TextBlock has no assigned documentId',Object.hasOwn(text,'documentId'),false);
 check('TextBlock keeps raw native-reference payload but does not index it',text.standoffProperties.some(p=>p.type==='codex/block-reference'),true);
 check('Only entity-reference StandoffProperty is indexed',await count('StandoffProperty'),1);
 check('Current all-text code-point slice handles non-BMP emoji',(await record('SELECT * FROM StandoffProperty'))[0].text,'🧭');
 check('Owned margin relation is not traversed',await count('TextBlock'),1);
 await index(doc);check('Second save duplicates mention edges',await count('standoff_property_refers_to_agent'),2);
 doc.children[0].standoffProperties[0].value='agent-b';await index(doc);
 check('Retarget leaves old and new Agent edges',(await record('SELECT out FROM standoff_property_refers_to_agent')).map(r=>String(r.out)).sort(),['Agent:⟨agent-a⟩','Agent:⟨agent-a⟩','Agent:⟨agent-b⟩'].sort());
 doc.children[0].standoffProperties[0].isDeleted=true;await index(doc);
 check('Deleted annotation leaves old StandoffProperty',await count('StandoffProperty'),1);
 check('Deleted annotation leaves old relationship rows',await count('standoff_property_refers_to_agent'),3);
 doc.children=[];await index(doc);check('Removed Block leaves stale TextBlock',await count('TextBlock'),1);
 const nested={id:'outer',type:'document-block',children:[{id:'inner',type:'document-block',linkedAnnotations:{nested:{type:'codex/entity-reference',value:'agent-a'}},children:[{id:'nested-text',type:'standoff-editor-block',text:'Nested',standoffProperties:[{id:'nested-mention',annotationId:'nested',start:0,end:5}]}]}]};
 await index(nested);check('Children traversal crosses nested Document boundary',await count('TextBlock'),2);check('Nested Document linked definition is not resolved',await count('StandoffProperty'),1);
 doc.children=[{id:'linked-text',type:'standoff-editor-block',text:'Two segments',standoffProperties:[{id:'segment-one',annotationId:'shared',start:0,end:2},{id:'segment-two',annotationId:'shared',start:4,end:11}]}];await index(doc);
 check('One local linked mention produces two property records',await count('StandoffProperty'),3);
 check('Flattened mention records omit annotationId',(await record('SELECT * FROM StandoffProperty')).every(r=>!Object.hasOwn(r,'annotationId')),true);
 // Surreal is capable of executing the current implementation. The missing cleanup
 // is application behavior, not an inferred database limitation.
 results.passed=results.checks.length;
 await writeFile('artifacts/surreal-derived-query-review/probe-results.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
} finally {await db.close();}
