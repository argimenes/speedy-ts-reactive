import * as T from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Lighting } from '../lighting';
import { applyFlintLight, configureMaterialRenderer, createFlintAmbient, FLINT_SUN_COLOR } from '../material/scene-light';
import { MATERIAL_PALETTE, type SurfaceMaterial } from '../material/material-registry';
import limestoneURL from '../assets/limestone-fine-albedo.png';
import marbleURL from '../assets/marble-albedo.png';
import { chromeLayout } from './layout';

export interface ChromeControl { id: string; label: string; disabled?: boolean; active?: boolean }
export interface ChromeModel { title: string; controls: readonly ChromeControl[]; width: number; brand?: boolean }

/** A bounded scene: no scroll listeners, DOM queries, or world/client-position tracking.
 * Geometry and text are cached until their local model changes. A label and body
 * belong to the same Group and are always drawn in the same WebGL frame. */
export function createChromeRenderer(canvas: HTMLCanvasElement, lighting: Lighting, available: (ready: boolean) => void) {
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  configureMaterialRenderer(renderer);
  const scene = new T.Scene(), camera = new T.OrthographicCamera(0, 1, 0, -1, .1, 2000);
  camera.position.z = 800;
  const sun = new T.DirectionalLight(FLINT_SUN_COLOR, 3);
  sun.castShadow = true; sun.shadow.mapSize.set(512, 512); sun.shadow.bias = -.0005;
  Object.assign(sun.shadow.camera, { near: 1, far: 2400 });
  scene.add(sun, sun.target, createFlintAmbient());
  let disposed = false, lost = false, dirty = true, model: ChromeModel = { title: '', controls: [], width: 1 };
  let signature = '', focused: string | undefined, hovered: string | undefined, pressed: string | undefined;
  let finish: SurfaceMaterial = 'limestone';
  const metrics = { frames: 0, layouts: 0, textUploads: 0 };
  const request = () => { if (!disposed && !lost) { dirty = true; lighting.request(); } };
  const textures = [limestoneURL, marbleURL].map(url => {
    const texture = new T.TextureLoader().load(url, request);
    texture.colorSpace = T.SRGBColorSpace; texture.wrapS = texture.wrapT = T.RepeatWrapping;
    return texture;
  });
  const stone = new T.MeshStandardMaterial({ map: textures[0], color: 0xe9e5db, roughness: .96 });
  const key = new T.MeshStandardMaterial({ map: textures[1], color: 0xf5f1e7, roughness: .78 });
  const activeKey = new T.MeshStandardMaterial({ map: textures[1], color: 0xc9c1ad, roughness: .85 });
  const disabledKey = new T.MeshStandardMaterial({ map: textures[1], color: 0xdedbd2, roughness: 1 });
  const focusMaterial = new T.MeshBasicMaterial({ color: 0x526c74 });
  const hoverMaterial = new T.MeshBasicMaterial({ color: 0xa18d63 });
  const content = new T.Group(); scene.add(content);
  const geometries = new Set<T.BufferGeometry>(), labelMaterials = new Set<T.Material>(), labelTextures = new Set<T.Texture>();
  const controls = new Map<string, { group: T.Group; body: T.Mesh; ring: T.Mesh; control: ChromeControl }>();
  const icon = new Image();
  icon.onload = () => { if (!disposed && model.brand) { signature = ''; update(model); } };
  icon.src = new URL('../../../../docs/assets/flint/flint-app-icon-master.png', import.meta.url).href;

  function box(width: number, height: number, depth: number, material: T.Material) {
    const geometry = new RoundedBoxGeometry(Math.max(1, width), Math.max(1, height), depth, 2, Math.min(2, depth / 2));
    // Use world-sized texture coordinates, never a stretched image per control.
    const uv = geometry.getAttribute('uv'), positions = geometry.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, positions.getX(i) / 180, positions.getY(i) / 180);
    geometries.add(geometry);
    const mesh = new T.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  function label(text: string, width: number, height: number, title = false, brand = false, disabled = false) {
    const image = document.createElement('canvas'), scale = 2;
    image.width = Math.max(1, Math.ceil(width * scale)); image.height = height * scale;
    const ctx = image.getContext('2d')!; ctx.scale(scale, scale);
    let left = title ? 3 : 8;
    if (brand && icon.complete && icon.naturalWidth) {
      const unit = icon.naturalWidth / 104;
      ctx.drawImage(icon, 33 * unit, 10 * unit, 40 * unit, 59 * unit, 2, 0, 27, 40); left = 40;
    }
    ctx.font = title ? '18px Georgia, serif' : '13px system-ui, sans-serif';
    ctx.fillStyle = disabled ? '#77746b' : '#34332e'; ctx.textBaseline = 'middle';
    let shown = text;
    const max = width - left - 8;
    if (ctx.measureText(shown).width > max) {
      while (shown.length && ctx.measureText(shown + '…').width > max) shown = shown.slice(0, -1);
      shown += '…';
    }
    ctx.textAlign = title ? 'left' : 'center';
    ctx.fillText(shown, title ? left : width / 2, height / 2);
    const texture = new T.CanvasTexture(image); texture.colorSpace = T.SRGBColorSpace;
    texture.minFilter = T.LinearFilter; texture.generateMipmaps = false; labelTextures.add(texture); metrics.textUploads++;
    const material = new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }); labelMaterials.add(material);
    const geometry = new T.PlaneGeometry(width, height); geometries.add(geometry);
    return new T.Mesh(geometry, material);
  }
  function clear() {
    content.clear(); controls.clear(); geometries.forEach(g => g.dispose()); geometries.clear();
    labelMaterials.forEach(m => m.dispose()); labelMaterials.clear(); labelTextures.forEach(t => t.dispose()); labelTextures.clear();
  }
  function update(next: ChromeModel) {
    model = next;
    const nextSignature = JSON.stringify(next);
    if (nextSignature === signature) return;
    signature = nextSignature; clear(); metrics.layouts++;
    const layout = chromeLayout(next.width, next.controls.length);
    renderer.setSize(layout.width, layout.height, false);
    camera.right = layout.width; camera.bottom = -layout.height; camera.updateProjectionMatrix();
    const slab = box(layout.width, layout.height, 4, stone); slab.position.set(layout.width / 2, -layout.height / 2, -4); content.add(slab);
    const heading = label(next.title, Math.max(1, layout.width - 20), 40, true, next.brand);
    heading.position.set(layout.width / 2, -24, 1); content.add(heading);
    next.controls.forEach((control, index) => {
      const rect = layout.controls[index], group = new T.Group(); group.position.set(rect.x + rect.width / 2, -rect.y - rect.height / 2, 0);
      const ring = box(rect.width + 4, rect.height + 4, 1, focusMaterial); ring.position.z = .5; ring.castShadow = false;
      const body = box(rect.width, rect.height, 6, control.disabled ? disabledKey : control.active ? activeKey : key); body.position.z = 4;
      const text = label(control.label, rect.width, rect.height, false, false, control.disabled); text.position.z = 7.1;
      group.add(ring, body, text); content.add(group); controls.set(control.id, { group, body, ring, control });
    });
    Object.assign(sun.shadow.camera, { left: -layout.width, right: layout.width, top: layout.height, bottom: -layout.height });
    sun.shadow.camera.updateProjectionMatrix(); state(focused, hovered, pressed); request();
  }
  function state(focus?: string, hover?: string, press?: string) {
    focused = focus; hovered = hover; pressed = press;
    for (const [id, view] of controls) {
      view.group.position.z = view.control.disabled ? 0 : id === press ? -1.5 : view.control.active ? -.7 : 0;
      view.ring.visible = !view.control.disabled && (id === focus || id === hover);
      view.ring.material = id === focus ? focusMaterial : hoverMaterial;
    }
    request();
  }
  const stopLight = lighting.subscribe(request);
  const stopRender = lighting.addTask(() => {
    if (!dirty || disposed || lost) return;
    dirty = false;
    if (lighting.effects.reducedEffects) { available(false); return; }
    const layout = chromeLayout(model.width, model.controls.length);
    applyFlintLight(sun, lighting.light, new T.Vector2(layout.width / 2, -layout.height / 2), 700);
    renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); metrics.frames++; available(true);
  });
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; available(false); };
  const contextRestored = () => { lost = false; request(); };
  canvas.addEventListener('webglcontextlost', contextLost); canvas.addEventListener('webglcontextrestored', contextRestored);
  return {
    metrics, renderer, scene, get disposed() { return disposed; }, update, state,
    setMaterial(name: SurfaceMaterial) {
      if (finish === name) return; finish = name;
      stone.color.setHex(MATERIAL_PALETTE[name].color); stone.roughness = MATERIAL_PALETTE[name].roughness;
      stone.map = textures[name === 'marble' ? 1 : 0]; stone.needsUpdate = true; request();
    },
    dispose() {
      if (disposed) return; disposed = true; icon.onload = null; stopRender(); stopLight(); clear();
      [stone, key, activeKey, disabledKey, focusMaterial, hoverMaterial].forEach(m => m.dispose()); textures.forEach(t => t.dispose()); sun.shadow.dispose();
      canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
      renderer.dispose(); renderer.forceContextLoss(); available(false);
    },
  };
}
export type ChromeRenderer = ReturnType<typeof createChromeRenderer>;
