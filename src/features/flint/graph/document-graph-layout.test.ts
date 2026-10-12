import {expect,it} from 'vitest';
import {documentGraphNodes} from './document-graph-layout';
it('uses only the supplied Document and entity identities, with stable view-only positions',()=>{
 const doc={id:'poem',title:'Poem'},rows=[{id:'person',name:'Eliot',documentMentions:3},{id:'place',name:'London',documentMentions:7}];
 const before=JSON.stringify({doc,rows}),nodes=documentGraphNodes(doc,rows);
 expect(nodes.map(n=>n.id)).toEqual(['document:poem','person','place']);
 expect(nodes.map(n=>n.relation)).toEqual(['Document','3 Document mentions','7 Document mentions']);
 expect(documentGraphNodes(doc,rows)).toEqual(nodes);
 nodes[1].x+=30;
 expect(JSON.stringify({doc,rows})).toBe(before);
 expect(documentGraphNodes(doc,[])).toHaveLength(1);
});
