import * as T from "three";
import { createMaterialScene } from "../flint/material/material-scene";
import { createLighting } from "../flint/lighting";
import { OPEN_ENVIRONMENT } from "../flint/material/light-environment-config";
import { createCrystalEnvironment } from "../flint/probe/crystal-optics";
import type { SurfaceMaterial } from "../flint/material/material-registry";

// These are decorative rims around a handful of DOM rectangles. Their real
// bevel normals catch the same directional light and PMREM as the glass planes.
function contour(w: number, h: number, r: number) {
  const p = new T.Shape(),
    x = -w / 2,
    y = -h / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
  return p;
}
function rim(w: number, h: number, lip: number, depth: number, radius: number) {
  const shape = contour(w, h, radius);
  shape.holes.push(
    contour(w - lip * 2, h - lip * 2, Math.max(1, radius - lip)),
  );
  return new T.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: lip * 0.32,
    bevelThickness: 1.3,
    curveSegments: 5,
  });
}
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
  const lighting = createLighting(root);
  lighting.setLight({
    azimuth: 300,
    elevation: 48,
    intensity: 0.48,
    softness: 0.85,
  });
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
              color: screen ? 0x010202 : frame ? 0x070604 : 0x080907,
              metalness: frame ? 0.9 : 0.4,
              roughness: screen ? 0.26 : frame ? 0.4 : 0.45,
              clearcoat: screen ? 0.65 : frame ? 0.24 : 0.45,
              clearcoatRoughness: screen ? 0.24 : 0.18,
              envMapIntensity: screen ? 0.035 : 0.08,
              specularIntensity: 0.5,
              specularColor: 0xffdda1,
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
    scene = createMaterialScene(root, lighting, available, registry);
  } catch (error) {
    lighting.dispose();
    throw error;
  }
  scene.setEnvironment(OPEN_ENVIRONMENT);
  scene.renderer.shadowMap.enabled = false;
  scene.renderer.localClippingEnabled = true;
  const environment = createCrystalEnvironment(scene.renderer);
  scene.scene.environment = environment.texture;
  const metal = new T.MeshPhysicalMaterial({
    color: 0x372715,
    metalness: 0.9,
    roughness: 0.24,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.8,
  });
  const innerMetal = new T.MeshPhysicalMaterial({
    color: 0x745127,
    metalness: 0.85,
    roughness: 0.28,
    emissive: 0xffa32a,
    emissiveIntensity: 0.055,
    envMapIntensity: 0.5,
    clippingPlanes: glassClip,
  });
  const targets = [
    { element: root, lip: 5, depth: 7, radius: 12, material: metal },
    {
      element: elements.display,
      lip: 4,
      depth: 4,
      radius: 9,
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
    const mesh = new T.Mesh(new T.BufferGeometry(), t.material);
    scene.scene.add(mesh);
    return { mesh, width: 0, height: 0 };
  });
  const stops = [
    scene.registerSurface(elements.display, "marble"),
    ...elements.panels.map((p) => scene.registerSurface(p, "paper")),
  ];
  const layout = () => {
    const b = root.getBoundingClientRect(),
      sx = b.width / root.clientWidth || 1,
      sy = b.height / root.clientHeight || 1;
    const bay = elements.workspace.getBoundingClientRect();
    glassClip[0].constant = -(bay.left - b.left) / sx;
    glassClip[1].constant = (bay.right - b.left) / sx;
    glassClip[2].constant = (bay.bottom - b.top) / sy;
    glassClip[3].constant = -(bay.top - b.top) / sy;
    const zoom = Number(root.style.getPropertyValue("--screen-zoom")) || 1;
    targets.forEach((target, i) => {
      const r = target.element.getBoundingClientRect(),
        inset = i === 0 ? 3 : 0,
        w = r.width / sx - inset * 2,
        h = r.height / sy - inset * 2,
        frame = frames[i];
      frame.mesh.visible = w > 20 && h > 20;
      if (!frame.mesh.visible) return;
      if (frame.width !== w || frame.height !== h) {
        frame.mesh.geometry.dispose();
        frame.mesh.geometry = rim(
          w,
          h,
          target.lip * (i === 1 ? zoom : 1),
          target.depth * (i === 1 ? zoom : 1),
          target.radius * (i === 1 ? zoom : 1),
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
  const observer = new ResizeObserver(layout);
  targets.forEach((t) => observer.observe(t.element));
  observer.observe(elements.workspace);
  root.addEventListener("scroll", layout, true);
  layout();
  return {
    layout,
    dispose() {
      observer.disconnect();
      root.removeEventListener("scroll", layout, true);
      stops.forEach((stop) => stop());
      frames.forEach(({ mesh }) => {
        scene.scene.remove(mesh);
        mesh.geometry.dispose();
      });
      metal.dispose();
      innerMetal.dispose();
      environment.dispose();
      scene.dispose();
      lighting.dispose();
    },
  };
}
