import * as T from "three";
import type { Lighting } from "../flint/lighting";
import { createDiodeHalo } from "../flint/probe/crystal-optics";
import { slab } from "./geometry";

export type NixieRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** One small object in the existing scene. Spatial emission and its nearby
 * point light animate through the shared scheduler at 50 ms intervals. */
export function createNixieEmblem(
  root: HTMLElement,
  sceneRoot: HTMLElement,
  canvas: HTMLCanvasElement,
  scene: T.Scene,
  lighting: Lighting,
  grain: T.Texture,
  renderLocal: (region: NixieRegion) => void,
) {
  const element = root.querySelector<HTMLElement>(".ph-emblem")!;
  const group = new T.Group();
  group.name = "Phosphor Nixie Phi";
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>();
  const bronze = new T.MeshPhysicalMaterial({
    color: 0x36332d,
    metalness: 0.9,
    roughness: 0.42,
    roughnessMap: grain,
    bumpMap: grain,
    bumpScale: 0.1,
    anisotropy: 0.6,
    anisotropyRotation: 0,
    envMap: scene.environment,
    envMapIntensity: 0.8,
  });
  const glass = new T.MeshPhysicalMaterial({
    color: 0xf2f5f8,
    metalness: 0,
    roughness: 0.035,
    transmission: 0.98,
    thickness: 0.45,
    ior: 1.46,
    attenuationColor: new T.Color(0xc3c9d1),
    attenuationDistance: 45,
    clearcoat: 0.35,
    clearcoatRoughness: 0.09,
    envMap: scene.environment,
    envMapIntensity: 0.75,
    depthWrite: false,
  });
  const phase = { value: 0 };
  const electrode = new T.MeshPhysicalMaterial({
    // Gas emission supplies the colour. A dark unlit substrate prevents the
    // nearby lamp from washing out spatial variation in the discharge.
    color: 0x120c06,
    emissive: 0xff8e18,
    emissiveIntensity: 1.1,
    metalness: 0.25,
    roughness: 0.28,
    envMap: scene.environment,
    envMapIntensity: 0.3,
  });
  electrode.onBeforeCompile = (shader) => {
    shader.uniforms.nixiePhase = phase;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float dischargePath;\nvarying float vDischargePath;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvDischargePath = dischargePath;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float nixiePhase;\nvarying float vDischargePath;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        // Overlapping, broad gas-density regions: no singular travelling dot.
        float cloud = 0.5 + 0.5 * sin(vDischargePath * 2.0 - nixiePhase * 0.83
          + 0.55 * sin(vDischargePath * 3.0 + nixiePhase * 0.27));
        float veil = 0.5 + 0.5 * cos(vDischargePath * 3.0 + nixiePhase * 0.41
          + 0.35 * sin(nixiePhase * 0.73));
        float gas = smoothstep(0.18, 0.88, cloud * 0.65 + veil * 0.35);
        totalEmissiveRadiance *= 0.6 + 1.3 * gas;`,
      );
  };
  electrode.customProgramCacheKey = () => "phosphor-phi-discharge-v2";
  const piece = (
    geometry: T.BufferGeometry,
    material: T.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    geometries.add(geometry);
    materials.add(material);
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = material !== glass;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  piece(slab(40, 7, 13, 2), bronze, 0, -23, 0);
  piece(slab(35, 2.5, 11, 1), bronze, 0, -18.5, 1);
  // A flattened lathed enclosure has a shoulder, closed dome and genuine
  // curved normals, while remaining shallow enough for the bas-relief header.
  const profile = [
    [0, -20],
    [16, -20],
    [17, -18],
    [17, 14],
    [16.6, 18],
    [15, 21],
    [12, 23],
    [7, 24.5],
    [3, 25],
    [1.3, 27.5],
    [0, 28],
  ].map(([r, y]) => new T.Vector2(r, y));
  const enclosure = piece(new T.LatheGeometry(profile, 40), glass, 0, 0, 8);
  enclosure.scale.z = 0.45;
  enclosure.name = "Phi smoked glass enclosure";
  const ringGeometry = new T.TorusGeometry(10, 0.65, 8, 64),
    stemGeometry = new T.CylinderGeometry(0.65, 0.65, 33, 10, 24);
  for (const [geometry, ring] of [
    [ringGeometry, true],
    [stemGeometry, false],
  ] as const) {
    const uv = geometry.getAttribute("uv"),
      paths = new Float32Array(uv.count);
    for (let i = 0; i < paths.length; i++)
      paths[i] = ring
        ? uv.getX(i) * Math.PI * 2
        : uv.getY(i) * Math.PI * 1.8 + 0.4;
    geometry.setAttribute("dischargePath", new T.BufferAttribute(paths, 1));
    piece(geometry, electrode, 0, 1, 11).name = ring
      ? "Phi electrode ring"
      : "Phi electrode stem";
  }
  // A dark cathode backing separates the clear envelope from the warm mount.
  const backing = new T.MeshStandardMaterial({
    color: 0x11161c, metalness: 0.25, roughness: 0.62,
    envMap: scene.environment, envMapIntensity: 0.4,
  });
  piece(slab(25, 37, 0.5, 2), backing, 0, 0, 3).name = "Phi cathode backing";
  const support = new T.MeshStandardMaterial({
    color: 0x626871, metalness: 0.75, roughness: 0.4,
    envMap: scene.environment, envMapIntensity: 0.6,
  });
  for (const x of [-12, 12])
    piece(new T.CylinderGeometry(0.45, 0.45, 36, 8), support, x, 0, 6);
  const ceramic = new T.MeshStandardMaterial({ color: 0xa6aaa9, roughness: 0.55 });
  const bead = new T.SphereGeometry(1.3, 12, 8);
  for (const y of [-16.5, 18.5]) piece(bead, ceramic, 0, y, 9);
  const wires: number[] = [];
  for (let x = -12; x <= 12; x += 3) wires.push(x, -17, 5, x, 18, 5);
  for (let y = -17; y <= 18; y += 3) wires.push(-12, y, 5, 12, y, 5);
  const meshGeometry = new T.BufferGeometry();
  meshGeometry.setAttribute("position", new T.Float32BufferAttribute(wires, 3));
  const meshMaterial = new T.LineBasicMaterial({
    color: 0x626b73,
    transparent: true,
    opacity: 0.32,
  });
  geometries.add(meshGeometry);
  materials.add(meshMaterial);
  group.add(new T.LineSegments(meshGeometry, meshMaterial));
  const haloMaterial = createDiodeHalo();
  haloMaterial.uniforms.colour.value.set(0xffac39);
  haloMaterial.uniforms.strength.value = 0.14;
  const halo = piece(new T.PlaneGeometry(43, 50), haloMaterial, 0, 1, 18);
  halo.castShadow = halo.receiveShadow = false;
  const light = new T.PointLight(0xffa02e, 4200, 120, 2);
  light.name = "Phi local amber illumination";
  light.position.set(3, -9, 21);
  light.castShadow = false;
  group.add(light);
  scene.add(group);

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const metrics = { frames: 0, elapsed: 0, active: false };
  let disposed = false,
    inView = false,
    hostHidden = false,
    lost = false,
    lastTick = 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    needsStatic = true,
    region: NixieRegion | undefined;
  const stop = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    lastTick = 0;
    metrics.active = false;
  };
  const wake = () => {
    stop();
    needsStatic = true;
    lighting.request();
  };
  const layout = () => {
    const bounds = sceneRoot.getBoundingClientRect(),
      r = element.getBoundingClientRect(),
      sx = bounds.width / sceneRoot.clientWidth || 1,
      sy = bounds.height / sceneRoot.clientHeight || 1;
    group.position.set(
      (r.left + r.width / 2 - bounds.left) / sx,
      -(r.top + r.height / 2 - bounds.top) / sy,
      11,
    );
    group.scale.setScalar(r.width / sx / 48);
    group.visible = r.width > 0 && r.height > 0;
    // This covers the light's entire finite reach, including both old and new
    // highlights. The rest of the application framebuffer stays untouched.
    const radius = light.distance + 24;
    region = {
      x: group.position.x - radius,
      y: -group.position.y - radius,
      width: radius * 2,
      height: radius * 2,
    };
    wake();
  };
  const visibility = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    wake();
  });
  visibility.observe(element);
  // IntersectionObserver alone does not detect visibility:hidden, and app
  // display rules can override the browser's default [hidden] styling.
  // Check ancestors only when their presentation changes, never per frame.
  const ancestors: HTMLElement[] = [];
  for (let node: HTMLElement | null = element; node; node = node.parentElement)
    ancestors.push(node);
  const checkHostVisibility = () => {
    const hidden = ancestors.some((node) => {
      const style = getComputedStyle(node);
      return (
        node.hidden ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse"
      );
    });
    if (hostHidden !== hidden) {
      hostHidden = hidden;
      wake();
    }
  };
  const hostVisibility = new MutationObserver(checkHostVisibility);
  ancestors.forEach((node) =>
    hostVisibility.observe(node, {
      attributes: true,
      attributeFilter: ["hidden", "class", "style"],
    }),
  );
  checkHostVisibility();
  const resize = new ResizeObserver(layout);
  resize.observe(element);
  resize.observe(sceneRoot);
  const contextLost = () => {
    lost = true;
    stop();
  };
  const contextRestored = () => {
    lost = false;
    wake();
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  document.addEventListener("visibilitychange", wake);
  motion.addEventListener("change", wake);
  const stopEffects = lighting.subscribe(wake);
  const stopTask = lighting.addTask((now) => {
    if (
      disposed ||
      lost ||
      document.hidden ||
      hostHidden ||
      !inView ||
      !group.visible ||
      canvas.hidden ||
      !element.isConnected ||
      lighting.effects.reducedEffects
    ) {
      stop();
      return;
    }
    const animated = !motion.matches && !lighting.effects.reducedMotion;
    if (!animated && !needsStatic) return;
    if (animated && lastTick)
      metrics.elapsed += (now - lastTick) / 1000;
    lastTick = now;
    const t = animated ? metrics.elapsed : 0;
    phase.value =
      (t * Math.PI * 2) / 11.8 +
      0.24 * Math.sin(t * 0.29) +
      0.1 * Math.sin(t * 0.61);
    light.intensity =
      4200 *
      (0.96 +
        0.06 * Math.sin(phase.value + 0.35) +
        0.025 * Math.sin(phase.value * 1.73));
    light.position.x = 3 + Math.cos(phase.value) * 1.2;
    light.position.y = -9 + Math.sin(phase.value * 0.83) * 1.2;
    haloMaterial.uniforms.strength.value = 0.14 + 0.015 * Math.sin(phase.value);
    if (region) {
      renderLocal(region);
      metrics.frames++;
    }
    needsStatic = false;
    metrics.active = animated;
    if (animated) {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        lighting.request();
      }, 50);
    } else stop();
  });
  layout();
  return {
    group,
    light,
    phase,
    metrics,
    layout,
    get region() {
      return region;
    },
    dispose() {
      disposed = true;
      stop();
      stopTask();
      stopEffects();
      visibility.disconnect();
      hostVisibility.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", wake);
      motion.removeEventListener("change", wake);
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      scene.remove(group);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      light.dispose();
    },
  };
}
