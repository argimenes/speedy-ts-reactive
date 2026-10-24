import { clone } from '../block-tree/clone';
import { decodeBlockTree } from '../block-tree/codecs';
import { prepareNewBlockIdentities } from '../block-tree/identity';
import type { RepositoryState } from '../block-tree/types';
import { resourceTypes, resourceInformation } from './resource-surface';
/** Explicitly approved image/card compatibility conversion at load, never a file
 * write. Existing face/content GUIDs and all faces are retained. Manual Save
 * persists the added container; the marker prevents repeated wrapping. */
export function upgradeLegacySurfaces(input:RepositoryState):RepositoryState {
 const surfaces=Object.values(input.contents).filter(c=>c.viewType==='surface-block'&&!(c.payload.metadata as any)?.reversible);
 if(!surfaces.length)return input;
 const state=clone(input);
 for(const original of surfaces){const surface=state.contents[original.key];
  surface.payload.metadata={...surface.payload.metadata as object,reversible:true};
  const front=state.contents[state.placements[surface.children[0]]?.contentKey];
  const resource=front?.children.map(k=>state.contents[state.placements[k].contentKey]).find(c=>resourceTypes.has(c.viewType));
  surface.children.forEach((pk,index)=>{const side=state.contents[state.placements[pk].contentKey];
   side.payload.metadata={...side.payload.metadata as object,surfaceRole:index===0?'front':'back'};
   if(index===0)return;
   const container=decodeBlockTree({type:'container-block',metadata:{structuralContainer:true},children:resource?[resourceInformation(resource.payload)]:[]});
   prepareNewBlockIdentities(Object.values(container.state.contents));
   container.state.contents[container.state.placements[container.state.rootPlacementKey].contentKey].children.push(...side.children);
   Object.assign(state.contents,container.state.contents);Object.assign(state.placements,container.state.placements);side.children=[container.state.rootPlacementKey];
  });
 }
 return state;
}
