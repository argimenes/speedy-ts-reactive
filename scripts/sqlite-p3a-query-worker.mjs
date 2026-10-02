import {parentPort,workerData} from 'node:worker_threads';
import Database from 'better-sqlite3';
import {entityQuery} from './sqlite-p3a-query-prototype.mjs';
const db=new Database(workerData.file,{readonly:true,fileMustExist:true});
parentPort.on('message',({id,kind,ids})=>{try{const q=entityQuery(kind,ids),t=performance.now(),statement=db.prepare(q.sql),prepared=performance.now(),rows=statement.all(...q.args),read=performance.now(),payload=JSON.stringify(rows),end=performance.now();parentPort.postMessage({id,payload,metrics:{prepareMs:prepared-t,sqlMs:read-prepared,serializationMs:end-read,workerMs:end-t}});}catch(e){parentPort.postMessage({id,error:String(e)});}});
parentPort.postMessage({ready:true});
