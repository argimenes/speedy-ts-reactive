import {decodeNative} from '../persistence/native-resource';
import {publicProjection} from './projection';
import type {PublicationProfile} from '../application-services/publication-contracts';
import type {ResearchInspection} from './research';
import {validatePackageData} from '../interchange/package/data';
/** Worker-owned inspection. Only reading-reachable annotations seed extraction. */
export function inspectResearch(native:Uint8Array,profile:PublicationProfile,vault:string,blockId?:string):ResearchInspection {
 const snapshot=decodeNative(native),contexts=Object.values(snapshot.contents).filter(c=>c.viewType==='mutable/package-data-block');
 const scanProfile={...profile,...profile.reader?{reader:{...profile.reader,research:undefined}}:{}};
 const result:ResearchInspection={targets:publicProjection(native,scanProfile,vault,undefined,undefined,undefined,!!blockId).targets,contexts:contexts.map(c=>({blockId:String(c.payload.id)}))};
 if(blockId){const c=contexts.find(c=>c.payload.id===blockId);if(!c)throw Error('Selected frozen context changed; review required');result.data=validatePackageData((c.payload.packageContext as any)?.data);}
 return result;
}
