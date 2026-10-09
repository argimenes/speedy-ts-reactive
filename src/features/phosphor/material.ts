import * as T from "three";
import { createMaterialScene } from "../flint/material/material-scene";
import { createLighting } from "../flint/lighting";
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
    azimuth: 250,
    elevation: 45,
    intensity: 0.9,
    softness: 0.8,
  });
  const grain = createBronzeGrain();
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
            frame = name === "limestone";
          materials.set(
            name,
            new T.MeshPhysicalMaterial({
              color: screen ? 0x010201 : frame ? 0x0c0b08 : 0x030403,
              metalness: frame ? 0.85 : 0.12,
              roughness: screen ? 0.21 : frame ? 0.68 : 0.3,
              roughnessMap: frame ? grain : null,
              bumpMap: frame ? grain : null,
              bumpScale: 0.1,
              clearcoat: frame ? 0.12 : 0.35,
              clearcoatRoughness: screen ? 0.23 : 0.3,
              envMapIntensity: screen ? 0.008 : frame ? 0.14 : 0.02,
              specularIntensity: 0.25,
              specularColor: 0xffd18b,
              transparent: !screen,
              opacity: frame ? 0.92 : screen ? 1 : 0.82,
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
  scene.scene.environment = environment.texture;
  // Reflections provide context; the shared directional source reveals relief.
  scene.scene.environmentIntensity = 0.05;
  const metal = new T.MeshPhysicalMaterial({
    color: 0x302316,
    metalness: 0.88,
    roughness: 0.4,
    roughnessMap: grain,
    bumpMap: grain,
    bumpScale: 0.16,
    clearcoat: 0.18,
    clearcoatRoughness: 0.32,
    envMapIntensity: 0.5,
  });
  const innerMetal = metal.clone();
  innerMetal.color.set(0x4a331b);
  innerMetal.roughness = 0.34;
  innerMetal.envMapIntensity = 0.6;
  innerMetal.clippingPlanes = glassClip;
  const edge = metal.clone();
  edge.color.set(0xb28a52);
  edge.roughness = 0.24;
  edge.envMapIntensity = 0.65;
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
