import type {Capture,Projection,ImageInfo} from '../iiif/model';
import type {JobStorage,Executor} from './capabilities';
import type {JobSummary} from './contracts';
export interface IIIFOperations {
 'iiif.import':{input:{id:string;source:string};output:{snapshot:Capture;projection:Projection}};
 'iiif.resume':{input:{id:string};output:{snapshot:Capture;projection:Projection}};
 'iiif.inspect':{input:{id:string};output:{job:JobSummary}};
 'iiif.read':{input:{snapshotId:string};output:{snapshot:Capture;projection:Projection}};
 'iiif.open':{input:{snapshotId:string;canvasId:string;online:boolean;origins:string[]};output:{grant:string;info:ImageInfo;retained:number;cached:number}};
 'iiif.tile':{input:{grant:string;scale:number;x:number;y:number};output:{bytes:Uint8Array;availability:'retained'|'cached'|'remote'}};
 'iiif.retain':{input:{grant:string};output:{retained:number}};
 'iiif.close':{input:{grant:string};output:{closed:boolean}};
}
export const iiifOperations=['iiif.import','iiif.resume','iiif.inspect','iiif.read','iiif.open','iiif.tile','iiif.retain','iiif.close'] as const;
export interface IIIFCapabilities {
 cavernId:string;jobs:JobStorage;executor:Executor;uuid():string;now():string;
 knowledge(request:any,signal?:AbortSignal):Promise<any>;
 acquire(url:string,format:'json'|'tile',signal:AbortSignal):Promise<{bytes:Uint8Array;endpoint:string;width?:number;height?:number}>;
 retain(bytes:Uint8Array,format:'json'|'tile',signal:AbortSignal):Promise<Capture['asset']>;
 original(asset:Capture['asset'],signal:AbortSignal):Promise<Uint8Array>;
}
