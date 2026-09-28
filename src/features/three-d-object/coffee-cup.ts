import * as T from "three";
import type { ObjectContent } from "./content";

export function coffeeCup(): ObjectContent {
  const root = new T.Group();
  const ceramic = new T.MeshStandardMaterial({ color: 0xfaf9f5, roughness: .24, metalness: 0 });
  const profile = [ [0, .04], [.46, .04], [.53, .055], [.56, .09], [.575, .17], [.61, 1.19], [.615, 1.31], [.607, 1.35], [.584, 1.37], [.56, 1.35], [.551, 1.31], [.546, 1.2], [.51, .19], [.47, .15], [0, .15] ];
  const body = new T.Mesh(new T.LatheGeometry(profile.map(([x,y]) => new T.Vector2(x,y)), 80), ceramic); root.add(body);
  const path = new T.CatmullRomCurve3([
    new T.Vector3(.585, 1.12, 0), new T.Vector3(.94, 1.16, 0), new T.Vector3(1.12, .97, 0),
    new T.Vector3(1.1, .6, 0), new T.Vector3(.86, .35, 0), new T.Vector3(.57, .38, 0),
  ]);
  root.add(new T.Mesh(new T.TubeGeometry(path, 56, .085, 16, false), ceramic));
  const coffee = new T.Mesh(new T.CircleGeometry(.545, 80), new T.MeshStandardMaterial({ color: 0x180d07, roughness: .2, metalness: .08 }));
  coffee.rotation.x = -Math.PI / 2; coffee.position.y = 1.235; root.add(coffee);
  const steam = new T.Group(); steam.position.y = 1.25; root.add(steam);
  const ribbons: T.Mesh<T.PlaneGeometry, T.ShaderMaterial>[] = [];
  for (let i = 0; i < 3; i++) {
    const geometry = new T.PlaneGeometry(.16, .87, 1, 28); geometry.translate(0, .435, 0);
    const material = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide,
      uniforms: { clock: { value: 0 }, phase: { value: i * 2.1 } },
      vertexShader: `varying vec2 vUv; uniform float clock; uniform float phase;
        void main(){ vUv=uv; vec3 p=position; p.x+=sin(uv.y*7.0-clock*.7+phase)*.065*uv.y;
          p.z+=cos(uv.y*5.0-clock*.5+phase)*.025*uv.y;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float clock; uniform float phase;
        void main(){ float edge=pow(sin(vUv.x*3.14159265),2.0);
          float fade=sin(vUv.y*3.14159265); float drift=.7+.3*sin(vUv.y*9.0-clock+phase);
          gl_FragColor=vec4(.67,.68,.69,edge*fade*fade*drift*.18); }`,
    });
    const mesh = new T.Mesh(geometry, material); mesh.position.set((i-1)*.18, i === 1 ? .02 : 0, (i-1)*.08); steam.add(mesh); ribbons.push(mesh);
  }
  let enabled = true;
  return {
    root, bounds: new T.Box3(new T.Vector3(-.67, 0, -.67), new T.Vector3(1.23, 2.18, .67)), contact: new T.Vector3(0, .035, 0),
    apply(settings) { enabled = settings.steam !== false; steam.visible = enabled; }, animated: () => enabled,
    update(seconds, azimuth) { for (const ribbon of ribbons) { ribbon.material.uniforms.clock.value = seconds; ribbon.rotation.y = azimuth; } },
    dispose() {
      const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>();
      root.traverse(node => { if (node instanceof T.Mesh) { geometries.add(node.geometry); for (const m of Array.isArray(node.material) ? node.material : [node.material]) materials.add(m); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.clear();
    },
  };
}
