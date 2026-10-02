/** Qualification-only queries. No application API or Entity-authority switch. */
export function entityQuery(kind,ids=[]){
 const columns='guid,name,nameKey,typename,description,revision';
 const direct="SELECT s.targetEntityGuid FROM StandoffProperty s JOIN Block b ON b.guid=s.sourceBlockGuid WHERE s.typename='codex/entity-reference' AND s.resolution='direct' AND s.isDeleted=0 AND s.authoredId IS NOT NULL AND b.typename='standoff-editor-block' AND instr(s.text,?)>0";
 const match={exact:['nameKey=?','aliasKey=?',['edgar allan poe','edgar allan poe']],prefix:['nameKey>=? AND nameKey<?','aliasKey>=? AND aliasKey<?',['edgar','edgas','edgar','edgas']],substring:['instr(nameKey,?)>0','instr(aliasKey,?)>0',['allan','allan']]};
 if(kind==='guid')return {sql:`SELECT ${columns} FROM Entity WHERE guid IN (${ids.map(()=>'?').join(',')}) ORDER BY guid`,args:ids};
 if(kind==='lexical')return {sql:`SELECT ${columns} FROM Entity WHERE guid IN (SELECT e.guid FROM EntitySearch f JOIN Entity e ON e.id=f.rowid WHERE EntitySearch MATCH ? UNION SELECT a.entityGuid FROM EntityAliasSearch f JOIN EntityAlias a ON a.id=f.rowid WHERE EntityAliasSearch MATCH ? AND a.origin IN ('curated','imported')) ORDER BY nameKey,guid LIMIT 50`,args:['name : "poe"','alias : "poe"']};
 if(kind==='mention')return {sql:`SELECT ${columns} FROM Entity WHERE guid IN (SELECT guid FROM Entity WHERE instr(nameKey,?)>0 UNION SELECT entityGuid FROM EntityAlias WHERE instr(aliasKey,?)>0 AND origin IN ('curated','imported') UNION ${direct}) ORDER BY nameKey,guid LIMIT 50`,args:['quoth','quoth','quoth']};
 const [name,alias,args]=match[kind];return {sql:`SELECT ${columns} FROM Entity WHERE guid IN (SELECT guid FROM Entity WHERE ${name} UNION SELECT entityGuid FROM EntityAlias WHERE (${alias}) AND origin IN ('curated','imported')) ORDER BY nameKey,guid LIMIT 50`,args};
}
