import type {WindowRect} from '../../application/window-geometry';

const GAP=20, MARGIN=8;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(value,max));
export function overlapsSource(a:WindowRect,b:WindowRect) {
 return a.x<b.x+b.width+GAP&&a.x+a.width>b.x-GAP&&a.y<b.y+b.height+GAP&&a.y+a.height>b.y-GAP;
}
/** Pure, bounded placement: four free rectangles around the selected range.
 * Prefer the wide layout, but never cover the source to meet a size target. */
export function placeScry(area:WindowRect,source:WindowRect,preferred={width:area.width*.75,height:560},manual?:WindowRect):WindowRect|undefined {
 const left=area.x+MARGIN,top=area.y+MARGIN,right=area.x+area.width-MARGIN,bottom=area.y+area.height-MARGIN;
 const width=Math.max(1,right-left),height=Math.max(1,bottom-top);
 const desired={width:Math.min(width,preferred.width),height:Math.min(height,Math.max(500,preferred.height))};
 const fit=(r:WindowRect)=>{const w=Math.min(width,r.width),h=Math.min(height,r.height);return {x:clamp(r.x,left,right-w),y:clamp(r.y,top,bottom-h),width:w,height:h};};
 if(manual){const r=fit({...manual,width:Math.min(width,Math.max(400,manual.width)),height:Math.min(height,Math.max(500,manual.height))});if(!overlapsSource(r,source))return r;}
 const spaces=[
  {x:left,y:clamp(source.y+source.height+GAP,top,bottom),width,height:bottom-clamp(source.y+source.height+GAP,top,bottom),side:'below'},
  {x:left,y:top,width,height:clamp(source.y-GAP,top,bottom)-top,side:'above'},
  {x:clamp(source.x+source.width+GAP,left,right),y:top,width:right-clamp(source.x+source.width+GAP,left,right),height,side:'right'},
  {x:left,y:top,width:clamp(source.x-GAP,left,right)-left,height,side:'left'},
 ].filter(r=>r.width>0&&r.height>0);
 const choices=spaces.map(space=>{
  const w=Math.min(desired.width,space.width),h=Math.min(desired.height,space.height);
  const r={x:space.side==='left'?space.x+space.width-w:clamp(source.x,space.x,space.x+space.width-w),y:space.side==='above'?space.y+space.height-h:space.side==='below'?space.y:clamp(source.y,space.y,space.y+space.height-h),width:w,height:h};
  // A usable control column and the requested minimum height take precedence
  // over a wide but very shallow strip. Ties retain the below/above preference.
  const usable=w>=Math.min(400,width)&&h>=Math.min(500,height);
  // Keep the full-width layout when it already meets the height minimum;
  // a few extra side pixels must not make the panel jump as the phrase grows.
  return {r,score:(usable?(w>=desired.width?2e9:1e9):0)+w*h};
 });
 choices.sort((a,b)=>b.score-a.score);
 // No safe placement when the source fills the viewport. The caller dismisses
 // the transient tool rather than covering the selection.
 return choices[0]?.r;
}
