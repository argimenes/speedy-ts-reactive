import * as T from "three";
import { createMaterialScene } from "../flint/material/material-scene";
import { createLighting } from "../flint/lighting";
import { OPEN_ENVIRONMENT } from "../flint/material/light-environment-config";
import { createCrystalEnvironment } from "../flint/probe/crystal-optics";
import type { SurfaceMaterial } from "../flint/material/material-registry";

/** Only application-owned panel bounds enter WebGL. Text never enters this scene. */
export function createPhosphorMaterial(
  root: HTMLElement,
  panels: HTMLElement[],
  available: (ready: boolean) => void,
) {
  const lighting = createLighting(root);
  lighting.setLight({
    azimuth: 300,
    elevation: 55,
    intensity: 0.32,
    softness: 0.8,
  });
  const registry = () => {
    const materials = new Map<SurfaceMaterial, T.MeshStandardMaterial>();
    return {
      get(name: SurfaceMaterial) {
        if (!materials.has(name))
          materials.set(
            name,
            new T.MeshPhysicalMaterial({
              color: name === "paper" ? 0x030403 : 0x080704,
              metalness: name === "paper" ? 0.08 : 0.65,
              roughness: name === "paper" ? 0.48 : 0.38,
              clearcoat: 0.28,
              clearcoatRoughness: 0.4,
              envMapIntensity: 0.055,
            }),
          );
        return materials.get(name)!;
      },
      setShadowCamera() {},
      dispose() {
        for (const m of materials.values()) m.dispose();
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
  const environment = createCrystalEnvironment(scene.renderer);
  scene.scene.environment = environment.texture;
  const bronze = new T.MeshStandardMaterial({
    color: 0x806228,
    metalness: 0.8,
    roughness: 0.28,
    emissive: 0xffad20,
    emissiveIntensity: 0.12,
  });
  const borderGeometry = new T.BoxGeometry(1, 1, 1),
    frames = panels.map(() =>
      Array.from({ length: 4 }, () => {
        const m = new T.Mesh(borderGeometry, bronze);
        scene.scene.add(m);
        return m;
      }),
    );
  const stops = panels.map((panel) => scene.registerSurface(panel, "paper"));
  const layout = () => {
    const b = root.getBoundingClientRect(),
      sx = b.width / root.clientWidth || 1,
      sy = b.height / root.clientHeight || 1;
    panels.forEach((panel, i) => {
      const r = panel.getBoundingClientRect(),
        x = (r.left - b.left) / sx,
        y = -(r.top - b.top) / sy,
        w = r.width / sx,
        h = r.height / sy;
      frames[i].forEach((m, j) => {
        m.visible = r.width > 0 && r.height > 0;
        m.position.set(
          x + (j === 0 ? 0 : j === 1 ? w : w / 2),
          y - (j === 2 ? 0 : j === 3 ? h : h / 2),
          3,
        );
        m.scale.set(j < 2 ? 1.5 : w, j < 2 ? h : 1.5, 4);
      });
    });
    scene.invalidateLayout();
  };
  const observer = new ResizeObserver(layout);
  observer.observe(root);
  panels.forEach((p) => observer.observe(p));
  root.addEventListener("scroll", layout, true);
  layout();
  return {
    layout,
    dispose() {
      observer.disconnect();
      root.removeEventListener("scroll", layout, true);
      stops.forEach((stop) => stop());
      for (const frame of frames) frame.forEach((m) => scene.scene.remove(m));
      borderGeometry.dispose();
      bronze.dispose();
      environment.dispose();
      scene.dispose();
      lighting.dispose();
    },
  };
}
