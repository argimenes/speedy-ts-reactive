import * as T from 'three';
import { applyFlintLight, configureMaterialRenderer, createFlintAmbient, FLINT_SUN_COLOR } from '../flint/material/scene-light';
import type { Light } from '../flint/material-response';
import type { ProbeKind } from './targets';
import { createCrystalGeometry, createProbeFacets, PROBE_SENSOR, PROBE_STANDARD_HEIGHT } from './crystal-geometry';
import { createCrystalEnvironment, createCrystalMaps, createDiodeHalo } from './crystal-optics';
import { clampProbeSize, PROBE_DEFAULT_HEIGHT } from './size';

export function createProbeRenderer(onFailure: () => void, size = PROBE_DEFAULT_HEIGHT) {
  size=clampProbeSize(size);
  const canvas=document.createElement('canvas');canvas.className='probe-canvas';canvas.setAttribute('aria-hidden','true');canvas.hidden=true;
  const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  configureMaterialRenderer(renderer);renderer.shadowMap.enabled=false;
  // Transmission samples only this small optical scene, never DOM text or Graph.
  renderer.transmissionResolutionScale=.5;
  const scene=new T.Scene(),camera=new T.OrthographicCamera(0,1,0,-1,.1,1000);camera.position.z=300;
  const sunlight=new T.DirectionalLight(FLINT_SUN_COLOR,3),ambient=createFlintAmbient();scene.add(sunlight,sunlight.target,ambient);
  const environment=createCrystalEnvironment(renderer);scene.environment=environment.texture;
  const maps=createCrystalMaps();
  const material=new T.MeshPhysicalMaterial({color:0x292c30,roughness:.29,roughnessMap:maps.roughness,
    metalness:.08,transmission:.12,thickness:3.2,thicknessMap:maps.thickness,ior:1.48,
    attenuationColor:0x4b5058,attenuationDistance:3.5,envMapIntensity:1.05,clearcoat:.35,clearcoatRoughness:.22});
  const incisionMaterial=new T.MeshStandardMaterial({color:0x0c0e10,roughness:.72,envMapIntensity:.25});
  const geometry=createCrystalGeometry(),stone=new T.Mesh(geometry,[material,incisionMaterial]),body=new T.Group();
  body.scale.setScalar(size/PROBE_STANDARD_HEIGHT);body.add(stone);scene.add(body);
  const offset=geometry.userData.tipOffset as number[];
  const facetGeometry=createProbeFacets(offset),facetMaterial=material.clone();
  facetMaterial.vertexColors=true;facetMaterial.color.set(0x85888d);facetMaterial.flatShading=true;
  facetMaterial.transmission=0;facetMaterial.roughnessMap=null;
  body.add(new T.Mesh(facetGeometry,facetMaterial));
  const sensor=PROBE_SENSOR.clone().sub(new T.Vector3(offset[0],offset[1],offset[2]));
  const engravings=new T.Group();
  for(const [x,y,length,angle] of [[12,-14,8,.58],[16,-28,5,0]]){
    const line=new T.Mesh(new T.BoxGeometry(.38,length,.16),incisionMaterial);
    line.position.set(x-offset[0],y-offset[1],4.85-offset[2]);line.rotation.z=angle;engravings.add(line);
  }
  body.add(engravings);

  const diodeMaterial=new T.MeshStandardMaterial({color:0x424247,roughness:.25,emissive:0x000000,envMapIntensity:.25});
  const diodeGeometry=new T.TorusGeometry(3.6,.17,8,48),diode=new T.Mesh(diodeGeometry,diodeMaterial);
  diode.position.copy(sensor);body.add(diode);
  const socketGeometry=new T.TorusGeometry(4.05,.35,8,48),socketMaterial=new T.MeshStandardMaterial({color:0x55514b,metalness:.35,roughness:.48});
  const socket=new T.Mesh(socketGeometry,socketMaterial);socket.position.copy(sensor).add(new T.Vector3(0,0,-.15));body.add(socket);
  const lensGeometry=new T.CircleGeometry(3.4,32),lensMaterial=new T.MeshPhysicalMaterial({color:0x14171b,roughness:.3,metalness:.05,clearcoat:.35});
  const lens=new T.Mesh(lensGeometry,lensMaterial);lens.position.copy(sensor).add(new T.Vector3(0,0,-.12));body.add(lens);
  const haloMaterial=createDiodeHalo(),haloGeometry=new T.PlaneGeometry(12,12),halo=new T.Mesh(haloGeometry,haloMaterial);
  halo.position.copy(sensor).add(new T.Vector3(0,0,.25));body.add(halo);
  // A real short-range source illuminates adjacent facets and the socket.
  const diodeLight=new T.PointLight(0xffffff,0,13,2);diodeLight.position.copy(sensor).add(new T.Vector3(0,0,2));body.add(diodeLight);
  const loss=(event:Event)=>{event.preventDefault();onFailure();};canvas.addEventListener('webglcontextlost',loss);
  document.body.append(canvas);
  // Let the body extend behind its hotspot at the host boundary. The managed
  // pointer region stays with the controller; only the transparent viewport grows.
  let padding=size+6;
  let width=0,height=0,disposed=false;
  const blue=new T.Color(0x168bff),amber=new T.Color(0xffab32);
  const blueCore=new T.Color(0x9edaff),amberCore=new T.Color(0xffdf96);
  const metrics={frames:0,lastRenderMs:0};
  return {
    canvas,renderer,body,diode,diodeLight,geometry,metrics,
    setSize(value:number) {
      const next=clampProbeSize(value);if(disposed||next===size)return;
      size=next;body.scale.setScalar(size/PROBE_STANDARD_HEIGHT);
      padding=size+6;width=0;height=0;
    },
    draw(rect:DOMRect,x:number,y:number,angle:number,kind:ProbeKind|'none',intensity:number,light:Light,visible:boolean) {
      if(disposed)return;
      if(width!==rect.width||height!==rect.height) {
        width=rect.width;height=rect.height;renderer.setSize(Math.max(1,width+padding*2),Math.max(1,height+padding*2),false);
        camera.left=-padding;camera.top=padding;camera.right=width+padding;camera.bottom=-height-padding;camera.updateProjectionMatrix();
      }
      canvas.style.left=rect.left-padding+'px';canvas.style.top=rect.top-padding+'px';canvas.style.width=width+padding*2+'px';canvas.style.height=height+padding*2+'px';
      body.position.set(x-rect.left,-(y-rect.top),0);
      // The outline itself supplies the upper-left lean; never steer it with movement.
      body.rotation.set(0,angle,0,'ZYX');
      // Size, proximity and rotation never translate the model's tip origin.
      applyFlintLight(sunlight,light,new T.Vector2(body.position.x,body.position.y));
      const colour=kind==='graph-node'?blue:amber,core=kind==='graph-node'?blueCore:amberCore;
      diodeMaterial.emissive.copy(core);diodeMaterial.emissiveIntensity=.85+intensity*2.2;
      const scale=size/PROBE_STANDARD_HEIGHT;
      diodeLight.color.copy(colour);diodeLight.distance=13*scale;diodeLight.intensity=intensity*220*scale*scale;
      haloMaterial.uniforms.colour.value.copy(colour);haloMaterial.uniforms.strength.value=intensity;
      halo.visible=intensity>0;
      canvas.hidden=!visible;
      if(visible){const start=performance.now();renderer.render(scene,camera);metrics.lastRenderMs=performance.now()-start;metrics.frames++;}
    },
    get disposed(){return disposed;},
    dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',loss);
      geometry.dispose();facetGeometry.dispose();facetMaterial.dispose();engravings.children.forEach(child=>(child as T.Mesh).geometry.dispose());diodeGeometry.dispose();socketGeometry.dispose();lensGeometry.dispose();haloGeometry.dispose();
      material.dispose();incisionMaterial.dispose();diodeMaterial.dispose();socketMaterial.dispose();lensMaterial.dispose();haloMaterial.dispose();
      maps.thickness.dispose();maps.roughness.dispose();environment.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();},
  };
}
export type ProbeRenderer = ReturnType<typeof createProbeRenderer>;
