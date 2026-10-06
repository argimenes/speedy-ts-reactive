import * as T from 'three';
import { CYCLADIC_APERTURE, type LightEnvironment } from './light-environment-config';
export { CYCLADIC_APERTURE, OPEN_ENVIRONMENT, type LightEnvironment, type Occluder } from './light-environment-config';

export function createOcclusionRig(scene: T.Scene) {
  const group = new T.Group(); group.name = 'Flint unseen architecture'; scene.add(group);
  const geometry = new T.BoxGeometry(1, 1, 1);
  // A broken architectural opening rather than another parallel bar.
  const outline = new T.Shape();
  outline.moveTo(-.5,-.5); outline.lineTo(.5,-.5); outline.lineTo(.5,.5); outline.lineTo(-.5,.5); outline.closePath();
  const opening = new T.Path();
  opening.moveTo(-.28,-.38); opening.lineTo(-.26,.36); opening.lineTo(.29,.28); opening.lineTo(.35,-.32); opening.closePath();
  outline.holes.push(opening);
  const aperture = new T.ExtrudeGeometry(outline, { depth: 1, bevelEnabled: false }); aperture.translate(0,0,-.5);
  // Visible to the shadow pass, invisible to the picture plane. Do not use
  // object.visible=false or camera layers: Three's shadow pass checks both.
  const material = new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  let environment = CYCLADIC_APERTURE;
  function layout(width: number, height: number, x = 0, y = 0, unit = 1) {
    group.clear(); group.visible = environment.enabled;
    const depthUnit = Math.min(width, height);
    for (const spec of environment.occluders) {
      const mesh = new T.Mesh(spec.type === 'aperture' ? aperture : geometry, material);
      mesh.position.set(x + spec.position[0] * width, y - spec.position[1] * height, spec.height * depthUnit);
      mesh.scale.set(spec.scale[0] * width, spec.scale[1] * height, spec.depth * depthUnit);
      mesh.rotation.z = spec.rotation * Math.PI / 180;
      mesh.castShadow = spec.castsShadow !== false;
      group.add(mesh);
    }
    group.scale.setScalar(unit);
  }
  return {
    group, layout,
    setEnvironment(value: LightEnvironment) { environment = value; },
    get environment() { return environment; },
    dispose() { scene.remove(group); geometry.dispose(); aperture.dispose(); material.dispose(); group.clear(); },
  };
}
