import * as T from 'three';
import limestoneURL from '../assets/limestone-albedo.png';
import marbleURL from '../assets/marble-albedo.png';
export type SurfaceMaterial = 'limestone' | 'marble' | 'paper' | 'parchment' | 'chalk';
export const MATERIAL_PALETTE: Record<SurfaceMaterial, { color: number; roughness: number; bump: number; grain: number }> = {
  limestone: { color: 0xf0efea, roughness: .94, bump: .36, grain: .24 },
  marble: { color: 0xf7f4ed, roughness: .76, bump: .14, grain: .32 },
  paper: { color: 0xf8f7f2, roughness: 1, bump: .1, grain: .075 },
  parchment: { color: 0xf6ecd7, roughness: .97, bump: .18, grain: .13 },
  chalk: { color: 0xf5f3ec, roughness: 1, bump: .25, grain: .16 },
};
export function createMaterialRegistry(invalidate: () => void, ambientGain = 1) {
  let disposed = false;
  const textures: T.Texture[] = [], materials = new Map<SurfaceMaterial, T.MeshStandardMaterial>();
  const maps = [limestoneURL, marbleURL].map(url => {
    const albedo = new T.TextureLoader().load(url, () => { if (!disposed) { bump.needsUpdate = true; invalidate(); } });
    albedo.colorSpace = T.SRGBColorSpace; albedo.wrapS = albedo.wrapT = T.RepeatWrapping;
    const bump = albedo.clone(); bump.colorSpace = T.NoColorSpace;
    textures.push(albedo, bump); return { albedo, bump };
  });
  return {
    get(name: SurfaceMaterial) {
      if (!materials.has(name)) {
        const spec = MATERIAL_PALETTE[name], map = maps[name === 'marble' ? 1 : 0];
        const material = new T.MeshStandardMaterial({ color: spec.color, roughness: spec.roughness, map: map.albedo, bumpMap: map.bump, bumpScale: spec.bump });
        material.onBeforeCompile = shader => {
          shader.uniforms.flintGrain = { value: spec.grain };
          shader.fragmentShader = 'uniform float flintGrain;\n' + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', T.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;', 'diffuseColor *= vec4(mix(vec3(1.0), sampledDiffuseColor.rgb, flintGrain), sampledDiffuseColor.a);'));
          shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= ${ambientGain.toFixed(4)};`);
          // Broad architectural penumbrae need more samples than the default
          // five-tap PCF. Keep this local to receiving surfaces: Graph carvings
          // retain their fine contact/self shadows. Geometry still causes shade.
          const shadowChunk = T.ShaderChunk.shadowmap_pars_fragment
            .replace('float radius = shadowRadius * texelSize.x;', 'float radius = shadowRadius * 8.0 / 2048.0;')
            .replace(/shadow = \(\s*texture\( shadowMap,[\s\S]*?\) \* 0\.2;/, `shadow = 0.0;
              for (int i = 0; i < 32; i++) {
                shadow += texture(shadowMap, vec3(shadowCoord.xy + vogelDiskSample(i, 32, phi) * radius, shadowCoord.z));
              }
              shadow /= 32.0;`);
          shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', shadowChunk);
        };
        material.customProgramCacheKey = () => 'flint-substrate-' + name + '-' + ambientGain;
        materials.set(name, material);
      }
      return materials.get(name)!;
    },
    dispose() { disposed = true; textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); materials.clear(); },
  };
}
