import * as T from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createMaterialScene } from "../flint/material/material-scene";
import { createLighting } from "../flint/lighting";
import { lightVector } from "../flint/material-response";
import { OPEN_ENVIRONMENT } from "../flint/material/light-environment-config";
import type { SurfaceMaterial } from "../flint/material/material-registry";
import { createBronzeGrain } from "./bronze";
import { relief, slab, GLASS_DEPTH, PANEL_BASE, PANEL_FACE } from "./geometry";
import { createPhysicalControls } from "./physical-controls";
import { createNixieEmblem, type NixieRegion } from "./nixie";
import { createStudioDrift, PHOSPHOR_STUDIO_LIGHT } from "./studio-drift";

const presentations = new WeakMap<
  HTMLElement,
  ReturnType<typeof createPhosphorMaterial>
>();
export const phosphorMaterial = (root: HTMLElement) => presentations.get(root);
let areaLightReady = false;

/** DOM remains the spatial/input authority. The scene renders on invalidation;
 * studio motion invalidates lighting, and the Nixie redraws only its neighbourhood. */
export function createPhosphorMaterial(
  root: HTMLElement,
  elements: {
    display: HTMLElement;
    workspace: HTMLElement;
    panels: HTMLElement[];
  },
  available: (ready: boolean) => void,
  nixie = true,
  studioDrift = true,
) {
  const sceneRoot = root.closest<HTMLElement>(".reactive-window") ?? root;
  const lighting = createLighting(root);
  let drift: ReturnType<typeof createStudioDrift> | undefined;
  lighting.setLight(PHOSPHOR_STUDIO_LIGHT);
  const grain = createBronzeGrain();
  let reflectionEnvironment: T.Texture | null = null;
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
          materials.set(
            name,
            new T.MeshPhysicalMaterial({
              // Solid dark chassis behind the slabs. Transmission only samples
              // WebGL geometry; neither the photograph nor live DOM is in it.
              color: 0x0b0d10,
              metalness: 0.2,
              roughness: 0.78,
              roughnessMap: grain,
              bumpMap: grain,
              bumpScale: 0.06,
              envMap: reflectionEnvironment,
              envMapIntensity: 0.12,
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
    // Preserve the main canvas only when local Nixie updates are enabled.
    // Other Flint callers retain the ordinary, non-preserved drawing buffer.
    scene = createMaterialScene(
      sceneRoot,
      lighting,
      available,
      registry,
      nixie,
      () => drift?.light ?? lighting.light,
    );
    scene.renderer.domElement.classList.add("ph-material-canvas");
  } catch (error) {
    grain.dispose();
    lighting.dispose();
    throw error;
  }
  scene.setEnvironment(OPEN_ENVIRONMENT);
  // Neutral illumination preserves charcoal glass. Bronze supplies its own
  // restrained warmth; amber belongs to emission and the local Nixie light.
  scene.scene.traverse((object) => {
    if (object instanceof T.DirectionalLight) {
      object.color.set(0xf3f5f8);
      object.shadow.bias = -0.000015;
      object.shadow.normalBias = 0.06;
    }
    if (object instanceof T.HemisphereLight) {
      object.color.set(0xc2c8d2);
      object.groundColor.set(0x24262a);
      object.intensity = 0.22;
    }
  });
  scene.renderer.shadowMap.enabled = true;
  scene.renderer.localClippingEnabled = true;
  // Baked once for reflections only; the room is never added to the UI scene.
  const studio = new RoomEnvironment(),
    generator = new T.PMREMGenerator(scene.renderer);
  studio.traverse((object) => {
    if (object instanceof T.PointLight) object.intensity *= 0.3;
    if (object instanceof T.Mesh) {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => {
        if (material instanceof T.MeshStandardMaterial)
          material.color.set(0x303437);
        if (material instanceof T.MeshLambertMaterial)
          material.emissiveIntensity *= 0.35;
      });
    }
  });
  const environment = generator.fromScene(studio, 0.035);
  studio.dispose();
  generator.dispose();
  scene.renderer.transmissionResolutionScale = 0.5;
  scene.scene.environment = reflectionEnvironment = environment.texture;
  // An explicit map preserves each material's reflection strength. Three.js
  // otherwise substitutes scene.environmentIntensity for envMapIntensity.
  scene.scene.traverse((object) => {
    if (
      object instanceof T.Mesh &&
      object.material instanceof T.MeshPhysicalMaterial
    )
      object.material.envMap = reflectionEnvironment;
  });
  if (!areaLightReady) {
    RectAreaLightUniformsLib.init();
    areaLightReady = true;
  }
  const key = new T.RectAreaLight(0xf3f5f8);
  key.name = "Phosphor broad key";
  scene.scene.add(key);
  const updateKey = () => {
    const width = sceneRoot.clientWidth,
      height = sceneRoot.clientHeight,
      span = Math.max(width, height),
      light = drift?.light ?? lighting.light,
      v = lightVector(light);
    key.width = span * (0.35 + light.softness * 0.6);
    key.height = span * (0.2 + light.softness * 0.35);
    key.intensity = light.intensity * 0.85;
    key.position.set(
      width / 2 + v.x * span * 0.35,
      -height / 2 - v.y * span * 0.35,
      v.z * span * 0.35,
    );
    // Keep the broad opening parallel to the display. Tilting a nearby large
    // emitter through the UI plane causes a hard back-face lighting cutoff.
    key.rotation.set(0, 0, 0);
  };
  // The shared directional source still casts shadows; the area source gives
  // metal/glass a broad specular response using the same direction/softness.
  const stopKey = lighting.subscribe(updateKey);
  const metal = new T.MeshPhysicalMaterial({
    color: 0x37352f,
    metalness: 0.88,
    roughness: 0.5,
    roughnessMap: grain,
    bumpMap: grain,
    bumpScale: 0.13,
    anisotropy: 0.75,
    anisotropyRotation: 0,
    clearcoat: 0.08,
    clearcoatRoughness: 0.32,
    envMap: reflectionEnvironment,
    envMapIntensity: 0.48,
  });
  const innerMetal = metal.clone();
  innerMetal.color.set(0x36342f);
  innerMetal.roughness = 0.5;
  innerMetal.clippingPlanes = glassClip;
  const edge = metal.clone();
  edge.color.set(0x686156);
  edge.roughness = 0.32;
  edge.envMapIntensity = 0.65;
  edge.bumpScale = 0.045;
  const innerEdge = edge.clone();
  innerEdge.clippingPlanes = glassClip;
  const glass = new T.MeshPhysicalMaterial({
    color: 0x080a0d,
    metalness: 0,
    roughness: 0.24,
    clearcoat: 0.35,
    clearcoatRoughness: 0.2,
    envMap: reflectionEnvironment,
    envMapIntensity: 0.5,
    ior: 1.5,
    transmission: 0.18,
    thickness: GLASS_DEPTH,
    attenuationColor: new T.Color(0x858b94),
    attenuationDistance: 12,
    opacity: 1,
  });
  const glassEdge = glass.clone();
  glassEdge.color.set(0x2b3038);
  glassEdge.roughness = 0.13;
  glassEdge.clearcoatRoughness = 0.1;
  glassEdge.envMapIntensity = 0.65;
  glassEdge.transmission = 0.5;
  glassEdge.thickness = 6;
  const screenGlass = glass.clone(),
    screenEdge = glassEdge.clone();
  screenGlass.color.set(0x030406);
  screenGlass.envMapIntensity = 0.08;
  screenGlass.clearcoat = 0.12;
  screenGlass.clippingPlanes = screenEdge.clippingPlanes = glassClip;
  screenGlass.clipShadows = screenEdge.clipShadows = true;
  // A shadow receiver on the flat glass face preserves shallow contact under
  // keys when the unshadowed area-light reflection dominates its dark diffuse
  // component. This samples the real directional shadow map, not a baked AO.
  const contactMaterial = new T.ShadowMaterial({
    opacity: 0.32,
    depthWrite: false,
  });
  const screenContact = contactMaterial.clone();
  screenContact.clippingPlanes = glassClip;
  const targets = [
    {
      element: sceneRoot,
      lip: 8,
      depth: 12,
      radius: 14,
      material: metal,
      z: 1,
    },
    {
      element: elements.display,
      lip: 10,
      depth: 9,
      radius: 18,
      material: innerMetal,
      z: PANEL_FACE - 4,
    },
    ...elements.panels.map((element) => ({
      element,
      lip: 3.5,
      depth: 8,
      radius: 8,
      material: metal,
      z: PANEL_FACE - 7,
    })),
  ];
  const frames = targets.map((t) => {
    const mesh = new T.Mesh(new T.BufferGeometry(), [
      t.material,
      t.material === innerMetal ? innerEdge : edge,
    ]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.phosphorElement = t.element;
    scene.scene.add(mesh);
    const glassBody =
      t.element === sceneRoot
        ? null
        : new T.Mesh(
            new T.BufferGeometry(),
            t.element === elements.display
              ? [screenGlass, screenEdge]
              : [glass, glassEdge],
          );
    if (glassBody) {
      glassBody.castShadow = glassBody.receiveShadow = true;
      glassBody.userData.phosphorElement = t.element;
      glassBody.name = "Phosphor 25 mm glass slab";
      scene.scene.add(glassBody);
    }
    const contact = glassBody
      ? new T.Mesh(
          new T.BufferGeometry(),
          t.element === elements.display ? screenContact : contactMaterial,
        )
      : null;
    if (contact) {
      contact.name = "Phosphor glass contact shadows";
      contact.receiveShadow = true;
      scene.scene.add(contact);
    }
    return { mesh, glassBody, contact, width: 0, height: 0, scale: 0 };
  });
  const layout = () => {
    updateKey();
    const b = sceneRoot.getBoundingClientRect(),
      sx = b.width / sceneRoot.clientWidth || 1,
      sy = b.height / sceneRoot.clientHeight || 1;
    const bay = elements.workspace.getBoundingClientRect();
    glassClip[0].constant = -(bay.left - b.left) / sx;
    glassClip[1].constant = (bay.right - b.left) / sx;
    glassClip[2].constant = (bay.bottom - b.top) / sy;
    glassClip[3].constant = -(bay.top - b.top) / sy;
    const zoom = Number(root.style.getPropertyValue("--screen-zoom")) || 1;
    targets.forEach((target, i) => {
      const r = target.element.getBoundingClientRect(),
        inset = i === 0 ? 3 : i === 1 ? -10 * zoom : -3.5,
        w = r.width / sx - inset * 2,
        h = r.height / sy - inset * 2,
        frame = frames[i],
        scale = i === 1 ? zoom : 1;
      frame.mesh.visible = w > 20 && h > 20;
      if (frame.glassBody) frame.glassBody.visible = frame.mesh.visible;
      if (frame.contact) frame.contact.visible = frame.mesh.visible;
      if (!frame.mesh.visible) return;
      if (frame.width !== w || frame.height !== h || frame.scale !== scale) {
        frame.mesh.geometry.dispose();
        frame.mesh.geometry = relief(
          w,
          h,
          target.depth * scale,
          target.radius * scale,
          target.lip * scale,
        );
        if (frame.glassBody) {
          frame.glassBody.geometry.dispose();
          frame.glassBody.geometry = slab(
            r.width / sx,
            r.height / sy,
            GLASS_DEPTH * scale,
            7 * scale,
          );
        }
        if (frame.contact) {
          frame.contact.geometry.dispose();
          frame.contact.geometry = new T.PlaneGeometry(
            Math.max(1, r.width / sx - 14 * scale),
            Math.max(1, r.height / sy - 14 * scale),
          );
        }
        frame.width = w;
        frame.height = h;
        frame.scale = scale;
      }
      frame.mesh.position.set(
        (r.left - b.left) / sx + inset + w / 2,
        -((r.top - b.top) / sy + inset + h / 2),
        target.z * scale,
      );
      if (frame.glassBody) {
        frame.glassBody.position.copy(frame.mesh.position);
        frame.glassBody.position.z = PANEL_BASE * scale;
      }
      if (frame.contact) {
        frame.contact.position.copy(frame.mesh.position);
        frame.contact.position.z = PANEL_FACE * scale + 0.05;
      }
    });
    scene.invalidateLayout();
  };
  const controls = createPhysicalControls(
    root,
    sceneRoot,
    scene.scene,
    grain,
    scene.invalidateLayout,
  );
  let cachedFrame = -1,
    cachedRegion = "";
  let excluded: T.Object3D[] = [];
  const box = new T.Box3(),
    fullSize = new T.Vector2();
  const renderNixieRegion = (region: NixieRegion) => {
    if (!scene.metrics.frames || scene.renderer.domElement.hidden) return;
    const { renderer, camera } = scene;
    renderer.getSize(fullSize);
    const width = fullSize.x,
      height = fullSize.y,
      pixelWidth = renderer.domElement.width,
      pixelHeight = renderer.domElement.height,
      px = pixelWidth / width,
      py = pixelHeight / height,
      left = Math.max(0, Math.floor(region.x * px)),
      top = Math.max(0, Math.floor(region.y * py)),
      right = Math.min(pixelWidth, Math.ceil((region.x + region.width) * px)),
      bottom = Math.min(pixelHeight, Math.ceil((region.y + region.height) * py));
    if (right <= left || bottom <= top) return;
    const key = [left, top, right, bottom].join(":");
    // Rebuild this list only after an ordinary scene/layout render. Animated
    // frames perform no DOM traversal, measurements or geometry regeneration.
    if (cachedFrame !== scene.metrics.frames || cachedRegion !== key) {
      excluded = [];
      scene.scene.updateMatrixWorld(true);
      scene.scene.traverse((object) => {
        if (
          !object.visible ||
          !(object instanceof T.Mesh || object instanceof T.LineSegments)
        )
          return;
        if (!object.geometry.getAttribute("position")) return;
        box.setFromObject(object);
        if (
          box.max.x < left / px ||
          box.min.x > right / px ||
          box.max.y < -bottom / py ||
          box.min.y > -top / py
        )
          excluded.push(object);
      });
      cachedFrame = scene.metrics.frames;
      cachedRegion = key;
    }
    excluded.forEach((object) => {
      object.visible = false;
    });
    const transmissionScale = renderer.transmissionResolutionScale;
    // A cropped view/viewport also bounds Three's transmission buffer. A
    // scissor alone would still render the full-window transmission target.
    // Use the exact drawing-buffer pixel grid. At fractional DPR, snapping in
    // CSS pixels shifts bevels by half a pixel where the two renders meet.
    camera.setViewOffset(
      pixelWidth, pixelHeight, left, top, right - left, bottom - top,
    );
    // Bias by a tiny fraction of a pixel so Three's floor/round conversions
    // agree even when division by a fractional DPR introduces floating error.
    const logical = (pixels: number) =>
      (pixels + 0.00001) / renderer.getPixelRatio();
    renderer.setViewport(
      logical(left), logical(pixelHeight - bottom),
      logical(right - left), logical(bottom - top),
    );
    renderer.setScissor(
      logical(left), logical(pixelHeight - bottom),
      logical(right - left), logical(bottom - top),
    );
    renderer.setScissorTest(true);
    // The small enclosure needs a crisp electrode through its curved glass.
    // Full-resolution transmission here covers only this bounded patch.
    renderer.transmissionResolutionScale = 1;
    try {
      renderer.render(scene.scene, camera);
    } finally {
      renderer.transmissionResolutionScale = transmissionScale;
      camera.clearViewOffset();
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      excluded.forEach((object) => {
        object.visible = true;
      });
    }
  };
  const emblem = nixie
    ? createNixieEmblem(
        root,
        sceneRoot,
        scene.renderer.domElement,
        scene.scene,
        lighting,
        grain,
        renderNixieRegion,
      )
    : undefined;
  if (studioDrift)
    drift = createStudioDrift(sceneRoot, scene.renderer.domElement, lighting, () => {
      updateKey();
      scene.requestRender();
    });
  const observer = new ResizeObserver(() => {
    layout();
    controls.layout();
    emblem?.layout();
  });
  targets.forEach((t) => observer.observe(t.element));
  observer.observe(elements.workspace);
  root.addEventListener("scroll", layout, true);
  layout();
  const presentation = {
    layout,
    lighting,
    scene: scene.scene,
    metrics: scene.metrics,
    controls,
    emblem,
    drift,
    dispose() {
      presentations.delete(root);
      drift?.dispose();
      emblem?.dispose();
      controls.dispose();
      stopKey();
      scene.scene.remove(key);
      observer.disconnect();
      root.removeEventListener("scroll", layout, true);
      frames.forEach(({ mesh, glassBody, contact }) => {
        scene.scene.remove(mesh);
        mesh.geometry.dispose();
        if (glassBody) {
          scene.scene.remove(glassBody);
          glassBody.geometry.dispose();
        }
        if (contact) {
          scene.scene.remove(contact);
          contact.geometry.dispose();
        }
      });
      metal.dispose();
      innerMetal.dispose();
      edge.dispose();
      innerEdge.dispose();
      [glass, glassEdge, screenGlass, screenEdge].forEach((m) => m.dispose());
      contactMaterial.dispose();
      screenContact.dispose();
      grain.dispose();
      environment.dispose();
      scene.dispose();
      lighting.dispose();
    },
  };
  presentations.set(root, presentation);
  return presentation;
}
