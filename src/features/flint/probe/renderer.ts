import * as T from 'three';
import { createStoneDetail } from '../material/stone-detail';
import { applyFlintLight, configureMaterialRenderer, createFlintAmbient, FLINT_SUN_COLOR } from '../material/scene-light';
import type { Light } from '../material-response';
import type { ProbeKind } from './targets';

/** One closed stone with a displaced incision, not a painted sigil overlay. */
function probeGeometry() {
  const outline = [[0,0],[6,-13],[10,-24],[6,-36],[0,-46],[-6,-35],[-10,-23],[-6,-11]];
  const centre = [0,-24], vertices: number[] = [], uv: number[] = [];
  const segmentDistance = (x:number,y:number,a:number[],b:number[]) => {
    const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
    return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);
  };
  function height(x:number,y:number,front:boolean) {
    let edge = Infinity;
    for(let i=0;i<outline.length;i++) edge=Math.min(edge,segmentDistance(x,y,outline[i],outline[(i+1)%outline.length]));
    const body=Math.min(3.8,edge*.62);
    // Shallow overlapping flake scars break up the broad planes on both faces.
    // Flat triangle normals expose their knapped edges under the shared light.
    let flake=0;
    for(const [cx,cy,radius,depth] of [[-4,-14,4,1.2],[5,-18,5,1.1],[-6,-26,5,1.4],[5,-32,4,1.1],[0,-39,3,.8],[0,-8,3,.8]]) {
      flake=Math.max(flake,depth*Math.max(0,1-((x-cx)**2+(y-cy)**2)/(radius*radius)));
    }
    if(!front) return -body*.7+Math.min(edge*.3,flake*.7);
    const ring=Math.abs(Math.hypot(x,y+24)-3.6);
    const stem=Math.min(segmentDistance(x,y,[0,-15],[0,-20.4]),segmentDistance(x,y,[0,-27.6],[0,-34]));
    const incision=1.4*Math.max(0,1-Math.min(ring,stem)/.8);
    return body + Math.min(edge*.15,.35)*Math.sin(x*.83+y*.36) - Math.min(edge*.4,flake) - incision;
  }
  const point=(p:number[],front:boolean)=>[p[0],p[1],height(p[0],p[1],front)];
  const triangle=(a:number[],b:number[],c:number[])=>{
    for(const p of [a,b,c]) { vertices.push(...p);uv.push(p[0]/768,p[1]/768); }
  };
  for(let k=0;k<outline.length;k++) {
    const a=outline[k],b=outline[(k+1)%outline.length],n=16;
    const sample=(i:number,j:number)=>[centre[0]+(a[0]-centre[0])*i/n+(b[0]-centre[0])*j/n,centre[1]+(a[1]-centre[1])*i/n+(b[1]-centre[1])*j/n];
    for(let i=0;i<n;i++)for(let j=0;j<n-i;j++) {
      const p=sample(i,j),q=sample(i+1,j),r=sample(i,j+1);
      triangle(point(p,true),point(r,true),point(q,true));
      if(i+j<n-1)triangle(point(q,true),point(r,true),point(sample(i+1,j+1),true));
    }
    const back=(i:number,j:number)=>[centre[0]+(a[0]-centre[0])*i/6+(b[0]-centre[0])*j/6,centre[1]+(a[1]-centre[1])*i/6+(b[1]-centre[1])*j/6];
    for(let i=0;i<6;i++)for(let j=0;j<6-i;j++) {
      const p=back(i,j),q=back(i+1,j),r=back(i,j+1);
      triangle(point(p,false),point(q,false),point(r,false));
      if(i+j<5)triangle(point(q,false),point(back(i+1,j+1),false),point(r,false));
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
  return geometry;
}

export function createProbeRenderer(onFailure: () => void) {
  const canvas=document.createElement('canvas');canvas.className='flint-probe-canvas';canvas.setAttribute('aria-hidden','true');canvas.hidden=true;
  const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  configureMaterialRenderer(renderer);renderer.shadowMap.enabled=false;
  const scene=new T.Scene(),camera=new T.OrthographicCamera(0,1,0,-1,.1,1000);camera.position.z=300;
  const sunlight=new T.DirectionalLight(FLINT_SUN_COLOR,3),ambient=createFlintAmbient();scene.add(sunlight,sunlight.target,ambient);
  const detail=createStoneDetail(),micro=detail.get('limestone-fine');
  const material=new T.MeshStandardMaterial({color:0x9c978e,roughness:.94,bumpMap:micro.height,bumpScale:.12,roughnessMap:micro.roughness,flatShading:true});
  const geometry=probeGeometry(),stone=new T.Mesh(geometry,material),body=new T.Group();body.add(stone);scene.add(body);
  const diodeMaterial=new T.MeshStandardMaterial({color:0x343c42,roughness:.38,emissive:0x000000});
  const diodeGeometry=new T.SphereGeometry(1.65,12,8),diode=new T.Mesh(diodeGeometry,diodeMaterial);
  diode.position.set(0,-38,2.8);diode.scale.z=.5;body.add(diode);
  const loss=(event:Event)=>{event.preventDefault();onFailure();};canvas.addEventListener('webglcontextlost',loss);
  document.body.append(canvas);
  let width=0,height=0,disposed=false;
  const blue=new T.Color(0x278cff),amber=new T.Color(0xffab35);
  return {
    canvas, renderer, body, diode, geometry,
    draw(rect:DOMRect,x:number,y:number,angle:number,kind:ProbeKind|'none',intensity:number,light:Light,visible:boolean) {
      if(disposed)return;
      if(width!==rect.width||height!==rect.height) {
        width=rect.width;height=rect.height;renderer.setSize(Math.max(1,width),Math.max(1,height),false);
        camera.right=width;camera.bottom=-height;camera.updateProjectionMatrix();
      }
      canvas.style.left=rect.left+'px';canvas.style.top=rect.top+'px';canvas.style.width=width+'px';canvas.style.height=height+'px';
      body.position.set(x-rect.left,-(y-rect.top),0);body.rotation.set(angle,0,.2);
      // The group origin is the tip and stays at the real pointer through rotation.
      applyFlintLight(sunlight,light,new T.Vector2(body.position.x,body.position.y));
      diodeMaterial.emissive.copy(kind==='flint-eikon'?amber:blue);diodeMaterial.emissiveIntensity=intensity*2.4;
      diodeMaterial.color.set(kind==='none'?0x343c42:kind==='flint-eikon'?0xbb914e:0x557f9e);
      canvas.hidden=!visible;
      if(visible)renderer.render(scene,camera);
    },
    get disposed(){return disposed;},
    dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',loss);geometry.dispose();diodeGeometry.dispose();material.dispose();diodeMaterial.dispose();detail.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();},
  };
}
export type ProbeRenderer = ReturnType<typeof createProbeRenderer>;
