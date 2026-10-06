import * as T from 'three';
import { STONE_TILE } from './stone-detail';
import type { Lighting } from '../lighting';
import { applyFlintLight, configureMaterialRenderer, createFlintAmbient, FLINT_SUN_COLOR } from './scene-light';
import { createOcclusionRig, type LightEnvironment } from './light-environment';
import { createMaterialRegistry, type SurfaceMaterial } from './material-registry';

/** One CSS pixel = one scene unit, x-right/y-up, camera perpendicular to XY.
 * Only explicitly registered major rectangles are measured, on invalidation.
 * No animation loop, DOM traversal, or editor-content observation. */
export function createMaterialScene(root: HTMLElement, lighting: Lighting, onAvailable: (value: boolean) => void) {
  const canvas = document.createElement('canvas');
  canvas.className = 'flint-material-canvas'; canvas.setAttribute('aria-hidden', 'true');
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  configureMaterialRenderer(renderer);
  const scene = new T.Scene(), camera = new T.OrthographicCamera(0, 1, 0, -1, .1, 6000);
  camera.position.z = 2400;
  const sunlight = new T.DirectionalLight(FLINT_SUN_COLOR, 3), ambient = createFlintAmbient();
  sunlight.castShadow = true; sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.bias = -.00015; sunlight.shadow.normalBias = .2;
  sunlight.shadow.camera.near = 1; sunlight.shadow.camera.far = 6500;
  scene.add(sunlight, sunlight.target, ambient);
  let dirty = true, layoutDirty = true, disposed = false, lost = false, width = 1, height = 1;
  const metrics = { frames: 0, surfaces: 0 };
  const request = () => { if (!disposed && !lost) { dirty = true; renderer.shadowMap.needsUpdate = true; lighting.request(); } };
  const registry = createMaterialRegistry(request, .72), rig = createOcclusionRig(scene);
  const geometry = new T.PlaneGeometry(1, 1);
  const substrate = new T.Mesh(geometry, registry.get('limestone')); substrate.receiveShadow = true; scene.add(substrate);
  const surfaces = new Map<HTMLElement, T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>>();
  const invalidateLayout = () => { layoutDirty = true; request(); };
  const observer = new ResizeObserver(invalidateLayout); observer.observe(root);
  // Scroll outside the app changes all client rectangles together; internal
  // scroll can move a registered rectangle in the study. No per-frame polling.
  root.addEventListener('scroll', invalidateLayout, true);
  const stopLight = lighting.subscribe(request);
  function geometryFor(mesh: T.Mesh, w: number, h: number, x: number, y: number, z: number) {
    mesh.scale.set(w, h, 1); mesh.position.set(x + w / 2, -y - h / 2, z);
    // World-sized texture repeat, not stretched to each surface's aspect ratio.
    if (mesh.geometry !== geometry) mesh.geometry.dispose();
    const plane = new T.PlaneGeometry(1, 1), uv = plane.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * w) / STONE_TILE, (-y + uv.getY(i) * h) / STONE_TILE);
    mesh.geometry = plane;
  }
  const stopRender = lighting.addTask(() => {
    if (!dirty || disposed || lost) return;
    dirty = false;
    canvas.hidden = lighting.effects.reducedEffects;
    if (lighting.effects.reducedEffects) { onAvailable(false); return; }
    if (layoutDirty) {
      layoutDirty = false;
      const bounds = root.getBoundingClientRect();
      width = Math.max(1, root.clientWidth); height = Math.max(1, root.clientHeight);
      const sx = bounds.width / width || 1, sy = bounds.height / height || 1;
      renderer.setSize(width, height, false);
      camera.right = width; camera.bottom = -height; camera.updateProjectionMatrix();
      geometryFor(substrate, width, height, 0, 0, 0);
      for (const [element, mesh] of surfaces) {
        const r = element.getBoundingClientRect(); mesh.visible = r.width > 0 && r.height > 0;
        geometryFor(mesh, r.width / sx, r.height / sy, (r.left - bounds.left) / sx, (r.top - bounds.top) / sy, .7);
      }
      rig.layout(width, height);
      const span = Math.max(width, height) * 1.25;
      Object.assign(sunlight.shadow.camera, { left: -span, right: span, top: span, bottom: -span });
      sunlight.shadow.camera.updateProjectionMatrix();
    }
    applyFlintLight(sunlight, lighting.light, new T.Vector2(width / 2, -height / 2), Math.max(width, height) * 2);
    registry.setShadowCamera(sunlight.shadow.camera);
    renderer.render(scene, camera); metrics.frames++; onAvailable(true);
  });
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; canvas.hidden = true; onAvailable(false); };
  const contextRestored = () => { lost = false; canvas.hidden = false; invalidateLayout(); };
  canvas.addEventListener('webglcontextlost', contextLost); canvas.addEventListener('webglcontextrestored', contextRestored);
  root.prepend(canvas); request();
  return {
    scene, camera, renderer, rig, metrics,
    get disposed() { return disposed; },
    invalidateLayout,
    setEnvironment(environment: LightEnvironment) { rig.setEnvironment(environment); invalidateLayout(); },
    setMaterial(name: SurfaceMaterial) { substrate.material = registry.get(name); request(); },
    registerSurface(element: HTMLElement, name: SurfaceMaterial = 'paper') {
      if (surfaces.has(element)) throw new Error('Material surface already registered');
      const mesh = new T.Mesh(geometry, registry.get(name)); mesh.receiveShadow = true;
      scene.add(mesh); surfaces.set(element, mesh); metrics.surfaces = surfaces.size; observer.observe(element); invalidateLayout();
      return () => { observer.unobserve(element); surfaces.delete(element); metrics.surfaces = surfaces.size; scene.remove(mesh); if (mesh.geometry !== geometry) mesh.geometry.dispose(); invalidateLayout(); };
    },
    dispose() {
      if (disposed) return; disposed = true;
      observer.disconnect(); root.removeEventListener('scroll', invalidateLayout, true); stopLight(); stopRender();
      for (const mesh of surfaces.values()) if (mesh.geometry !== geometry) mesh.geometry.dispose();
      surfaces.clear(); metrics.surfaces = 0; substrate.geometry.dispose(); geometry.dispose();
      registry.dispose(); rig.dispose(); sunlight.shadow.dispose();
      canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); onAvailable(false);
    },
  };
}
export type MaterialScene = ReturnType<typeof createMaterialScene>;
