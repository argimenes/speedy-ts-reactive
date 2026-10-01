/** Repeated input control, deliberately independent of boundary-read timings. */
import {promises as fs} from 'node:fs';import {CanonicalRepository} from '../../block-tree/repository';import {liveState} from './live-fixture';import {TreeCommands} from '../../block-tree/commands';
const count=Number(process.argv[2]),qualified=process.argv[3]==='qualified',mode=qualified?'qualified':'baseline',round=process.env.BOUNDARY_ROUND??'1';
const {state}=liveState(count),repository=new CanonicalRepository(state,{qualifyResourceBoundary:qualified}),commands=new TreeCommands(repository,k=>k),p=Object.values(repository.readState().contents).find(c=>c.payload.id==='resource-0-p0')!,pk=Object.values(repository.readState().placements).find(p1=>p1.contentKey===p.key)!.key;
const rows:any[]=[];
for(let i=0;i<100;i++)commands.replaceInlineRange(pk,0,1,i%2?'a':'b');
for(let i=0;i<100;i++){const start=performance.now();commands.replaceInlineRange(pk,0,1,i%2?'a':'b');rows.push({phase:'typing',elapsedMs:performance.now()-start});}
for(let i=0;i<30;i++){commands.splitStandoff(pk,2);repository.undo();}
for(let i=0;i<50;i++){let start=performance.now();commands.splitStandoff(pk,2);rows.push({phase:'split',elapsedMs:performance.now()-start});start=performance.now();repository.undo();rows.push({phase:'join',elapsedMs:performance.now()-start});}
for(let i=0;i<50;i++){const start=performance.now();commands.insertEmptyStandoffSibling(pk,'after');rows.push({phase:'empty',elapsedMs:performance.now()-start});repository.undo();}
if(qualified&&repository.readCanonicalResourceBoundary('resource-0').status!=='ready')throw Error('Input lost ready evidence');
await fs.writeFile(`artifacts/resource-boundary/input-${mode}-${count}-${round}.json`,JSON.stringify({mode,count,round,rows},null,2)+'\n');console.log(`${mode} ${count} input round ${round} complete`);
