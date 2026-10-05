/** Approved construct mapping. No SQL, ontology inference or value-based merging. */
import type {SemanticCommand} from '../src/feature-api/semantics';
import {importGuid,digest,stable,type SourceInventory,type SourceRow,type ImportStatus} from './legacy-import-source';
export interface ImportDiagnostic {key:string;source:string;ordinal?:number;legacyGuid?:string;destination?:{recordType:string;guid:string};status:ImportStatus;disposition:'IMPORT'|'PRESERVE'|'UNRESOLVED'|'QUARANTINE';reason?:string;warnings?:string[]}
export interface ImportJob {key:string;command:SemanticCommand;dependencies:string[];rows:SourceRow[];mappings:Array<{row:SourceRow;recordType:string;guid:string}>;warnings:string[];disposition:'IMPORT'|'PRESERVE'}
export interface GraphPlan {base:ImportJob[];aggregates:ImportJob[];relationships:ImportJob[];memberships:ImportJob[];diagnostics:ImportDiagnostic[];nodeKinds:Map<string,string>;counts:Record<string,number>}
export function buildLegacyGraphPlan(source:SourceInventory,run:{id:string;fingerprint:string},referencedGuids:Set<string>):GraphPlan{
 const plan:GraphPlan={base:[],aggregates:[],relationships:[],memberships:[],diagnostics:[],nodeKinds:new Map(),counts:{}},nodes=source.nodes,edges=source.edges;
 const rows=(family:string)=>edges.get(family)??[],node=(family:string)=>(nodes.get(family)??[]).filter(r=>!ambiguous.has(r.raw.Guid)&&!invalidNodes.has(r.key)),byGuid=new Map<string,SourceRow>();
 const ambiguous=new Set<string>(),invalidNodes=new Set<string>();
 for(const [family,records]of nodes){plan.counts[family]=records.length;for(const r of records){
  if(typeof r.raw.Guid!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(r.raw.Guid)){invalidNodes.add(r.key);continue;}
  if(byGuid.has(r.raw.Guid))ambiguous.add(r.raw.Guid);else{byGuid.set(r.raw.Guid,r);plan.nodeKinds.set(r.raw.Guid,family);}
 }}
 for(const guid of ambiguous)plan.nodeKinds.delete(guid);
 const unavailableEdges=new Set((source.graphFailures??[]).filter(f=>f.kind==='edges').map(f=>f.family));
 const id=(r:SourceRow)=>importGuid(r.key+':'+digest(stable(r.raw))),nonblank=(v:any)=>typeof v==='string'&&!!v.trim();
 const attrs=(sources:SourceRow[],rule:string,extra:any={})=>({legacyImport:{version:1,importRun:run.id,snapshot:run.fingerprint,rule,sourceRecords:sources.map(r=>({file:r.file,ordinal:r.ordinal,sourceHash:r.hash,legacyGuid:r.raw.Guid??null,record:r.raw})),...extra}});
 const skip=(r:SourceRow,reason:string,status:ImportStatus='skipped-as-unsupported',disposition:ImportDiagnostic['disposition']='UNRESOLVED')=>plan.diagnostics.push({key:r.key,source:r.file,ordinal:r.ordinal,legacyGuid:r.raw.Guid,status,disposition,reason});
 for(const records of nodes.values())for(const r of records)if(ambiguous.has(r.raw.Guid))skip(r,'Graph GUID has multiple claimants; all claimants and dependent incidences are gated','ambiguous-mapping');else if(invalidNodes.has(r.key))skip(r,'Canonical graph identity is not a valid UUIDv4','invalid-source','QUARANTINE');
 for(const f of source.graphFailures??[])plan.diagnostics.push({key:f.path+':failure:'+f.reason,source:f.path,status:'invalid-source',disposition:'QUARANTINE',reason:f.reason});
 const add=(group:ImportJob[],r:SourceRow,recordType:SemanticCommand['recordType'],command:any,dependencies:string[]=[],additional:SourceRow[]=[],disposition:ImportJob['disposition']='IMPORT',warnings:string[]=[])=>{
  const all=[r,...additional],guid=command.guid??command.id;group.push({key:r.key,command:{recordType,...command},dependencies,rows:all,mappings:all.map(row=>({row,recordType,guid})),warnings,disposition});return group.at(-1)!;
 };
 const typedEdges=new Map<string,SourceRow[]>();
 const endpointSpecs:Record<string,Record<string,string>>={acted_in_claim:{Agent:'agents',Claim:'claims'},agent_has_property:{Agent:'agents',Property:'properties'},agent_is_related_metarelation:{Agent:'agents',MetaRelation:'meta-relations'},claim_at_time:{Claim:'claims',Time:'times'},datapoint_at_place:{DataPoint:'data-points',Agent:'agents'},datapoint_at_time:{DataPoint:'data-points',Time:'times'},datapoint_measured_in:{DataPoint:'data-points',Concept:'concepts'},datapoint_refers_to_agent:{DataPoint:'data-points',Agent:'agents'},metarelation_at_time:{MetaRelation:'meta-relations',Time:'times'},part_of_dataset:{DataPoint:'data-points',DataSet:'data-sets'},property_at_time:{Property:'properties',Time:'times'},subset_of_concept:{Source:'concepts',Target:'concepts'},type_of_agent:{Agent:'agents',Concept:'concepts'},type_of_claim:{Claim:'claims',Concept:'concepts'},type_of_metarelation:{MetaRelation:'meta-relations',MetaRelationType:'meta-relation-types'},type_of_property:{Property:'properties',PropertyType:'property-types'}};
 for(const [family,records]of edges){const spec=endpointSpecs[family];if(!spec){records.forEach(r=>skip(r,'Connection family has no approved mapping'));continue;}const trusted:SourceRow[]=[];
  for(const r of records){const wrong=Object.entries(spec).filter(([field,kind])=>plan.nodeKinds.get(r.raw[field]?.Guid)!==kind);if(wrong.length){skip(r,'Endpoint category mismatch: '+wrong.map(([field,kind])=>`${field} expected ${kind}, observed ${plan.nodeKinds.get(r.raw[field]?.Guid)??'absent'}`).join('; '),'invalid-source','QUARANTINE');}else trusted.push(r);}typedEdges.set(family,trusted);
 }
 const valid=(family:string)=>typedEdges.get(family)??[],forParent=(family:string,field:string,guid:string)=>valid(family).filter(r=>r.raw[field].Guid===guid);
 for(const r of node('agents')){if(r.raw.IsDeleted||!nonblank(r.raw.Name)){skip(r,'Agent has no safe authored Name or is tombstoned; Value is not guessed to be a name');continue;}add(plan.base,r,'Entity',{op:'create',id:r.raw.Guid,name:r.raw.Name,typename:r.raw.AgentType??null,attributes:attrs([r],'Agent-to-Entity-v1')});}
 for(const [family,typename,label]of [['concepts','Concept','Name'],['property-types','PropertyType','Name'],['properties','Property','Value']])for(const r of node(family)){
  if(r.raw.IsDeleted||!nonblank(r.raw[label])){skip(r,'No safe display value, or tombstone visibility is unsupported');continue;}
  add(plan.base,r,'Entity',{op:'create',id:r.raw.Guid,name:r.raw[label],typename,attributes:attrs([r],`${typename}-Entity-preservation-v1`,label==='Value'?{displayNameSource:'Value',notAuthoredName:true}:{})},[],[],family.startsWith('propert')?'PRESERVE':'IMPORT');
 }
 for(const r of node('times')){if(!nonblank(r.raw.DisplayName)||r.raw.IsDeleted){skip(r,'Time display identity unavailable');continue;}
  const components:any={};let trustworthy=true;for(const part of ['Year','Month','Day','Minute','Second']){const value=r.raw[part]??null;if(value!==null&&!Number.isSafeInteger(value))trustworthy=false;components['start'+part]=value;}
  if(!trustworthy){skip(r,'Raw Time component is not an integer; no coercion/normalization','invalid-source');continue;}
  add(plan.base,r,'Time',{op:'create',guid:r.raw.Guid,entity:{name:r.raw.DisplayName,attributes:attrs([r],'Time-Entity-v1')},expression:r.raw.DisplayName,...components,attributes:attrs([r],'Time-raw-components-v1',{unknownCodes:{Season:r.raw.Season,Around:r.raw.Around,Section:r.raw.Section},unexportedHour:true})});
 }
 for(const r of node('data-sets'))if(r.raw.IsDeleted)skip(r,'Tombstone visibility is unsupported');else add(plan.base,r,'DataSet',{op:'create',guid:r.raw.Guid,name:r.raw.Name??null,attributes:attrs([r],'DataSet-v1')});
 const roleKinds:Record<string,string>={'claim-role-event':'Event','claim-role-intention':'Intention','claim-role-opinion':'Opinion'};
 for(const r of node('claims')){
  if(r.raw.IsDeleted){skip(r,'Tombstone visibility is unsupported');continue;}
  if(['acted_in_claim','type_of_claim','claim_at_time'].some(f=>unavailableEdges.has(f))){skip(r,'Claim incidence export is unreadable; complete aggregate cannot be proved','skipped-dependency-failed');continue;}
  const participants=forParent('acted_in_claim','Claim',r.raw.Guid),classifications=forParent('type_of_claim','Claim',r.raw.Guid),times=forParent('claim_at_time','Claim',r.raw.Guid),qualifiers=[...classifications,...times];
  const incidences=participants.map((edge,ordinal)=>({guid:id(edge),entityGuid:edge.raw.Agent.Guid,role:edge.raw.Role??null,ordinal,attributes:attrs([edge],'ClaimParticipant-v1',{ordinalPolicy:'source-export-order-v1'})}));
  const qualified=qualifiers.map((edge,ordinal)=>({guid:id(edge),entityGuid:(edge.raw.Concept??edge.raw.Time).Guid,role:edge.raw.Concept?'type-of':'at-time',ordinal,attributes:attrs([edge],'ClaimQualifier-v1',{ordinalPolicy:'classification-then-time-source-order-v1'})}));
  const job=add(plan.aggregates,r,'Claim',{op:'create',guid:r.raw.Guid,expression:r.raw.Name??null,kind:roleKinds[r.raw.Role]??r.raw.Role??null,attributes:attrs([r],'Claim-expression-and-kind-v1'),participants:incidences,qualifiers:qualified},[...incidences,...qualified].map(i=>i.entityGuid),[...participants,...qualifiers]);
  job.mappings=[{row:r,recordType:'Claim',guid:r.raw.Guid},...participants.map(edge=>({row:edge,recordType:'ClaimParticipant',guid:id(edge)})),...qualifiers.map(edge=>({row:edge,recordType:'ClaimQualifier',guid:id(edge)}))];
  // A rejected connection targeting this aggregate gates it; no incomplete assertion is presented.
  for(const family of ['acted_in_claim','type_of_claim','claim_at_time'])if(rows(family).some(edge=>edge.raw.Claim?.Guid===r.raw.Guid&&!valid(family).includes(edge)))job.dependencies.push('invalid-claim-incidence:'+r.raw.Guid);
 }
 for(const r of node('data-points')){
  if(r.raw.IsDeleted){skip(r,'Tombstone visibility is unsupported');continue;}
  if(['datapoint_at_time','datapoint_at_place','datapoint_measured_in','datapoint_refers_to_agent'].some(f=>unavailableEdges.has(f))){skip(r,'Observation dimension export is unreadable; complete aggregate cannot be proved','skipped-dependency-failed');continue;}
  const families=[['datapoint_at_time','Time','time'],['datapoint_at_place','Agent','place'],['datapoint_measured_in','Concept','unit'],['datapoint_refers_to_agent','Agent','referent']],all=families.flatMap(([family,field,role])=>forParent(family,'DataPoint',r.raw.Guid).map(edge=>({edge,field,role})));
  const dimensions=all.map(({edge,field,role},ordinal)=>({guid:id(edge),entityGuid:edge.raw[field].Guid,role,ordinal,attributes:attrs([edge],'DataPointDimension-v1',{ordinalPolicy:'time-place-unit-referent-source-order-v1'})}));
  const job=add(plan.aggregates,r,'DataPoint',{op:'create',guid:r.raw.Guid,name:r.raw.Name??null,value:r.raw.Value,attributes:attrs([r],'identified-observation-v1'),dimensions},dimensions.map(d=>d.entityGuid),all.map(x=>x.edge));
  job.mappings=[{row:r,recordType:'DataPoint',guid:r.raw.Guid},...all.map(({edge})=>({row:edge,recordType:'DataPointDimension',guid:id(edge)}))];
  for(const [family]of families)if(rows(family).some(edge=>edge.raw.DataPoint?.Guid===r.raw.Guid&&!valid(family).includes(edge)))job.dependencies.push('invalid-dimension:'+r.raw.Guid);
 }
 const definitions=new Map(node('meta-relation-types').map(r=>[r.raw.Guid,r])),codeCounts=new Map<string,number>();for(const r of definitions.values())if(nonblank(r.raw.DominantCode))codeCounts.set(r.raw.DominantCode,(codeCounts.get(r.raw.DominantCode)??0)+1);
 for(const r of node('meta-relations')){
  if(r.raw.IsDeleted){skip(r,'Tombstone visibility is unsupported');continue;}
  if(['agent_is_related_metarelation','type_of_metarelation','metarelation_at_time'].some(f=>unavailableEdges.has(f))){skip(r,'Relation incidence export is unreadable; assertion completeness cannot be proved','skipped-dependency-failed');continue;}
  const participants=forParent('agent_is_related_metarelation','MetaRelation',r.raw.Guid),types=forParent('type_of_metarelation','MetaRelation',r.raw.Guid),times=forParent('metarelation_at_time','MetaRelation',r.raw.Guid),definition=types.length===1?definitions.get(types[0].raw.MetaRelationType.Guid):undefined;
  const dominant=participants.filter(p=>p.raw.Relation?.IsDominant===true),subordinate=participants.filter(p=>p.raw.Relation?.IsDominant===false);
  const collapse=participants.length===2&&dominant.length===1&&subordinate.length===1&&!times.length&&!referencedGuids.has(r.raw.Guid)&&definition&&nonblank(definition.raw.DominantCode)&&codeCounts.get(definition.raw.DominantCode)===1;
  if(collapse){const sources=[r,...participants,...types,definition],predicate=definition.raw.DominantCode==='parent of'?'parent-of':definition.raw.DominantCode;
   add(plan.relationships,r,'Relationship',{op:'relationship-create',id:r.raw.Guid,source:dominant[0].raw.Agent.Guid,target:subordinate[0].raw.Agent.Guid,type:predicate,attributes:attrs(sources,'qualified-reified-assertion-to-relationship-v1',{definition:definition.raw,sourceRole:'dominant',targetRole:'subordinate',predicateRule:predicate==='parent-of'?'approved-parent-of-spelling-v1':'exact-source-DominantCode',referenceProof:'all current documents and all non-incidence source payloads; archive literal GUID references conservatively block collapse'})},participants.map(p=>p.raw.Agent.Guid),[...participants,...types]);
  }else{
   const sources=[r,...types,...(definition?[definition]:[])],label=(nonblank(definition?.raw.Name)?definition!.raw.Name:'Legacy relation assertion')+' ['+r.raw.Guid+']';
   add(plan.base,r,'Entity',{op:'create',id:r.raw.Guid,name:label,typename:'RelationAssertion',attributes:attrs(sources,'RelationAssertion-preservation-v1',{displayNameGenerated:true,definition:definition?.raw??null,sourceConnections:[...participants,...times].map(p=>p.raw)})},[],types,'PRESERVE',['Administrative display label is generated; it is not an authored assertion name']);
   for(const edge of participants){const dominant=edge.raw.Relation?.IsDominant;if(typeof dominant!=='boolean'){skip(edge,'Dominant/subordinate role unavailable','ambiguous-mapping');continue;}add(plan.relationships,edge,'Relationship',{op:'relationship-create',id:id(edge),source:edge.raw.Agent.Guid,target:r.raw.Guid,type:dominant?'dominant-in':'subordinate-in',attributes:attrs([edge],'RelationAssertion-incidence-preservation-v1')},[edge.raw.Agent.Guid,r.raw.Guid],[],'PRESERVE');}
   for(const edge of times)add(plan.relationships,edge,'Relationship',{op:'relationship-create',id:id(edge),source:r.raw.Guid,target:edge.raw.Time.Guid,type:'at-time',attributes:attrs([edge],'RelationAssertion-Time-preservation-v1')},[r.raw.Guid,edge.raw.Time.Guid],[],'PRESERVE');
  }
 }
 for(const [family,sourceField,targetField,type]of [['subset_of_concept','Source','Target','subset-of'],['type_of_agent','Agent','Concept','type-of'],['type_of_property','Property','PropertyType','type-of'],['agent_has_property','Agent','Property','has-property'],['property_at_time','Property','Time','at-time']])for(const r of valid(family))add(plan.relationships,r,'Relationship',{op:'relationship-create',id:id(r),source:r.raw[sourceField].Guid,target:r.raw[targetField].Guid,type,attributes:attrs([r],`${family}-to-Relationship-v1`)},[r.raw[sourceField].Guid,r.raw[targetField].Guid],[],family.includes('property')?'PRESERVE':'IMPORT');
 const pairs=new Map<string,SourceRow[]>();for(const r of valid('part_of_dataset')){const key=r.raw.DataSet.Guid+':'+r.raw.DataPoint.Guid,records=pairs.get(key)??[];records.push(r);pairs.set(key,records);}for(const [pair,records]of pairs){const r=records[0],guid=importGuid('DataSetMembership:'+pair);add(plan.memberships,r,'DataSetMembership',{op:'add',guid,dataSetGuid:r.raw.DataSet.Guid,dataPointGuid:r.raw.DataPoint.Guid,attributes:attrs(records,'part_of_dataset-to-many-to-many-membership-v1')},[r.raw.DataSet.Guid,r.raw.DataPoint.Guid],records.slice(1));}
 for(const r of node('meta-relation-types'))skip(r,'Full definition retained in immutable source dictionary and applicable assertion descriptors; no independent canonical type-object lookup','skipped-as-unsupported','PRESERVE');
 for(const [family,records]of nodes)if(!['agents','concepts','property-types','properties','times','data-sets','claims','data-points','meta-relations','meta-relation-types'].includes(family))records.forEach(r=>skip(r,'Node family has no approved mapping'));
 const covered=new Set([...plan.diagnostics.map(d=>d.key),...[...plan.base,...plan.aggregates,...plan.relationships,...plan.memberships].flatMap(j=>j.mappings.map(m=>m.row.key))]);
 for(const records of edges.values())for(const r of records)if(!covered.has(r.key))skip(r,'Dependent parent assertion is gated; source connection retained','skipped-dependency-failed');
 return plan;
}
