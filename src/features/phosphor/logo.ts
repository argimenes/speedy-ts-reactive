import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createLogoViewport} from '../app-logo/viewport';
import {createLighting} from '../flint/lighting';
import {lightVector} from '../flint/material-response';
import {createBronzeGrain} from './bronze';
import {createNixieEmblem} from './nixie';
import {createStudioDrift, PHOSPHOR_STUDIO_LIGHT} from './studio-drift';

const presentations = new WeakMap<HTMLElement, ReturnType<typeof createPhosphorLogo>>();
export const phosphorLogo = (root: HTMLElement) => presentations.get(root);

/** Reuses the Nixie sculpture and its hover/discharge, in a logo-sized scene. */
export function createPhosphorLogo(root: HTMLElement, host: HTMLElement, available: (ready: boolean) => void, studioDrift = true) {
  let illuminate = () => {};
  const viewport = createLogoViewport(host, available, () => illuminate());
  const cleanup: (() => void)[] = [() => viewport.dispose()];
  const dispose = () => { cleanup.splice(0).reverse().forEach(stop => stop()); presentations.delete(root); };
  try {
    const lighting = createLighting(host);
    cleanup.push(() => lighting.dispose());
    lighting.setLight(PHOSPHOR_STUDIO_LIGHT);
    const grain = createBronzeGrain();
    cleanup.push(() => grain.dispose());
    const studio = new RoomEnvironment(), generator = new T.PMREMGenerator(viewport.renderer);
    // Preserve the original dark studio reflections on the bronze and glass.
    studio.traverse(object => {
      if (object instanceof T.PointLight) object.intensity *= .3;
      if (object instanceof T.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof T.MeshStandardMaterial) material.color.set(0x303437);
        if (material instanceof T.MeshLambertMaterial) material.emissiveIntensity *= .35;
      }
    });
    let environment: T.WebGLRenderTarget;
    try { environment = generator.fromScene(studio, .035); }
    finally { studio.dispose(); generator.dispose(); }
    cleanup.push(() => environment.dispose());
    viewport.scene.environment = environment.texture;
    viewport.renderer.transmissionResolutionScale = .5;
    const ambient = new T.HemisphereLight(0xc2c8d2, 0x24262a, .3);
    const key = new T.DirectionalLight(0xf3f5f8);
    viewport.scene.add(ambient, key, key.target);
    let drift: ReturnType<typeof createStudioDrift> | undefined;
    illuminate = () => {
      const light = drift?.light ?? lighting.light, v = lightVector(light);
      const x = viewport.camera.right / 2, y = viewport.camera.bottom / 2;
      key.position.set(x + v.x * 250, y - v.y * 250, v.z * 250);
      key.target.position.set(x, y, 0);
      key.intensity = light.intensity * 2.5;
      viewport.invalidate();
    };
    const emblem = createNixieEmblem(root, host, viewport.renderer.domElement, viewport.scene, lighting, grain, viewport.invalidate);
    cleanup.push(() => emblem.dispose());
    if (studioDrift) {
      drift = createStudioDrift(host, viewport.renderer.domElement, lighting, illuminate);
      cleanup.push(() => drift?.dispose());
    }
    const stop = lighting.subscribe(illuminate);
    cleanup.push(stop);
    const result = {lighting, drift, emblem, metrics:viewport.metrics, dispose};
    presentations.set(root, result);
    return result;
  } catch (error) { dispose(); throw error; }
}
