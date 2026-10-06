import * as T from 'three';
import type { ReliefForm } from '../../relief-vocabulary';

/** Centred XY sculpture, with genuine depth towards +Z. This deliberately
 * models a handful of stone forms rather than importing extruded SVG artwork.
 */
export function createSculpture(form: ReliefForm, material: T.MeshStandardMaterial) {
  const group = new T.Group();
  const mesh = (geometry: T.BufferGeometry, x = 0, y = 0, z = 0) => {
    const m = new T.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; group.add(m); return m;
  };
  const tube = (points: T.Vector3[], radius: number, segments = 72) => mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points), segments, radius, 10, false));
  const sphere = (x: number, y: number, radius: number, depth: number) => { const m = mesh(new T.SphereGeometry(radius, 28, 18), x, y, depth); m.scale.z = depth / radius; return m; };
  if (form === 'mask') {
    mesh(heightSculpture((x,y) => ({ x: x * 34 * (1 + y * .13), y: y * 47 }), maskHeight, 52, 112));
  } else if (form === 'disc') {
    mesh(heightSculpture((x,y) => ({ x: x * 32, y: y * 32 }), (x,y,r) => {
      const angle = Math.atan2(y,x), line = Math.abs(Math.sin(angle * 8));
      const grooves = 1.65 * Math.exp(-Math.pow(line / .105,2)) * Math.min(1, r * 8) * Math.min(1, (1-r)*18);
      return 3 + 4 * Math.sqrt(Math.max(0, 1-r*r)) - grooves;
    }, 34, 144));
  } else if (form === 'leaf') {
    mesh(heightSculpture((x,y) => ({ x: x * 26 * (1 - Math.abs(y) * .35), y: y * 44 }), (x,y,r) => {
      const trunk = Math.exp(-Math.pow(x/.045,2)), branch = Math.exp(-Math.pow((Math.abs(x) * .7 - ((y+1)*2.6 % 1) * .24) / .035,2));
      return 2.4 + 6 * Math.sqrt(Math.max(0,1-r*r)) - (trunk * 1.7 + branch * 1.3) * Math.min(1,(1-r)*10);
    }, 42, 112));
  } else if (form === 'pyramids') {
    for (const [x,y,w,h,d] of [[0,20,47,48,28],[-23,-5,45,49,23],[27,-4,45,52,26]]) {
      // A triangular pyramid resting on its rear face: two broad real planes
      // meet at the projecting central ridge in the fixed overhead view.
      const a = new T.Vector3(-w/2,-h/2,0), b = new T.Vector3(0,-h/2,d*.55), c = new T.Vector3(w/2,-h/2,0), peak = new T.Vector3(0,h/2,d);
      const geometry = new T.BufferGeometry().setFromPoints([a,b,peak,b,c,peak,c,a,peak,a,c,b]);
      const positions = geometry.getAttribute('position');
      const uv: number[] = []; for (let i=0;i<positions.count;i++) uv.push(positions.getX(i)/100+.5,positions.getY(i)/100+.5);
      geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2)); geometry.computeVertexNormals(); mesh(geometry,x,y,1.2);
    }
  } else if (form === 'spiral') {
    const points = Array.from({length:121},(_,i) => { const t = i/120, a = t*Math.PI*3.7+.5, r = 5+t*30; return new T.Vector3(Math.cos(a)*r,Math.sin(a)*r,5.5); });
    tube(points,4.7,144);
  } else if (form === 'moon') {
    const R = 42, inner = 39, offset = 18, x = (R*R-inner*inner+offset*offset)/(2*offset), y = Math.sqrt(R*R-x*x);
    const outerAngle = Math.atan2(y,x), innerAngle = Math.atan2(y,x-offset), shape = new T.Shape();
    shape.absarc(0,0,R,outerAngle,Math.PI*2-outerAngle,false);
    shape.absarc(offset,0,inner,Math.PI*2-innerAngle,innerAngle,true); shape.closePath();
    const m = mesh(new T.ExtrudeGeometry(shape,{depth:4,bevelEnabled:true,bevelThickness:2.5,bevelSize:2.2,bevelSegments:4,curveSegments:40}),0,0,2.5); m.rotation.z = .45;
  } else if (form === 'diamond') {
    const outer = [[0,45],[38,0],[0,-45],[-38,0]], inner = [[0,21],[20,0],[0,-21],[-20,0]], points: T.Vector3[] = [];
    for (let i=0;i<4;i++) { const j=(i+1)%4,a=new T.Vector3(...outer[i] as [number,number],1),b=new T.Vector3(...outer[j] as [number,number],1),c=new T.Vector3(...inner[j] as [number,number],13),d=new T.Vector3(...inner[i] as [number,number],13); points.push(a,b,d,b,c,d); }
    const geometry = new T.BufferGeometry().setFromPoints(points), uv:number[]=[];
    for (const p of points) uv.push(p.x/100+.5,p.y/100+.5); geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2)); geometry.computeVertexNormals(); mesh(geometry);
    const shape=new T.Shape(); inner.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
    mesh(new T.ExtrudeGeometry(shape,{depth:1,bevelEnabled:true,bevelSize:.8,bevelThickness:.6,bevelSegments:2}),0,0,12.5);
  } else if (form === 'waves') {
    for (const y of [-14,12]) tube(Array.from({length:45},(_,i)=>{const x=-42+i*84/44;return new T.Vector3(x,y+Math.sin(x/5)*3.8,4.2)}),3.4);
  } else if (form === 'star') {
    for (let i=0;i<4;i++) { const a=i*Math.PI/4,x=Math.cos(a)*37,y=Math.sin(a)*37; tube([new T.Vector3(-x,-y,4),new T.Vector3(x,y,4)],3.2,8); sphere(x,y,3.2,4); sphere(-x,-y,3.2,4); }
  } else if (form === 'beads') {
    for (const [x,y] of [[0,22],[-19,1],[20,1],[0,-20]]) sphere(x,y,8.5,7.2);
  } else { sphere(0,0,28,12); }
  // ExtrudeGeometry's default UVs use world-unit coordinates. Normalise these
  // stone faces so the marble is sampled at the same physical scale as the head.
  group.traverse(o=>{if(o instanceof T.Mesh&&o.geometry.type==='ExtrudeGeometry'){
    const p=o.geometry.getAttribute('position'),uv:number[]=[];
    for(let i=0;i<p.count;i++)uv.push(p.getX(i)/100+.5,p.getY(i)/100+.5);
    o.geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  }});
  group.scale.z = .65;
  return group;
}
const gauss = (x:number,y:number,cx:number,cy:number,sx:number,sy:number) => Math.exp(-Math.pow((x-cx)/sx,2)-Math.pow((y-cy)/sy,2));
function maskHeight(x:number,y:number,r:number) {
  const dome = 12*Math.sqrt(Math.max(0,1-r*r));
  const cheeks = 1.5*(gauss(x,y,-.43,-.04,.27,.32)+gauss(x,y,.43,-.04,.27,.32));
  const brow = 1.6*gauss(x,y,0,.36,.7,.1);
  const eyes = 4.2*(gauss(x,y,-.37,.26,.15,.035)+gauss(x,y,.37,.26,.15,.035));
  const noseWidth = .105 + .05*gauss(x,y,0,-.17,.4,.1);
  const nose = 15*Math.max(0,1-Math.abs(x)/noseWidth)*Math.exp(-Math.pow((y-.07)/.37,6));
  const nostril = 1.9*(gauss(x,y,-.1,-.24,.04,.04)+gauss(x,y,.1,-.24,.04,.04));
  const mouth = 2.8*gauss(x,y,0,-.51,.17,.024), chin = 1.1*gauss(x,y,0,-.72,.31,.13);
  return 3 + dome + cheeks + brow + nose - eyes - mouth - nostril + chin;
}
/** Polar front topology plus a closed bevel/back skirt. Normals are calculated
 * from the displaced geometry: grooves/eyes/nose all change raking-light response.
 */
