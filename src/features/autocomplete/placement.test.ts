import {expect,it} from 'vitest';
import {placeScry,overlapsSource} from './placement';
const area={x:0,y:0,width:1600,height:1100};
it('uses 75% width below a high selection with a 20px gap',()=>{
 const source={x:200,y:180,width:300,height:22},r=placeScry(area,source)!;
 expect(r).toEqual({x:200,y:222,width:1200,height:560});
});
it('flips above a low selection, aligning its bottom 20px above the text',()=>{
 const source={x:200,y:850,width:300,height:22},r=placeScry(area,source)!;
 expect(r).toEqual({x:200,y:270,width:1200,height:560});
});
it('uses side space to retain the minimum height when vertical space is insufficient',()=>{
 const source={x:100,y:320,width:180,height:24},r=placeScry({...area,height:700},source)!;
 expect(r.x).toBe(300);expect(r.height).toBeGreaterThanOrEqual(500);expect(overlapsSource(r,source)).toBe(false);
});
it('protects a wrapped range and chooses a smaller panel only when no full-height usable space exists',()=>{
 const source={x:80,y:300,width:1100,height:80},r=placeScry({x:0,y:0,width:1250,height:750},source)!;
 expect(r.height).toBe(342);expect(r.y).toBe(400);expect(overlapsSource(r,source)).toBe(false);
});
it('preserves a safe manual position and relocates one which covers the source',()=>{
 const source={x:200,y:180,width:300,height:22},manual={x:100,y:300,width:900,height:520};
 expect(placeScry(area,source,undefined,manual)).toEqual(manual);
 expect(overlapsSource(placeScry(area,source,undefined,{...manual,y:100})!,source)).toBe(false);
});
it('clamps horizontal alignment and zoomed viewport offsets',()=>{
 const viewport={x:120,y:80,width:850,height:700},source={x:850,y:640,width:50,height:24},r=placeScry(viewport,source)!;
 expect(r.x).toBeGreaterThanOrEqual(128);expect(r.x+r.width).toBeLessThanOrEqual(962);
 expect(r.y).toBeGreaterThanOrEqual(88);expect(r.y+r.height).toBeLessThanOrEqual(772);expect(overlapsSource(r,source)).toBe(false);
});
it('never covers ordinary source ranges across viewport sizes and positions',()=>{
 for(const width of [600,850,1500])for(const height of [500,700,990])for(const y of [30,height/2,height-50]){
  const source={x:width*.2,y,width:width*.6,height:25},r=placeScry({x:0,y:0,width,height},source)!;
  expect(r.width).toBeGreaterThan(0);expect(r.height).toBeGreaterThan(0);expect(overlapsSource(r,source)).toBe(false);
  expect(r.x).toBeGreaterThanOrEqual(8);expect(r.y).toBeGreaterThanOrEqual(8);
  expect(r.x+r.width).toBeLessThanOrEqual(width-8);expect(r.y+r.height).toBeLessThanOrEqual(height-8);
 }
});

it('does not jump beside a short phrase when the wide lower region already fits 500px',()=>{
 const viewport={x:0,y:0,width:1500,height:990};
 const a=placeScry(viewport,{x:337,y:410,width:20,height:20})!;
 const b=placeScry(viewport,{x:337,y:410,width:160,height:20})!;
 expect(a).toEqual(b);expect(a.y).toBe(450);expect(a.width).toBe(1125);
});

it('declines placement rather than obscuring a selection filling the viewport',()=>{
 expect(placeScry(area,area)).toBeUndefined();
});
