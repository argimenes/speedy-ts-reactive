import * as T from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { createMaterialScene } from "../flint/material/material-scene";
import { createLighting } from "../flint/lighting";
import { lightVector } from "../flint/material-response";
import { OPEN_ENVIRONMENT } from "../flint/material/light-environment-config";
import { createCrystalEnvironment } from "../flint/probe/crystal-optics";
import type { SurfaceMaterial } from "../flint/material/material-registry";
import { createBronzeGrain } from "./bronze";
import { relief } from "./geometry";
import { createPhysicalControls } from "./physical-controls";

const presentations = new WeakMap<
  HTMLElement,
  ReturnType<typeof createPhosphorMaterial>
>();
export const phosphorMaterial = (root: HTMLElement) => presentations.get(root);
let areaLightReady = false;

/** DOM remains the spatial/input authority. Rendering only happens on invalidation. */
export function createPhosphorMaterial(
  root: HTMLElement,
  elements: {
    display: HTMLElement;
    workspace: HTMLElement;
    panels: HTMLElement[];
  },
  available: (ready: boolean) => void,
) {
  const sceneRoot = root.closest<HTMLElement>(".reactive-window") ?? root;
  const lighting = createLighting(root);
  lighting.setLight({
    azimuth: 235,
    elevation: 28,
    intensity: 0.9,
    softness: 0.8,
  });
  const grain = createBronzeGrain();
  let reflectionEnvironment: T.Texture | null = null;
  const glassClip = [
    new T.Plane(new T.Vector3(1, 0, 0)),
    new T.Plane(new T.Vector3(-1, 0, 0)),
    new T.Plane(new T.Vector3(0, 1, 0)),
    new T.Plane(new T.Vector3(0, -1, 0)),
  ];
  const registry = () => {
    const materials = new Map<SurfaceMaterial, T.MeshPhysicalMaterial>();
    return {
      get(name: SurfaceMaterial) {
        if (!materials.has(name)) {
          const screen = name === "marble",
            backing = name === "limestone";
          materials.set(
            name,
            new T.MeshPhysicalMaterial({
              // The window backing is smoked glass, not a nearly opaque metal
              // sheet underneath every other translucent surface.
              color: screen ? 0x030604 : 0x20251f,
              metalness: 0,
              roughness: screen ? 0.3 : 0.18,
              clearcoat: screen ? 0.35 : 1,
              clearcoatRoughness: screen ? 0.25 : 0.13,
              envMap: reflectionEnvironment,
              envMapIntensity: screen ? 0.035 : backing ? 0.18 : 0.38,
              ior: 1.48,
              specularIntensity: 1,
              // Alpha composites the DOM photograph. Three's transmission
              // buffer cannot contain that photograph or the live DOM text.
              transmission: 0,
              transparent: !screen,
              opacity: screen ? 1 : backing ? 0.54 : 0.56,
              depthWrite: screen,
              clippingPlanes: screen ? glassClip : null,
            }),
          );
        }
        return materials.get(name)!;
      },
      setShadowCamera() {},
      dispose() {
        materials.forEach((m) => m.dispose());
        materials.clear();
      },
    };
  };
  let scene: ReturnType<typeof createMaterialScene>;
  try {
    scene = createMaterialScene(sceneRoot, lighting, available, registry);
    scene.renderer.domElement.classList.add("ph-material-canvas");
  } catch (error) {
    grain.dispose();
    lighting.dispose();
    throw error;
  }
  scene.setEnvironment(OPEN_ENVIRONMENT);
  // Keep Flint's light positioning and scheduler, tinting the existing lights
  // to the left-hand amber opening in the supplied architectural photograph.
  scene.scene.traverse((object) => {
    if (object instanceof T.DirectionalLight) {
      object.color.set(0xffd397);
      object.shadow.bias = -0.000015;
      object.shadow.normalBias = 0.06;
    }
    if (object instanceof T.HemisphereLight) {
      object.color.set(0xeacaa0);
      object.groundColor.set(0x322011);
      object.intensity = 0.15;
    }
  });
  scene.renderer.shadowMap.enabled = true;
  scene.renderer.localClippingEnabled = true;
  const environment = createCrystalEnvironment(scene.renderer);
  scene.scene.environment = reflectionEnvironment = environment.texture;
  // An explicit map preserves each material's reflection strength. Three.js
  // otherwise substitutes scene.environmentIntensity for envMapIntensity.
  scene.scene.traverse((object) => {
    if (
      object instanceof T.Mesh &&
      object.material instanceof T.MeshPhysicalMaterial
    )
      object.material.envMap = reflectionEnvironment;
  });
  if (!areaLightReady) {
    RectAreaLightUniformsLib.init();
    areaLightReady = true;
  }
  const key = new T.RectAreaLight(0xffe1b5);
  key.name = "Phosphor broad key";
  scene.scene.add(key);
  const updateKey = () => {
    const width = sceneRoot.clientWidth,
      height = sceneRoot.clientHeight,
      span = Math.max(width, height),
      light = lighting.light,
      v = lightVector(light);
    key.width = span * (0.35 + light.softness * 0.6);
    key.height = span * (0.2 + light.softness * 0.35);
    key.intensity = light.intensity * 1.5;
    key.position.set(
      width / 2 + v.x * span * 0.35,
      -height / 2 - v.y * span * 0.35,
      v.z * span * 0.35,
    );
    // Keep the broad opening parallel to the display. Tilting a nearby large
    // emitter through the UI plane causes a hard back-face lighting cutoff.
    key.rotation.set(0, 0, 0);
  };
  // The shared directional source still casts shadows; the area source gives
  // metal/glass a broad specular response using the same direction/softness.
  const stopKey = lighting.subscribe(updateKey);
  const metal = new T.MeshPhysicalMaterial({
    color: 0x484032,
    metalness: 0.88,
    roughness: 0.56,
    roughnessMap: grain,
    bumpMap: grain,
    bumpScale: 0.09,
    anisotropy: 0.65,
    clearcoat: 0.08,
    clearcoatRoughness: 0.32,
    envMap: reflectionEnvironment,
    envMapIntensity: 0.24,
  });
  const innerMetal = metal.clone();
  innerMetal.color.set(0x584933);
  innerMetal.roughness = 0.5;
  innerMetal.clippingPlanes = glassClip;
  const edge = metal.clone();
  edge.color.set(0x947653);
  edge.roughness = 0.32;
  edge.envMapIntensity = 0.38;
  edge.bumpScale = 0.045;
  const innerEdge = edge.clone();
  innerEdge.clippingPlanes = glassClip;
  const targets = [
    { element: sceneRoot, lip: 6, depth: 7, radius: 12, material: metal },
    {
      element: elements.display,
      lip: 10,
      depth: 6,
      radius: 18,
      material: innerMetal,
    },
    ...elements.panels.map((element) => ({
      element,
      lip: 2,
      depth: 2,
      radius: 6,
      material: metal,
    })),
  ];
  const frames = targets.map((t) => {
    const mesh = new T.Mesh(new T.BufferGeometry(), [
      t.material,
      t.material === innerMetal ? innerEdge : edge,
    ]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.phosphorElement = t.element;
    scene.scene.add(mesh);
    return { mesh, width: 0, height: 0 };
  });
  const stops = [
    scene.registerSurface(elements.display, "marble"),
    ...elements.panels.map((p) => scene.registerSurface(p, "paper")),
  ];
  const layout = () => {
    updateKey();
    const b = sceneRoot.getBoundingClientRect(),
      sx = b.width / sceneRoot.clientWidth || 1,
      sy = b.height / sceneRoot.clientHeight || 1;
    const bay = elements.workspace.getBoundingClientRect();
    glassClip[0].constant = -(bay.left - b.left) / sx;
    glassClip[1].constant = (bay.right - b.left) / sx;
    glassClip[2].constant = (bay.bottom - b.top) / sy;
    glassClip[3].constant = -(bay.top - b.top) / sy;
    const zoom = Number(root.style.getPropertyValue("--screen-zoom")) || 1;
    targets.forEach((target, i) => {
      const r = target.element.getBoundingClientRect(),
        inset = i === 0 ? 3 : i === 1 ? -10 * zoom : 0,
        w = r.width / sx - inset * 2,
        h = r.height / sy - inset * 2,
        frame = frames[i];
      frame.mesh.visible = w > 20 && h > 20;
      if (!frame.mesh.visible) return;
      if (frame.width !== w || frame.height !== h) {
        frame.mesh.geometry.dispose();
        frame.mesh.geometry = relief(
          w,
          h,
          target.depth * (i === 1 ? zoom : 1),
          target.radius * (i === 1 ? zoom : 1),
          target.lip * (i === 1 ? zoom : 1),
        );
        frame.width = w;
        frame.height = h;
      }
      frame.mesh.position.set(
        (r.left - b.left) / sx + inset + w / 2,
        -((r.top - b.top) / sy + inset + h / 2),
        1,
      );
    });
    scene.invalidateLayout();
  };
  const controls = createPhysicalControls(
    root,
    sceneRoot,
    scene.scene,
    grain,
    scene.invalidateLayout,
  );
  const observer = new ResizeObserver(() => {
    layout();
    controls.layout();
  });
  targets.forEach((t) => observer.observe(t.element));
  observer.observe(elements.workspace);
  root.addEventListener("scroll", layout, true);
  layout();
  const presentation = {
    layout,
    lighting,
    scene: scene.scene,
    metrics: scene.metrics,
    controls,
    dispose() {
      presentations.delete(root);
      controls.dispose();
      stopKey();
      scene.scene.remove(key);
      observer.disconnect();
      root.removeEventListener("scroll", layout, true);
      stops.forEach((stop) => stop());
      frames.forEach(({ mesh }) => {
        scene.scene.remove(mesh);
        mesh.geometry.dispose();
      });
      metal.dispose();
      innerMetal.dispose();
      edge.dispose();
      innerEdge.dispose();
      grain.dispose();
      environment.dispose();
      scene.dispose();
      lighting.dispose();
    },
  };
  presentations.set(root, presentation);
  return presentation;
}
