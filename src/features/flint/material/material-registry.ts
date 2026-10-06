import * as T from 'three';
import { createStoneDetail } from './stone-detail';
import limestoneURL from '../assets/limestone-fine-albedo.png';
import marbleURL from '../assets/marble-albedo.png';
export type SurfaceMaterial = 'limestone' | 'marble' | 'paper' | 'parchment' | 'chalk';
export const MATERIAL_PALETTE: Record<SurfaceMaterial, { color: number; roughness: number; bump: number; grain: number }> = {
  limestone: { color: 0xe9e5db, roughness: .96, bump: .22, grain: .62 },
  marble: { color: 0xeeeae2, roughness: .74, bump: .1, grain: .4 },
  paper: { color: 0xf7f4ec, roughness: 1, bump: .045, grain: .075 },
  parchment: { color: 0xf6ecd7, roughness: .97, bump: .18, grain: .13 },
  chalk: { color: 0xf5f3ec, roughness: 1, bump: .25, grain: .16 },
};
export function createMaterialRegistry(invalidate: () => void, environmentResponse = 1) {
  let disposed = false;
  const detail = createStoneDetail();
  const shadowDepthScale = { value: 2 };
  const textures: T.Texture[] = [], materials = new Map<SurfaceMaterial, T.MeshStandardMaterial>();
  const maps = [limestoneURL, marbleURL].map(url => {
    const albedo = new T.TextureLoader().load(url, () => { if (!disposed) invalidate(); });
    albedo.colorSpace = T.SRGBColorSpace; albedo.wrapS = albedo.wrapT = T.RepeatWrapping;
    textures.push(albedo); return { albedo };
  });
  return {
    setShadowCamera(camera: T.OrthographicCamera) { shadowDepthScale.value = (camera.far - camera.near) / (camera.right - camera.left); },
    get(name: SurfaceMaterial) {
      if (!materials.has(name)) {
        const spec = MATERIAL_PALETTE[name], map = maps[name === 'marble' ? 1 : 0];
        const micro = detail.get(name === 'marble' ? 'marble-pale' : name === 'chalk' ? 'chalk-stone' : 'limestone-fine');
        const material = new T.MeshStandardMaterial({ color: spec.color, roughness: spec.roughness, map: map.albedo, bumpMap: micro.height, bumpScale: spec.bump, roughnessMap: micro.roughness });
        material.onBeforeCompile = shader => {
          shader.uniforms.flintGrain = { value: spec.grain };
          shader.uniforms.flintShadowDepthScale = shadowDepthScale;
          shader.fragmentShader = 'uniform float flintGrain;\nuniform float flintShadowDepthScale;\n' + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', T.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;', 'diffuseColor *= vec4(mix(vec3(1.0), sampledDiffuseColor.rgb, flintGrain), sampledDiffuseColor.a);'));
          // Contact-hardening PCF: estimate blocker distance using the existing
          // hardware comparison map. Distant architecture gets a wider penumbra;
          // nearby carvings retain tight cast shadows. No screen-space wash.
          const chunk = T.ShaderChunk.shadowmap_pars_fragment;
          const start = chunk.indexOf('float getShadow( sampler2DShadow');
          const end = chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )', start);
          const pcss = `float getShadow(sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord) {
            shadowCoord.xyz /= shadowCoord.w;
            shadowCoord.z += shadowBias;
            if (any(lessThan(shadowCoord.xy, vec2(0.0))) || any(greaterThan(shadowCoord.xyz, vec3(1.0)))) return 1.0;
            float phi = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * PI2;
            float blockers = 0.0, separation = 0.0;
            for (int i = 0; i < 12; i++) {
              vec2 uv = shadowCoord.xy + (i == 0 ? vec2(0.0) : vogelDiskSample(i - 1, 11, phi) * .012);
              if (texture(shadowMap, vec3(uv, shadowCoord.z)) < .5) {
                float lo = shadowCoord.z - .16, hi = shadowCoord.z;
                for (int j = 0; j < 7; j++) {
                  float mid = (lo + hi) * .5;
                  if (texture(shadowMap, vec3(uv, mid)) > .5) lo = mid; else hi = mid;
                }
                separation += max(0.0, shadowCoord.z - (lo + hi) * .5); blockers += 1.0;
              }
            }
            if (blockers == 0.0) return 1.0;
            float radius = clamp(separation / blockers * flintShadowDepthScale * (.025 + shadowRadius * .035), .65 / shadowMapSize.x, .024);
            float shadow = 0.0;
            for (int i = 0; i < 48; i++) shadow += texture(shadowMap, vec3(shadowCoord.xy + vogelDiskSample(i, 48, phi) * radius, shadowCoord.z));
            return mix(1.0, shadow / 48.0, shadowIntensity);
          }
          `;
          const shadowChunk = (chunk.slice(0, start) + pcss + chunk.slice(end))
            .replaceAll('shadowIntensity)', `shadowIntensity * ${((name === 'paper' ? .38 : 1) * environmentResponse).toFixed(3)})`);
          shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', shadowChunk);
        };
        material.customProgramCacheKey = () => 'flint-substrate-' + name + '-' + environmentResponse;
        materials.set(name, material);
      }
      return materials.get(name)!;
    },
    dispose() { disposed = true; detail.dispose(); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); materials.clear(); },
  };
}
