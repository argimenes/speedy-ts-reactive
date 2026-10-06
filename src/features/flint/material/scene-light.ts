import * as T from 'three';
import { lightVector, type Light } from '../material-response';

/** Shared with the Graph: CSS y-down becomes scene y-up. */
export function applyFlintLight(sun: T.DirectionalLight, light: Light, centre: T.Vector2, distance = 1400) {
  const v = lightVector(light);
  sun.position.set(centre.x + v.x * distance, centre.y - v.y * distance, v.z * distance);
  sun.target.position.set(centre.x, centre.y, 0);
  sun.intensity = light.intensity * 3;
  sun.shadow.radius = .6 + light.softness * 4;
}

export function configureMaterialRenderer(renderer: T.WebGLRenderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
}