function heightSculpture(outline:(x:number,y:number)=>{x:number;y:number},height:(x:number,y:number,r:number)=>number,rings:number,segments:number) {
  const p:number[]=[],uv:number[]=[],indices:number[]=[];
  const push = (x:number,y:number,z:number) => { const v=outline(x,y); p.push(v.x,v.y,z);uv.push(v.x/100+.5,v.y/100+.5); };
  push(0,0,height(0,0,0));
  for(let ring=1;ring<=rings;ring++) for(let j=0;j<segments;j++) { const r=ring/rings,a=j/segments*Math.PI*2,x=Math.cos(a)*r,y=Math.sin(a)*r;push(x,y,height(x,y,r)); }
  for(let j=0;j<segments;j++) indices.push(0,1+j,1+(j+1)%segments);
  for(let ring=1;ring<rings;ring++) for(let j=0;j<segments;j++) { const a=1+(ring-1)*segments+j,b=1+(ring-1)*segments+(j+1)%segments,c=a+segments,d=b+segments;indices.push(a,c,b,b,c,d); }
  const back=p.length/3;
  for(let j=0;j<segments;j++) { const a=j/segments*Math.PI*2;push(Math.cos(a)*.985,Math.sin(a)*.985,0); }
  for(let j=0;j<segments;j++) { const a=1+(rings-1)*segments+j,b=1+(rings-1)*segments+(j+1)%segments,c=back+j,d=back+(j+1)%segments;indices.push(a,c,b,b,c,d); }
  const centre=p.length/3;push(0,0,0);for(let j=0;j<segments;j++) indices.push(centre,back+(j+1)%segments,back+j);
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
