import type {ApplicationServices} from '../application-services/contracts';
import type {ImageInfo} from './model';
import type {ResourceAnchor} from './resource-anchor';
export interface IIIFViewer {destroy():void;home():void;zoom(factor:number):void;region():ResourceAnchor['region'];overlay(id:string,anchor:ResourceAnchor,label:string):()=>void}
/** OpenSeadragon owns viewport layout. This adapter never reads editor cells. */
export async function mountIIIFViewer(host:HTMLElement,api:ApplicationServices,grant:string,info:ImageInfo,canvas:{width:number;height:number},signal:AbortSignal,notice:(message:string)=>void):Promise<IIIFViewer>{
 // OSD is loaded only for an explicitly activated viewer.
 const module=await import('openseadragon'),OSD=module.default;signal.throwIfAborted();
 const maxLevel=Math.ceil(Math.log2(Math.max(info.width,info.height))),minLevel=maxLevel-Math.log2(Math.max(...info.scales));
 const source=new OSD.TileSource({width:info.width,height:info.height,tileWidth:info.tileWidth,tileHeight:info.tileHeight,tileOverlap:0,minLevel,maxLevel});
 source.tileExists=(level:number,x:number,y:number)=>info.scales.includes(2**(maxLevel-level))&&x>=0&&y>=0&&x<Math.ceil(info.width/(info.tileWidth*2**(maxLevel-level)))&&y<Math.ceil(info.height/(info.tileHeight*2**(maxLevel-level)));
 source.getTileUrl=(level:number,x:number,y:number)=>`${2**(maxLevel-level)}/${x}/${y}`;
 const controllers=new Set<AbortController>();let disposed=false;
 source.downloadTileStart=(context:any)=>{const c=new AbortController();controllers.add(c);context.userData.controller=c;const [scale,x,y]=context.src.split('/').map(Number);
  void api.call('iiif.tile',{grant,scale,x,y},c.signal).then(result=>{if(!disposed&&!c.signal.aborted)context.finish(new Blob([result.bytes.slice().buffer]),null,'rasterBlob');},error=>{if(!disposed&&!c.signal.aborted){notice(String(error));context.fail(String(error));}}).finally(()=>controllers.delete(c));};
 source.downloadTileAbort=(context:any)=>context.userData.controller?.abort();
 const viewer=OSD({element:host,drawer:'canvas',tileSources:source as any,showNavigationControl:false,showNavigator:false,imageLoaderLimit:4,maxImageCacheCount:64,maxTilesPerFrame:2,preload:false,animationTime:0.15,blendTime:0.1,timeout:60000,loadTilesWithAjax:true,gestureSettingsMouse:{clickToZoom:false},maxZoomPixelRatio:2});
 const removals=new Set<()=>void>();
 const dispose=()=>{if(disposed)return;disposed=true;for(const c of controllers)c.abort();controllers.clear();for(const remove of [...removals])remove();viewer.destroy();signal.removeEventListener('abort',dispose);};signal.addEventListener('abort',dispose,{once:true});
 return {destroy:dispose,home:()=>viewer.viewport.goHome(),zoom:factor=>viewer.viewport.zoomBy(factor),
  region(){const item=viewer.world.getItemAt(0);if(!item)throw Error('Wait for the image to open');const r=item.viewportToImageRectangle(viewer.viewport.getBounds(true));const x=Math.max(0,r.x/info.width*canvas.width),y=Math.max(0,r.y/info.height*canvas.height),right=Math.min(canvas.width,(r.x+r.width)/info.width*canvas.width),bottom=Math.min(canvas.height,(r.y+r.height)/info.height*canvas.height);if(right<=x||bottom<=y)throw Error('The viewport is outside the canvas');return {x,y,width:right-x,height:bottom-y};},
  overlay(id,anchor,label){const element=document.createElement('div');element.dataset.annotationId=id;element.title=label;element.style.cssText='border:2px solid #a448e5;background:#a448e51a;pointer-events:none;box-sizing:border-box;';element.setAttribute('aria-hidden','true');let removed=false;
   const draw=()=>{if(removed||disposed)return;const item=viewer.world.getItemAt(0);if(!item)return;const r=anchor.region;viewer.addOverlay({element,location:item.imageToViewportRectangle(r.x/canvas.width*info.width,r.y/canvas.height*info.height,r.width/canvas.width*info.width,r.height/canvas.height*info.height),checkResize:false});};
   viewer.addHandler('open',draw);draw();const remove=()=>{if(removed)return;removed=true;viewer.removeHandler('open',draw);viewer.removeOverlay(element);element.remove();removals.delete(remove);};removals.add(remove);return remove;
  }};
}
