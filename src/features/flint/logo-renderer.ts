import * as T from 'three';
import {createLogoViewport} from '../app-logo/viewport';
import {createSculpture} from './graph/three/sculpture';
import {createLighting, type Lighting} from './lighting';
import {applyFlintLight, createFlintAmbient, FLINT_SUN_COLOR} from './material/scene-light';

export function createFlintLogo(host: HTMLElement, available: (ready: boolean) => void, shared?: Lighting) {
  const viewport = createLogoViewport(host, available, (width, height) => {
    mask.position.set(width / 2, -height / 2, 0);
    const scale = Math.min(width / 86, height / 104);
    mask.scale.set(scale, scale, scale * .82);
    applyFlintLight(sun, lighting.light, new T.Vector2(width / 2, -height / 2));
  });
  const lighting = shared ?? createLighting(host);
  const material = new T.MeshStandardMaterial({color:0xe4dbc7, roughness:.83});
  const mask = createSculpture('mask', material), sun = new T.DirectionalLight(FLINT_SUN_COLOR);
  viewport.scene.add(mask, sun, sun.target, createFlintAmbient());
  const stop = lighting.subscribe(() => {
    applyFlintLight(sun, lighting.light, new T.Vector2(viewport.camera.right / 2, viewport.camera.bottom / 2));
    viewport.invalidate();
  });
  return {metrics:viewport.metrics, dispose() {
    stop(); if (!shared) lighting.dispose();
    mask.traverse(object => { if (object instanceof T.Mesh) object.geometry.dispose(); });
    material.dispose(); viewport.dispose();
  }};
}
