export type SqlValue=['null']|['integer'|'real'|'text'|'blob',string];
export interface PackageData {kind:'mutable-package-data';version:1;readOnly:true;encoding:'sqlite-storage-class-v1';tables:Array<{name:string;classification:string;columns:string[];rows:SqlValue[][]}>;provenance:Record<string,unknown>;selection:Record<string,unknown>;unresolved:unknown[];excluded:unknown[];metrics?:Record<string,number>}
/** Validation never executes DDL, parses authored JSON or resolves a canonical service. */
export function validatePackageData(value:unknown):PackageData {
 const d=value as PackageData;if(d?.kind!=='mutable-package-data'||d.version!==1||d.readOnly!==true||d.encoding!=='sqlite-storage-class-v1'||!Array.isArray(d.tables)||d.tables.length>64||!Array.isArray(d.unresolved)||!Array.isArray(d.excluded))throw Error('Invalid PackageDataBlock');
 const names=new Set<string>();let rows=0;
 for(const t of d.tables){if(typeof t.name!=='string'||names.has(t.name)||!Array.isArray(t.columns)||t.columns.length>128||t.columns.some(c=>typeof c!=='string')||new Set(t.columns).size!==t.columns.length||!Array.isArray(t.rows))throw Error('Invalid package table');names.add(t.name);
  for(const row of t.rows){if(++rows>5000||!Array.isArray(row)||row.length!==t.columns.length)throw Error('Invalid package row');for(const v of row){if(!Array.isArray(v)||!(v[0]==='null'?v.length===1:v.length===2&&typeof v[1]==='string'&&(v[0]==='text'||v[0]==='integer'&&/^-?(0|[1-9][0-9]*)$/.test(v[1])&&BigInt(v[1])>=-9223372036854775808n&&BigInt(v[1])<=9223372036854775807n||v[0]==='real'&&/^[0-9a-f]{16}$/.test(v[1])||v[0]==='blob'&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v[1]))))throw Error('Invalid SQL storage value');}}
 }return d;
}
export function displaySql(v:SqlValue):string|null {if(v[0]==='null')return null;if(v[0]==='real'){const raw=Uint8Array.from(v[1].match(/../g)!,s=>parseInt(s,16));return String(new DataView(raw.buffer).getFloat64(0));}return v[0]==='blob'?`BLOB (base64): ${v[1]}`:v[1];}
/** Raw field dictionaries, indexed once per opened package; no competing domain model. */
export class PackageDataReader {
 readonly tables=new Map<string,Array<Record<string,string|null>>>();
 constructor(readonly data:PackageData){validatePackageData(data);for(const t of data.tables)this.tables.set(t.name,t.rows.map(r=>Object.fromEntries(t.columns.map((c,i)=>[c,displaySql(r[i])]))));}
 claim(guid:string){const claim=this.tables.get('Claim')?.find(r=>r.guid===guid),records=Object.fromEntries(['ClaimParticipant','ClaimQualifier','ClaimEvidence'].map(name=>[name,this.tables.get(name)?.filter(r=>r.claimGuid===guid)??[]]));const entities=new Set([...records.ClaimParticipant,...records.ClaimQualifier].map(r=>r.entityGuid));return {claim,records:{...records,Entity:this.tables.get('Entity')?.filter(r=>entities.has(r.guid))??[]},boundaries:[...this.data.unresolved,...this.data.excluded]};}
 entity(guid:string){const entity=this.tables.get('Entity')?.find(r=>r.guid===guid);const claims=new Set(['ClaimParticipant','ClaimQualifier'].flatMap(t=>this.tables.get(t)?.filter(r=>r.entityGuid===guid).map(r=>r.claimGuid)??[]));return {entity,records:Object.fromEntries([...this.tables].map(([name,rows])=>[name,rows.filter(r=>r.entityGuid===guid||r.sourceEntityGuid===guid||r.targetEntityGuid===guid||r.claimGuid&&claims.has(r.claimGuid)||name==='Claim'&&claims.has(r.guid))]).filter(([,rows])=>rows.length)),boundaries:[...this.data.unresolved,...this.data.excluded]};}
}
