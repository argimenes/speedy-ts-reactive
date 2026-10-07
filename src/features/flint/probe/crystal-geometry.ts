import * as T from 'three';

export const PROBE_STANDARD_HEIGHT = 42;
type Point = [number, number, number];

/** Five quiet front planes and a four-plane reverse. Only the recessed sigil
 * uses curved topology. The lower point is the exact (0, 0, 0) hotspot. */
export function createCrystalGeometry() {
  const face: number[] = [], recess: number[] = [];
  const triangle = (a: Point, b: Point, c: Point, dark = false) => (dark ? recess : face).push(...a, ...b, ...c);
  const quad = (a: Point, b: Point, c: Point, d: Point, dark = false) => { triangle(a,b,c,dark); triangle(a,c,d,dark); };
  const outer: Point[] = [[0,0,0],[7.6,19,0],[0,42,0],[-7,20,0]];
  const inner: Point[] = outer.map(([x,y]) => [x*.65,20+(y-20)*.65,3.5]);
  for (let i=0;i<4;i++) {
    const j=(i+1)%4;
    quad(outer[i],outer[j],inner[j],inner[i]);
    triangle(outer[j],outer[i],[.25,20,-3.4]);
  }

  const shape = new T.Shape(inner.map(([x,y])=>new T.Vector2(x,y)));
  const circle = new T.Path(); circle.absarc(0,20,3.6,0,Math.PI*2,true); shape.holes.push(circle);
  const stems = [[12.1,16.2],[23.8,28.2]];
  for (const [bottom,top] of stems) {
    const hole=new T.Path();hole.moveTo(-.3,bottom);hole.lineTo(-.3,top);hole.lineTo(.3,top);hole.lineTo(.3,bottom);hole.closePath();shape.holes.push(hole);
    // Floor and inward-facing walls belong to the recess, not a decal.
    quad([-.3,bottom,2.7],[.3,bottom,2.7],[.3,top,2.7],[-.3,top,2.7],true);
    quad([-.3,bottom,3.5],[-.3,bottom,2.7],[-.3,top,2.7],[-.3,top,3.5]);
    quad([.3,top,3.5],[.3,top,2.7],[.3,bottom,2.7],[.3,bottom,3.5]);
    quad([.3,bottom,3.5],[.3,bottom,2.7],[-.3,bottom,2.7],[-.3,bottom,3.5]);
    quad([-.3,top,3.5],[-.3,top,2.7],[.3,top,2.7],[.3,top,3.5]);
  }
  const source = new T.ShapeGeometry(shape,24),surface=source.toNonIndexed(),p=surface.getAttribute('position');
  source.dispose();
  for(let i=0;i<p.count;i++)face.push(p.getX(i),p.getY(i),3.5);
  surface.dispose();
  const ringPoint=(radius:number,angle:number,z:number):Point=>[Math.cos(angle)*radius,20+Math.sin(angle)*radius,z];
  for(let i=0;i<48;i++) {
    const a=i/48*Math.PI*2,b=(i+1)/48*Math.PI*2;
    const cap=(angle:number)=>ringPoint(2.65,angle,3.42+Math.cos(angle)*.22);
    quad(ringPoint(3.6,a,3.5),ringPoint(3.6,b,3.5),ringPoint(3.45,b,2.65),ringPoint(3.45,a,2.65));
    quad(ringPoint(3.45,a,2.65),ringPoint(3.45,b,2.65),ringPoint(2.65,b,2.65),ringPoint(2.65,a,2.65),true);
    quad(ringPoint(2.65,a,2.65),ringPoint(2.65,b,2.65),cap(b),cap(a));
    triangle([0,20,3.42],cap(a),cap(b));
  }
  const vertices=[...face,...recess],uv:number[]=[];
  for(let i=0;i<vertices.length;i+=3)uv.push((vertices[i]+8)/16,vertices[i+1]/42);
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geometry.addGroup(0,face.length/3,0);geometry.addGroup(face.length/3,recess.length/3,1);
  geometry.computeVertexNormals();
  return geometry;
}
