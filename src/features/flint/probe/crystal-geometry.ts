import * as T from 'three';
export { PROBE_STANDARD_HEIGHT } from './size';

/** Compact cursor: a rounded upper-left tip, broad shoulder and concave right heel.
 * Coordinates are authored around the interaction tip, rather than the centroid. */
export const PROBE_SENSOR = new T.Vector3(16, -21, 5.8);
export function createCrystalGeometry() {
  const outline = new T.Shape();
  outline.moveTo(0, 0);
  outline.bezierCurveTo(1, .3, 2, -.5, 3, -1.2);
  outline.lineTo(33, -21);
  outline.bezierCurveTo(36, -23, 36, -25, 32, -26.3);
  outline.bezierCurveTo(24, -28, 23, -29.8, 21, -37);
  outline.bezierCurveTo(19.8, -42, 16.3, -43, 13.7, -39);
  outline.bezierCurveTo(8, -30, 2.5, -13, -.6, -2.8);
  outline.bezierCurveTo(-1, -1.2, -.8, -.3, 0, 0);
  const geometry = new T.ExtrudeGeometry(outline, {
    depth: 2.8, steps: 1, curveSegments: 5,
    bevelEnabled: true, bevelThickness: 1.1, bevelSize: 1.15, bevelSegments: 3,
  });
  // Extrusion caps and rounded perimeter share the obsidian material.
  geometry.clearGroups();
  geometry.addGroup(0, geometry.getAttribute('position').count, 0);
  // Move the actual rounded upper tip onto the pointer, including the bevel.
  const positions=geometry.getAttribute('position');
  let tip=0;
  for(let i=1;i<positions.count;i++)if(positions.getY(i)>positions.getY(tip))tip=i;
  const dx=positions.getX(tip),dy=positions.getY(tip),dz=positions.getZ(tip);
  geometry.translate(-dx,-dy,-dz);
  geometry.userData.tipOffset=[dx,dy,dz];
  return geometry;
}

/** Eight broad, shallow planes, not a knapped or densely triangulated skin. */
export function createProbeFacets(offset: number[]) {
  const perimeter = [[1,-2],[14,-10],[32,-22],[31,-25],[24,-28],[18,-39],[11,-29],[5,-16]];
  const vertices:number[]=[];
  const colours:number[]=[];
  const shades=[.30,.36,.27,.21,.25,.22,.18,.26];
  perimeter.forEach((a,i)=>{
    const b=perimeter[(i+1)%perimeter.length];
    vertices.push(16-offset[0],-21-offset[1],5.5-offset[2],a[0]-offset[0],a[1]-offset[1],3.92-offset[2],b[0]-offset[0],b[1]-offset[1],3.92-offset[2]);
    const colour=new T.Color().setRGB(shades[i],shades[i]*1.025,shades[i]*1.06);
    for(let j=0;j<3;j++)colours.push(colour.r,colour.g,colour.b);
  });
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colours,3));
  // The outline runs clockwise when viewed from the front.
  const p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i+=3){
    const a=new T.Vector3().fromBufferAttribute(p,i+1),b=new T.Vector3().fromBufferAttribute(p,i+2);
    p.setXYZ(i+1,b.x,b.y,b.z);p.setXYZ(i+2,a.x,a.y,a.z);
  }
  geometry.computeVertexNormals();return geometry;
}
