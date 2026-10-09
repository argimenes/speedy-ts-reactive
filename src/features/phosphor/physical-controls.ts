import * as T from "three";
import { relief } from "./geometry";
import { createDiodeHalo } from "../flint/probe/crystal-optics";

type Body = {
  element: HTMLElement;
  mesh: T.Mesh;
  socket?: T.Mesh;
  kind: "key" | "field" | "check" | "range" | "housing";
  clip: HTMLElement;
  z: number;
  knob?: T.Mesh;
};
const selector =
  "button,input,select,.ph-glyph-preview,.ph-title,.ph-screen-heading,.ph-screen-foot,.ph-zoom-controls,.ph-characters,.ph-tools,.reactive-window__header";

/** Phosphor's DOM is the sole hit target. These shallow physical counterparts
 * share geometry/materials and update only on layout or control-state changes. */
export function createPhysicalControls(
  root: HTMLElement,
  sceneRoot: HTMLElement,
  scene: T.Scene,
  grain: T.Texture,
  invalidate: () => void,
) {
  const bodies = new Map<HTMLElement, Body>(),
    geometries = new Map<string, T.BufferGeometry>();
  const materials = new Map<string, T.MeshPhysicalMaterial>(),
    clips = new Map<HTMLElement, T.Plane[]>();
  const pressed = new Set<HTMLElement>();
  let frame: number | undefined,
    disposed = false;
  const geometry = (
    w: number,
    h: number,
    depth: number,
    radius: number,
    lip = 0,
  ) => {
    const key = [w, h, depth, radius, lip].map((v) => v.toFixed(2)).join(":");
    if (!geometries.has(key))
      geometries.set(key, relief(w, h, depth, radius, lip));
    return geometries.get(key)!;
  };
  const planes = (clip: HTMLElement) => {
    if (!clips.has(clip))
      clips.set(clip, [
        new T.Plane(new T.Vector3(1, 0, 0)),
        new T.Plane(new T.Vector3(-1, 0, 0)),
        new T.Plane(new T.Vector3(0, 1, 0)),
        new T.Plane(new T.Vector3(0, -1, 0)),
      ]);
    return clips.get(clip)!;
  };
  const material = (kind: string, clip: HTMLElement) => {
    const clippingPlanes = planes(clip),
      key = [...clips.keys()].indexOf(clip) + ":" + kind;
    if (!materials.has(key)) {
      const lit = kind === "lit",
        metal = kind === "housing" || kind === "rim",
        glass = kind === "glass";
      const m = new T.MeshPhysicalMaterial({
        color: lit ? 0xf3b646 : metal ? 0x21190f : glass ? 0x020302 : 0x12110c,
        metalness: lit ? 0.35 : metal ? 0.87 : glass ? 0.05 : 0.65,
        roughness: metal ? 0.42 : glass ? 0.23 : 0.29,
        roughnessMap: metal ? grain : null,
        bumpMap: metal ? grain : null,
        bumpScale: 0.12,
        clearcoat: glass ? 0.4 : 0.18,
        clearcoatRoughness: 0.22,
        envMapIntensity: glass ? 0.012 : 0.35,
        specularIntensity: glass ? 0.25 : 1,
        emissive: lit ? 0xffa323 : 0x000000,
        emissiveIntensity: lit ? 0.6 : 0,
        clippingPlanes,
        clipShadows: true,
      });
      if (kind === "disabled") {
        m.color.set(0x090a08);
        m.envMapIntensity = 0.1;
      }
      if (kind === "edge") {
        m.color.set(0x987b4e);
        m.metalness = 0.88;
        m.roughness = 0.26;
        m.envMapIntensity = 0.55;
      }
      materials.set(key, m);
    }
    return materials.get(key)!;
  };
  const makeMesh = (element: HTMLElement) => {
    const mesh = new T.Mesh(
      new T.BufferGeometry(),
      new T.MeshPhysicalMaterial(),
    );
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.phosphorElement = element;
    scene.add(mesh);
    return mesh;
  };
  const observer = new ResizeObserver(() => schedule());
  const sync = () => {
    const elements = new Set(
      [...sceneRoot.querySelectorAll<HTMLElement>(selector)].filter(
        (el) => root.contains(el) || !!el.closest(".reactive-window__header"),
      ),
    );
    for (const [el, body] of bodies)
      if (!elements.has(el)) {
        scene.remove(body.mesh);
        if (body.socket) scene.remove(body.socket);
        if (body.knob) scene.remove(body.knob);
        observer.unobserve(el);
        bodies.delete(el);
        pressed.delete(el);
      }
    for (const element of elements)
      if (!bodies.has(element)) {
        const kind = element.matches('input[type="checkbox"]')
          ? "check"
          : element.matches('input[type="range"]')
            ? "range"
            : element.matches("input,select,.ph-glyph-preview")
              ? "field"
              : element.matches("button")
                ? "key"
                : "housing";
        const clip =
          element.closest<HTMLElement>(".ph-characters,.ph-panel") ?? sceneRoot;
        const body: Body = {
          element,
          mesh: makeMesh(element),
          kind,
          clip,
          z: 0,
        };
        if (kind === "field" || kind === "check")
          body.socket = makeMesh(element);
        if (kind === "range") {
          body.knob = makeMesh(element);
          if (!geometries.has("knob"))
            geometries.set("knob", new T.SphereGeometry(6, 16, 10));
          body.knob.geometry = geometries.get("knob")!;
        }
        bodies.set(element, body);
        observer.observe(element);
      }
  };
  const setState = (body: Body) => {
    const el = body.element,
      disabled = el.matches(":disabled"),
      selected =
        el.getAttribute("aria-pressed") === "true" ||
        (el instanceof HTMLInputElement && el.checked);
    body.z =
      body.kind === "housing"
        ? 0.85
        : body.kind === "field" || body.kind === "range"
          ? 1.1
          : pressed.has(el)
            ? 0.5
            : selected
              ? 1.1
              : 2.5;
    body.mesh.position.z = body.z;
    const face = material(
      disabled
        ? "disabled"
        : selected
          ? "lit"
          : body.kind === "housing"
            ? "housing"
            : body.kind === "field" || body.kind === "check"
              ? "glass"
              : "key",
      body.clip,
    );
    body.mesh.material = [
      face,
      material(disabled ? "disabled" : selected ? "lit" : "edge", body.clip),
    ];
    if (body.socket) body.socket.material = material("rim", body.clip);
    if (body.knob)
      body.knob.material = material(disabled ? "disabled" : "lit", body.clip);
  };
  const emblem = new T.Group(),
    emblemElement = root.querySelector<HTMLElement>(".ph-emblem");
  const emblemMaterials = [
    new T.MeshPhysicalMaterial({
      color: 0x986e3b,
      metalness: 0.9,
      roughness: 0.48,
      roughnessMap: grain,
      envMapIntensity: 0.8,
    }),
    new T.MeshPhysicalMaterial({
      color: 0x958676,
      metalness: 0,
      roughness: 0.12,
      clearcoat: 1,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      envMapIntensity: 0.65,
    }),
    new T.MeshPhysicalMaterial({
      color: 0xffc475,
      emissive: 0xff950e,
      emissiveIntensity: 2,
      metalness: 0.3,
      roughness: 0.28,
    }),
  ];
  const emblemGeometries: T.BufferGeometry[] = [];
  const piece = (
    g: T.BufferGeometry,
    m: T.MeshPhysicalMaterial,
    x: number,
    y: number,
    z: number,
  ) => {
    const mesh = new T.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    emblemGeometries.push(g);
    emblem.add(mesh);
    return mesh;
  };
  piece(relief(32, 5, 4, 2), emblemMaterials[0], 0, -19, 3);
  piece(new T.CapsuleGeometry(14, 12, 5, 20), emblemMaterials[1], 0, 1, 12);
  piece(new T.TorusGeometry(9, 0.8, 6, 32), emblemMaterials[2], 0, 1, 13);
  piece(new T.CylinderGeometry(0.8, 0.8, 29, 8), emblemMaterials[2], 0, 1, 13);
  const haloMaterial = createDiodeHalo();
  haloMaterial.uniforms.colour.value.set(0xffae3b);
  haloMaterial.uniforms.strength.value = 0.5;
  const haloGeometry = new T.PlaneGeometry(40, 46),
    halo = new T.Mesh(haloGeometry, haloMaterial);
  halo.position.z = 15;
  emblem.add(halo);
  scene.add(emblem);
  if (emblemElement) observer.observe(emblemElement);

  const layout = () => {
    if (disposed) return;
    sync();
    const bounds = sceneRoot.getBoundingClientRect(),
      sx = bounds.width / sceneRoot.clientWidth || 1,
      sy = bounds.height / sceneRoot.clientHeight || 1;
    const clipBounds = new Map<
      HTMLElement,
      { left: number; right: number; top: number; bottom: number }
    >();
    for (const body of bodies.values()) planes(body.clip);
    for (const [clip, ps] of clips) {
      let b = clip.getBoundingClientRect(),
        left = Math.max(bounds.left, b.left),
        right = Math.min(bounds.right, b.right),
        top = Math.max(bounds.top, b.top),
        bottom = Math.min(bounds.bottom, b.bottom);
      const panel = clip.parentElement?.closest(".ph-panel");
      if (panel) {
        b = panel.getBoundingClientRect();
        left = Math.max(left, b.left);
        right = Math.min(right, b.right);
        top = Math.max(top, b.top);
        bottom = Math.min(bottom, b.bottom);
      }
      clipBounds.set(clip, { left, right, top, bottom });
      ps[0].constant = -(left - bounds.left) / sx;
      ps[1].constant = (right - bounds.left) / sx;
      ps[2].constant = (bottom - bounds.top) / sy;
      ps[3].constant = -(top - bounds.top) / sy;
    }
    for (const body of bodies.values()) {
      const { element: el, mesh, kind, socket, knob } = body,
        r = el.getBoundingClientRect(),
        clip = clipBounds.get(body.clip)!;
      mesh.visible =
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > clip.top &&
        r.top < clip.bottom &&
        r.right > clip.left &&
        r.left < clip.right;
      if (socket) socket.visible = mesh.visible;
      if (knob) knob.visible = mesh.visible;
      if (!mesh.visible) continue;
      const w = r.width / sx,
        h = r.height / sy,
        x = (r.left - bounds.left) / sx + w / 2,
        y = -((r.top - bounds.top) / sy + h / 2);
      setState(body);
      mesh.geometry = geometry(
        Math.max(2, w - 2),
        kind === "range" ? 3 : Math.max(2, h - 2),
        kind === "housing"
          ? 1.2
          : kind === "field"
            ? 0.6
            : kind === "check"
              ? 2
              : 4,
        kind === "housing" ? 4 : 3,
      );
      mesh.position.set(x, y, body.z);
      if (socket) {
        socket.geometry = geometry(w, h, 1.6, 3, 1.2);
        socket.position.set(x, y, 0.9);
      }
      if (knob) {
        const input = el as HTMLInputElement,
          ratio =
            (Number(input.value) - Number(input.min)) /
            (Number(input.max) - Number(input.min));
        knob.position.set(x - w / 2 + 8 + (w - 16) * ratio, y, 5);
      }
    }
    if (emblemElement) {
      const r = emblemElement.getBoundingClientRect();
      emblem.visible = !!r.width;
      emblem.position.set(
        (r.left + r.width / 2 - bounds.left) / sx,
        -(r.top + r.height / 2 - bounds.top) / sy,
        1,
      );
    }
    const used = new Set<T.BufferGeometry>();
    for (const body of bodies.values()) {
      used.add(body.mesh.geometry);
      if (body.socket) used.add(body.socket.geometry);
      if (body.knob) used.add(body.knob.geometry);
    }
    for (const [key, g] of geometries)
      if (!used.has(g)) {
        g.dispose();
        geometries.delete(key);
      }
    invalidate();
  };
  function schedule() {
    if (!disposed && frame === undefined)
      frame = requestAnimationFrame(() => {
        frame = undefined;
        layout();
      });
  }
  const mutations = new MutationObserver((records) => {
    if (
      records.some(
        (r) =>
          !(r.target instanceof Element) ||
          !r.target.closest(".ph-cell-surface,.ph-ruler-track,canvas"),
      )
    )
      schedule();
  });
  mutations.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-pressed", "disabled", "hidden"],
  });
  const press = (event: Event) => {
    if (event instanceof PointerEvent && event.button !== 0) return;
    if (event instanceof KeyboardEvent && ![" ", "Enter"].includes(event.key))
      return;
    const el =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('button,input[type="checkbox"]')
        : null;
    const body = el && bodies.get(el);
    if (body && !el!.matches(":disabled")) {
      pressed.add(el!);
      setState(body);
      invalidate();
    }
  };
  const release = () => {
    if (!pressed.size) return;
    for (const el of pressed) {
      pressed.delete(el);
      const body = bodies.get(el);
      if (body) setState(body);
    }
    invalidate();
  };
  const controlChange = (event: Event) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement
    )
      schedule();
  };
  sceneRoot.addEventListener("pointerdown", press, true);
  sceneRoot.addEventListener("keydown", press, true);
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  window.addEventListener("keyup", release);
  window.addEventListener("blur", release);
  sceneRoot.addEventListener("input", controlChange);
  sceneRoot.addEventListener("change", controlChange);
  sceneRoot.addEventListener("scroll", schedule, true);
  observer.observe(sceneRoot);
  layout();
  return {
    layout,
    bodies,
    dispose() {
      disposed = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      sceneRoot.removeEventListener("pointerdown", press, true);
      sceneRoot.removeEventListener("keydown", press, true);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", release);
      sceneRoot.removeEventListener("input", controlChange);
      sceneRoot.removeEventListener("change", controlChange);
      sceneRoot.removeEventListener("scroll", schedule, true);
      for (const body of bodies.values()) {
        scene.remove(body.mesh);
        if (body.socket) scene.remove(body.socket);
        if (body.knob) scene.remove(body.knob);
      }
      scene.remove(emblem);
      emblemGeometries.forEach((g) => g.dispose());
      emblemMaterials.forEach((m) => m.dispose());
      haloGeometry.dispose();
      haloMaterial.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      bodies.clear();
    },
  };
}
