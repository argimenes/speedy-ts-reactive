import * as T from 'three';
import { createSculpture } from './three/sculpture';
import { fixtureNodes, type FixtureNode } from './material-fixture';
import type { createMaterialGraph, DetailLevel } from './material-graph';
import { materialForForm, type ReliefForm } from '../relief-vocabulary';
import { type MaterialResponse, type Position, type StoneFinish } from '../material-response';
import { applyFlintLight, configureMaterialRenderer, createFlintAmbient, FLINT_SUN_COLOR } from '../material/scene-light';
import { createOcclusionRig, CYCLADIC_APERTURE, type LightEnvironment } from '../material/light-environment';
import { createStoneDetail, STONE_FINISHES, STONE_TILE, type StoneFamily } from '../material/stone-detail';
import { createMaterialRegistry } from '../material/material-registry';
import { DEFAULT_TEXTURE_LAYERS, type TextureLayers } from '../material-textures';
import limestoneURL from '../assets/limestone-fine-albedo.png';
import marbleURL from '../assets/marble-albedo.png';

export type MaterialGraphAdapter = Pick<ReturnType<typeof createMaterialGraph>, 'setFixture'|'select'|'fit'|'setTextureLayers'|'nodes'|'selectedId'|'disposed'|'setDetail'|'setFinish'|'zoomBy'|'pan'|'move'|'dispose'>;
export type GraphFactory = (options: Parameters<typeof createMaterialGraph>[0]) => MaterialGraphAdapter;
type NodeView = { spec: FixtureNode; group: T.Group; label: HTMLSpanElement; wave: T.Mesh; stop: () => void };
/** Graph-only orthographic adapter. One existing Flint scheduler owns all
 * rendering; static scenes have no animation loop. No X6 instance is created.
 */
export const createThreeMaterialGraph = (options: Parameters<GraphFactory>[0], environmentRoot?: HTMLElement) => {
  const { container, lighting, interactions } = options;
  const canvas = document.createElement('canvas'); canvas.className = 'flint-three-canvas'; canvas.setAttribute('aria-hidden','true');
  const labels = document.createElement('div'); labels.className = 'flint-three-labels'; container.append(canvas,labels); container.dataset.renderer='three';
  const renderer = new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  configureMaterialRenderer(renderer);
  const scene=new T.Scene(), world=new T.Group(), edges=new T.Group();scene.add(world,edges);
  const camera=new T.OrthographicCamera(-1,1,1,-1,.1,4000);camera.position.set(450,-380,1600);
  const sunlight=new T.DirectionalLight(FLINT_SUN_COLOR,3), ambient=createFlintAmbient(); scene.add(sunlight,sunlight.target,ambient);
  sunlight.castShadow=true; sunlight.shadow.mapSize.set(2048,2048); sunlight.shadow.normalBias=.15;sunlight.shadow.bias=-.00018;
  sunlight.shadow.camera.near=10;sunlight.shadow.camera.far=3600;
  const contact=new T.PointLight(0xfff4d8,0,160,2);scene.add(contact);let contactId:string|undefined;
  const floorMaterial=new T.ShadowMaterial({color:0x4d4538,opacity:.38});
  const floor=new T.Mesh<T.PlaneGeometry, T.Material>(new T.PlaneGeometry(16000,16000),floorMaterial);floor.receiveShadow=true;scene.add(floor);
  let width=1,height=1,zoom=1,centre=new T.Vector2(450,-380),dirty=true,disposed=false,lost=false,selectedId:string|undefined,hoverId:string|undefined;
  let finish:StoneFinish='limestone',detail:DetailLevel='full',layers:TextureLayers=DEFAULT_TEXTURE_LAYERS;
  let nodes:readonly FixtureNode[]=[],views=new Map<string,NodeView>();
  const textures=new Set<T.Texture>(),materials=new Map<string,T.MeshStandardMaterial>(),geometryCache=new Map<string,T.Group>(),ownedGeometries=new Set<T.BufferGeometry>();
  const plain=new T.MeshBasicMaterial({color:0xe5dfd2}),lineMaterial=new T.LineBasicMaterial({color:0x847a68,transparent:true,opacity:.68}),waveMaterial=new T.MeshBasicMaterial({color:0xfff8de,transparent:true,opacity:0,depthWrite:false});
  const metrics={frames:0,lastRenderMs:0,calls:0,triangles:0,geometries:0,textures:0,loadedTextures:0};
  const request=(shadows=true)=>{if(disposed||lost)return;dirty=true;if(shadows)renderer.shadowMap.needsUpdate=true;lighting.request()};
  // The graph keeps its independent XY pan/zoom camera. The architectural rig
  // is transformed from the shell's coordinates into that camera's world, so
  // sculpture and receiving plane see the same environment and FlintLight.
  const environmentRig = environmentRoot ? createOcclusionRig(scene) : undefined;
  const surfaceRegistry = environmentRoot ? createMaterialRegistry(request) : undefined;
  if (surfaceRegistry) { floor.material = surfaceRegistry.get('limestone'); sunlight.shadow.mapSize.set(4096,4096); sunlight.shadow.bias = -.00003; }
  const loader=new T.TextureLoader();
  const maps=[limestoneURL,marbleURL].map(url=>{
    const albedo=loader.load(url,()=>{if(disposed)return;metrics.loadedTextures++;request()},undefined,()=>{if(!disposed){metrics.loadedTextures++;request()}});
    albedo.colorSpace=T.SRGBColorSpace;albedo.wrapS=albedo.wrapT=T.RepeatWrapping;albedo.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);
    textures.add(albedo);return {albedo};
  });
  // Static concavity only, without a baked light direction. The recesses also
  // exist in the head's geometry and can self-shadow under FlintLight.
  const aoCanvas=document.createElement('canvas');aoCanvas.width=aoCanvas.height=256;
  const aoContext=aoCanvas.getContext('2d')!,aoPixels=aoContext.createImageData(256,256);
  const gaussian=(x:number,y:number,cx:number,cy:number,sx:number,sy:number)=>Math.exp(-Math.pow((x-cx)/sx,2)-Math.pow((y-cy)/sy,2));
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const nx=(x/255-.5)*100/39,ny=(.5-y/255)*100/47;
    const depth=.16*(gaussian(nx,ny,-.37,.26,.15,.055)+gaussian(nx,ny,.37,.26,.15,.055))+.2*gaussian(nx,ny,0,-.51,.18,.04)+.2*gaussian(nx,ny,0,-.26,.16,.06);
    const i=(y*256+x)*4,c=Math.round(255*(1-depth));aoPixels.data.set([c,c,c,255],i);
  }
  aoContext.putImageData(aoPixels,0,0);const headAO=new T.CanvasTexture(aoCanvas);headAO.colorSpace=T.NoColorSpace;headAO.channel=1;textures.add(headAO);
  const stoneDetail = createStoneDetail();
  const familyFor = (form: ReliefForm): StoneFamily => finish === 'marble' ? 'marble-pale' : form === 'stone' || form === 'beads' ? 'chalk-stone' : form === 'pyramids' ? 'limestone-coarse' : form === 'disc' ? 'limestone-weathered' : 'limestone-fine';
  const materialProfiles = new Map<T.MeshStandardMaterial, StoneFamily>();
  const albedoAmounts=new Map<T.MeshStandardMaterial,{value:number}>();
  const material=(form:ReliefForm)=>{
    const family=familyFor(form),key=family+'-'+form;
    if(!materials.has(key)) {
      const map=maps[family==='marble-pale'?1:0],profile=STONE_FINISHES[family],micro=stoneDetail.get(family);
      const m=new T.MeshStandardMaterial({color:profile.color,roughness:profile.roughness,metalness:0,map:map.albedo,bumpMap:micro.height,bumpScale:profile.bump,roughnessMap:micro.roughness,aoMap:form==='mask'?headAO:null,aoMapIntensity:1});
      const amount={value:profile.albedo};albedoAmounts.set(m,amount);materialProfiles.set(m,family);
      // Albedo strength remains distinct from physical bump/roughness response.
      // This tiny standard-material adapter avoids overwhelming the carving.
      m.onBeforeCompile=shader=>{shader.uniforms.flintAlbedoAmount=amount;shader.fragmentShader='uniform float flintAlbedoAmount;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',T.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;','diffuseColor *= vec4(mix(vec3(1.0), sampledDiffuseColor.rgb, flintAlbedoAmount), sampledDiffuseColor.a);'));};
      m.customProgramCacheKey=()=> 'flint-stone-albedo-v1';
      materials.set(key,m);
    }
    return materials.get(key)!;
  };
  const configureMaterials=()=>{
    for(const m of materials.values()){const family=materialProfiles.get(m)!,profile=STONE_FINISHES[family],micro=stoneDetail.get(family),map=maps[family==='marble-pale'?1:0],visible=detail==='full'&&!lighting.effects.reducedEffects&&finish!=='untextured';
      const nextMap=visible?map.albedo:null,nextBump=visible?micro.height:null;
      if(m.map!==nextMap||m.bumpMap!==nextBump){m.map=nextMap;m.bumpMap=nextBump;m.needsUpdate=true;}
      m.bumpScale=profile.bump*layers.grain/DEFAULT_TEXTURE_LAYERS.grain;
      const nextRoughness=visible?micro.roughness:null;if(m.roughnessMap!==nextRoughness){m.roughnessMap=nextRoughness;m.needsUpdate=true;}
      albedoAmounts.get(m)!.value=profile.albedo*layers.grain/DEFAULT_TEXTURE_LAYERS.grain;
    }
    renderer.shadowMap.enabled=detail==='full'&&!lighting.effects.reducedEffects;
  };
  const cloneSculpture=(spec:FixtureNode)=>{
    // The sanity fixtures use simpler genuine volumes; the reference retains
    // the carved head and grooves. This is a spike fixture, not production LOD.
    const form=nodes.length>13&&spec.form==='mask'?'stone':spec.form;
    const key=form+'-'+materialForForm(spec.form,finish).name;
    if(!geometryCache.has(key)) {const g=createSculpture(form,material(spec.form));g.traverse(o=>{if(o instanceof T.Mesh){ownedGeometries.add(o.geometry);if(o.geometry.getAttribute('uv'))o.geometry.setAttribute('uv1',o.geometry.getAttribute('uv').clone())}});geometryCache.set(key,g);}
    const g=geometryCache.get(key)!.clone(true);g.scale.x=spec.width/100;g.scale.y=spec.height/100;
    g.position.set(spec.x+spec.width/2,-spec.y-spec.height/2,.12);
    // UV1 retains the sculptor's local incision AO. UV0 uses the same physical
    // stone scale as the substrate, varied deterministically for each piece.
    let seed=2166136261;for(const c of spec.id)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
    const angle=(seed%6283)/1000,co=Math.cos(angle),si=Math.sin(angle);
    g.traverse(o=>{if(o instanceof T.Mesh){const geometry=o.geometry.clone(),p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');if(uv)for(let i=0;i<uv.count;i++){const x=(p.getX(i)+o.position.x)*g.scale.x,y=(p.getY(i)+o.position.y)*g.scale.y;uv.setXY(i,(x*co-y*si)/STONE_TILE+(seed%997)/997,(x*si+y*co)/STONE_TILE+((seed>>>12)%991)/991);}o.geometry=geometry;ownedGeometries.add(geometry);}});
    g.traverse(o=>{o.userData.nodeId=spec.id;if(o instanceof T.Mesh&&detail==='flat')o.material=plain});return g;
  };
  const contextual=new T.Group();scene.add(contextual);
  const outlineMaterial=new T.LineDashedMaterial({color:0x817562,dashSize:4,gapSize:5,transparent:true,opacity:.72});
  for(const [cx,cy,rx,ry] of [[348,191,94,99],[774,342,91,91],[551,619,118,91]]){
    const points=Array.from({length:97},(_,i)=>{const a=i/96*Math.PI*2;return new T.Vector3(cx+Math.cos(a)*rx,-cy-Math.sin(a)*ry,.07)});
    const g=new T.BufferGeometry().setFromPoints(points);ownedGeometries.add(g);const line=new T.Line(g,outlineMaterial);line.computeLineDistances();contextual.add(line);
  }
  const beadGeometry=new T.SphereGeometry(6,16,10);ownedGeometries.add(beadGeometry);
  for(const [x,y] of [[257,151],[242,329],[267,413],[434,224],[534,210],[687,264],[697,334],[523,523],[397,552],[355,499],[474,647]]){
    const geometry=beadGeometry.clone(),uv=geometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*12/STONE_TILE+x/137,uv.getY(i)*12/STONE_TILE+y/191);ownedGeometries.add(geometry);
    const bead=new T.Mesh(geometry,material('beads'));bead.scale.z=.65;bead.position.set(x,-y,4);bead.castShadow=bead.receiveShadow=true;contextual.add(bead);
  }
  function updateEdges(){
    while(edges.children.length){const e=edges.children[0] as T.Line;e.geometry.dispose();edges.remove(e)}
    for(let i=1;i<nodes.length;i++){const source=views.get(nodes[nodes.length===13?0:i-1].id)!,target=views.get(nodes[i].id)!;
      const g=new T.BufferGeometry().setFromPoints([new T.Vector3(source.group.position.x,source.group.position.y,.08),new T.Vector3(target.group.position.x,target.group.position.y,.08)]);edges.add(new T.Line(g,lineMaterial));}
  }
  function project(p:T.Vector3){const v=p.clone().project(camera);return {x:(v.x+1)*width/2,y:(1-v.y)*height/2}}
  function clientToWorld(p:Position){const b=canvas.getBoundingClientRect();return new T.Vector3((p.x-b.left)/b.width*2-1,1-(p.y-b.top)/b.height*2,0).unproject(camera)}
  const raycaster=new T.Raycaster();
  function hit(p:Position){const b=canvas.getBoundingClientRect();raycaster.setFromCamera(new T.Vector2((p.x-b.left)/b.width*2-1,1-(p.y-b.top)/b.height*2),camera);return raycaster.intersectObjects(world.children,true).find(h=>h.object.userData.nodeId)?.object.userData.nodeId as string|undefined}
  function select(id?:string){selectedId=id;options.onSelection(nodes.find(n=>n.id===id));request(false)}
  function updateLighting(){
    applyFlintLight(sunlight, lighting.light, centre);
    configureMaterials();request();
  }
  const stopLight=lighting.subscribe(updateLighting);
  const stopRender=lighting.addTask(()=>{
    if(!dirty||disposed||lost)return;dirty=false;
    camera.left=-width/(2*zoom);camera.right=width/(2*zoom);camera.top=height/(2*zoom);camera.bottom=-height/(2*zoom);camera.position.set(centre.x,centre.y,1600);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    if (environmentRoot && environmentRig) {
      renderer.shadowMap.needsUpdate = true;
      const rootRect = environmentRoot.getBoundingClientRect(), graphRect = container.getBoundingClientRect();
      const left = centre.x - width / (2 * zoom), top = centre.y + height / (2 * zoom);
      const ox = left - (graphRect.left - rootRect.left) / zoom, oy = top + (graphRect.top - rootRect.top) / zoom;
      environmentRig.layout(rootRect.width / zoom, rootRect.height / zoom, ox, oy);
      environmentRig.group.visible = environmentRig.environment.enabled && !lighting.effects.reducedEffects;
      const span = Math.max(rootRect.width, rootRect.height) / zoom * 1.25;
      Object.assign(sunlight.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 16000 });
      sunlight.shadow.camera.updateProjectionMatrix();
      applyFlintLight(sunlight, lighting.light, new T.Vector2(ox + rootRect.width / zoom / 2, oy - rootRect.height / zoom / 2), Math.max(rootRect.width, rootRect.height) / zoom * 2);
      // Match shell texture coordinates through pan/zoom, rather than stretching
      // the material when Graph camera geometry changes.
      const uv = floor.geometry.getAttribute('uv'), positions = floor.geometry.getAttribute('position');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (positions.getX(i) - ox) * zoom / STONE_TILE, (positions.getY(i) - oy + rootRect.height / zoom) * zoom / STONE_TILE);
      uv.needsUpdate = true;
    }
    for(const v of views.values()){
      const p=project(new T.Vector3(v.group.position.x,v.group.position.y-v.spec.height/2-23,0));v.label.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-50%) scale(${zoom})`;v.label.dataset.selected=String(v.spec.id===selectedId);v.label.dataset.hover=String(v.spec.id===hoverId);
    }
    surfaceRegistry?.setShadowCamera(sunlight.shadow.camera);
    const start=performance.now();renderer.render(scene,camera);
    if (environmentRig && detail === 'full' && !lighting.effects.reducedEffects) {
      // Tight geometric ambient contact is distinct from the directional cast
      // already present in the material pass. Reuse the existing floor-only
      // pass with near-normal visibility; exclude the distant architecture.
      const environmentVisible = environmentRig.group.visible, surface = floor.material;
      const sunPosition = sunlight.position.clone(), radius = sunlight.shadow.radius, shadowIntensity = sunlight.shadow.intensity;
      // Near-normal ambient visibility supplies a tight footprint, independent
      // of the displaced sunlight cast. Lift naturally separates this contact.
      sunlight.position.copy(sunlight.target.position).add(new T.Vector3(-8,12,1400));
      sunlight.shadow.radius = 1.1; sunlight.shadow.intensity = 1; floorMaterial.opacity = .24;
      environmentRig.group.visible = false; floor.material = floorMaterial;
      const suppressed = new Set<T.Material>();
      scene.traverse(object => { if (object instanceof T.Mesh || object instanceof T.Line) {
        if (object === floor) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material.colorWrite) { suppressed.add(material); material.colorWrite = false; }
      } });
      renderer.autoClear = false; renderer.shadowMap.needsUpdate = true;
      renderer.render(scene,camera);
      renderer.autoClear = true; suppressed.forEach(material => { material.colorWrite = true; });
      floor.material = surface; environmentRig.group.visible = environmentVisible;
      sunlight.position.copy(sunPosition); sunlight.shadow.radius = radius; sunlight.shadow.intensity = shadowIntensity;
      // This map now contains ambient contact. Rebuild sunlight on the next
      // draw, including zoom/selection draws that otherwise reuse shadow data.
      renderer.shadowMap.needsUpdate = true;
    }
    metrics.lastRenderMs=performance.now()-start;metrics.frames++;metrics.calls=renderer.info.render.calls;metrics.triangles=renderer.info.render.triangles;metrics.geometries=renderer.info.memory.geometries;metrics.textures=renderer.info.memory.textures;
  });
  function fit(){if(!nodes.length)return;const left=Math.min(...nodes.map(n=>n.x)),top=Math.min(...nodes.map(n=>n.y)),right=Math.max(...nodes.map(n=>n.x+n.width)),bottom=Math.max(...nodes.map(n=>n.y+n.height+40));centre.set((left+right)/2,-(top+bottom)/2);zoom=Math.min(1.15,(width-120)/(right-left),(height-120)/(bottom-top));zoom=Math.max(.15,zoom);options.onZoom(zoom);updateLighting()}
  function setFixture(count=13){
    for(const v of views.values()){v.stop();v.label.remove();scene.remove(v.wave);v.wave.geometry.dispose();(v.wave.material as T.Material).dispose();v.group.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();ownedGeometries.delete(o.geometry)}});world.remove(v.group)}views.clear();contactId=undefined;contact.intensity=0;
    nodes=fixtureNodes(count).map(n=>({...n,form:count>13&&n.form==='mask'?'stone':n.form}));contextual.visible=count===13;
    for(const spec of nodes){const group=cloneSculpture(spec);world.add(group);
      const label=document.createElement('span');label.className='flint-three-label';label.textContent=spec.label;label.tabIndex=0;label.setAttribute('role','button');label.setAttribute('aria-label',`${spec.label}, ${spec.relation}`);label.style.fontSize=spec.form==='mask'?'24px':'18px';labels.append(label);
      label.addEventListener('click',()=>{if(window.getSelection()?.isCollapsed!==false)select(spec.id)});label.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){select(spec.id);e.preventDefault()}});
      const wave=new T.Mesh(new T.RingGeometry(.98,1,64),waveMaterial.clone());wave.visible=false;wave.position.z=1;scene.add(wave);
      const apply=(r:MaterialResponse,active:boolean)=>{
        group.position.z=.12+r.travel;wave.visible=r.wave.active;wave.scale.setScalar(Math.max(.001,r.wave.radius));wave.position.x=group.position.x-spec.width/2+r.wave.x;wave.position.y=group.position.y+spec.height/2-r.wave.y;(wave.material as T.MeshBasicMaterial).opacity=r.wave.opacity;
        if(active&&r.glow){contactId=spec.id;contact.position.set(group.position.x-spec.width/2+r.position.x,group.position.y+spec.height/2-r.position.y,group.position.z+28);contact.intensity=r.glow*1600}
        else if(contactId===spec.id){contact.intensity=0;contactId=undefined}
        request();
      };
      const stop=interactions.register({id:spec.id,elevation:spec.form==='mask'?'object':'relief',material:materialForForm(spec.form,finish),geometry:()=>({width:spec.width,height:spec.height}),clientToLocal:p=>{const q=clientToWorld(p);return {x:q.x-group.position.x+spec.width/2,y:group.position.y+spec.height/2-q.y}},apply,capabilities:[{kind:'drag',available:true,label:'Move relief'},{kind:'inspect',available:true,label:'Inspect fixture node'}]});
      views.set(spec.id,{spec,group,label,wave,stop});
    }
    const extent=Math.max(900,...nodes.map(n=>n.x+n.width),...nodes.map(n=>n.y+n.height));for(const side of ['left','bottom'] as const)sunlight.shadow.camera[side]=-extent*.8;for(const side of ['right','top'] as const)sunlight.shadow.camera[side]=extent*.8;sunlight.shadow.camera.updateProjectionMatrix();
    configureMaterials();updateEdges();select(nodes[0]?.id);fit();
    options.minimap.replaceChildren();const mini=document.createElement('div');mini.className='flint-three-minimap';mini.setAttribute('aria-hidden','true');for(const spec of nodes){const dot=document.createElement('i');dot.style.left=`${spec.x/extent*100}%`;dot.style.top=`${spec.y/extent*100}%`;mini.append(dot)}options.minimap.append(mini);
  }
  function translateNode(id:string,dx:number,dy:number){const v=views.get(id);if(!v)return;v.spec.x+=dx;v.spec.y+=dy;v.group.position.x+=dx;v.group.position.y-=dy;updateEdges();request()}
  let drag:{pointer:number;id?:string;start:Position;last:Position;world:T.Vector3;moved:boolean}|undefined;
  const down=(e:PointerEvent)=>{if(e.button!==0)return;const id=hit({x:e.clientX,y:e.clientY});drag={pointer:e.pointerId,id,start:{x:e.clientX,y:e.clientY},last:{x:e.clientX,y:e.clientY},world:clientToWorld({x:e.clientX,y:e.clientY}),moved:false};canvas.setPointerCapture(e.pointerId);container.focus({preventScroll:true});if(id)select(id)};
  const move=(e:PointerEvent)=>{const p={x:e.clientX,y:e.clientY};if(!drag){const id=hit(p);if(id!==hoverId){hoverId=id;request(false)}return}if(e.pointerId!==drag.pointer)return;
    if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>3)drag.moved=true;
    if(drag.id){const q=clientToWorld(p),dx=q.x-drag.world.x,dy=drag.world.y-q.y;translateNode(drag.id,dx,dy);drag.world=q;if(!lighting.effects.reducedMotion)interactions.set(drag.id,{lift:.5,contact:.15})}
    else {centre.x-=(p.x-drag.last.x)/zoom;centre.y+=(p.y-drag.last.y)/zoom;updateLighting()}drag.last=p;
  };
  const end=(e:PointerEvent)=>{if(!drag||e.pointerId!==drag.pointer)return;const current=drag;drag=undefined;if(current.id)interactions.clear(current.id);else if(!current.moved)select();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId)};
  const wheel=(e:WheelEvent)=>{e.preventDefault();if(e.ctrlKey||e.metaKey){zoom=Math.max(.15,Math.min(2.5,zoom*Math.exp(-e.deltaY*.003)));options.onZoom(zoom);request(false)}else{centre.x+=e.deltaX/zoom;centre.y-=e.deltaY/zoom;updateLighting()}};
  const key=(e:KeyboardEvent)=>{if(e.target!==container)return;if(e.key==='Escape'){select();e.preventDefault()}const d=e.shiftKey?20:5,dx=e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0,dy=e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0;if(dx||dy){e.preventDefault();if(selectedId)translateNode(selectedId,dx,dy);else{centre.x+=dx;centre.y-=dy;updateLighting()}}};
  const contextLost=(e:Event)=>{e.preventDefault();lost=true;const message=document.createElement('p');message.className='flint-three-error';message.setAttribute('role','status');message.textContent='Graph graphics paused. Reload the study or return to the SVG baseline.';container.append(message)};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('webglcontextlost',contextLost);container.addEventListener('keydown',key);
  const resize=new ResizeObserver(()=>{width=Math.max(1,container.clientWidth);height=Math.max(1,container.clientHeight);renderer.setSize(width,height,false);fit()});resize.observe(container);
  const api={
    renderer,scene,camera,metrics,hit,clientToWorld,project,views,
    get nodes(){return nodes},get selectedId(){return selectedId},get disposed(){return disposed},get zoom(){return zoom},
    setFixture,select,fit,
    setEnvironment(value: LightEnvironment = CYCLADIC_APERTURE) { environmentRig?.setEnvironment(value); request(); },
    setTextureLayers(value:TextureLayers){layers=value;configureMaterials();request(false)},
    setDetail(value:DetailLevel){detail=value;container.dataset.detail=value;configureMaterials();for(const v of views.values())v.group.traverse(o=>{if(o instanceof T.Mesh)o.material=value==='flat'?plain:material(v.spec.form)});request()},
    setFinish(value:StoneFinish){finish=value;container.dataset.finish=value;for(const v of views.values()){v.group.traverse(o=>{if(o instanceof T.Mesh)o.material=detail==='flat'?plain:material(v.spec.form)});const target=interactions.target(v.spec.id);if(target)target.material=materialForForm(v.spec.form,finish)}contextual.traverse(o=>{if(o instanceof T.Mesh)o.material=material('beads')});configureMaterials();request()},
    zoomBy(delta:number){zoom=Math.max(.15,Math.min(2.5,zoom+delta));options.onZoom(zoom);request(false)},
    pan(dx:number,dy:number){centre.x-=dx/zoom;centre.y+=dy/zoom;updateLighting()},move(dx:number,dy:number){if(selectedId)translateNode(selectedId,dx,dy)},
    dispose(){if(disposed)return;disposed=true;resize.disconnect();stopLight();stopRender();environmentRig?.dispose();surfaceRegistry?.dispose();stoneDetail.dispose();for(const v of views.values()){v.stop();scene.remove(v.wave);v.wave.geometry.dispose();(v.wave.material as T.Material).dispose()}views.clear();for(const g of ownedGeometries)g.dispose();for(const m of materials.values())m.dispose();for(const t of textures)t.dispose();for(const e of edges.children)(e as T.Line).geometry.dispose();floor.geometry.dispose();floorMaterial.dispose();plain.dispose();lineMaterial.dispose();waveMaterial.dispose();outlineMaterial.dispose();sunlight.shadow.dispose();renderer.dispose();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',end);canvas.removeEventListener('pointercancel',end);canvas.removeEventListener('lostpointercapture',end);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('webglcontextlost',contextLost);container.removeEventListener('keydown',key);renderer.forceContextLoss();canvas.remove();labels.remove();options.minimap.replaceChildren();},
  };
  return api;
};
