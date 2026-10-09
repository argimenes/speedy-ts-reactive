import * as T from "three";
import { relief, slab, PANEL_FACE } from "./geometry";

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
  "button,input,select,.ph-glyph-preview,.ph-title,.ph-screen-heading,.ph-screen-foot,.ph-zoom-controls,.reactive-window__header";

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
      geometries.set(
        key,
        lip ? relief(w, h, depth, radius, lip) : slab(w, h, depth, radius),
      );
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
        metal = kind === "housing" || kind === "rim" || kind === "key",
        glass = kind === "glass";
      const m = new T.MeshPhysicalMaterial({
        color: lit
          ? 0xf3b646
          : kind === "housing"
            ? 0x292a2c
            : metal
              ? 0x35332e
              : glass
                ? 0x080a0e
                : 0x17191c,
        metalness: lit ? 0.35 : metal ? 0.87 : glass ? 0.05 : 0.65,
        roughness: metal ? 0.5 : glass ? 0.2 : 0.29,
        roughnessMap: metal ? grain : null,
        bumpMap: metal ? grain : null,
        bumpScale: 0.13,
        anisotropy: metal ? 0.75 : 0,
        anisotropyRotation: 0,
        clearcoat: glass ? 1 : 0.08,
        clearcoatRoughness: glass ? 0.12 : 0.3,
        envMap: scene.environment,
        envMapIntensity: glass ? 0.6 : 0.48,
        specularIntensity: 1,
        ior: 1.48,
        transmission: 0,
        opacity: 1,
        emissive: lit ? 0xffa323 : 0x000000,
        emissiveIntensity: lit ? 0.6 : 0,
        clippingPlanes,
        clipShadows: true,
      });
      if (kind === "disabled") {
        m.color.set(0x090b0e);
        m.envMapIntensity = 0.1;
      }
      if (kind === "edge") {
        m.color.set(0x686156);
        m.metalness = 0.88;
        m.roughness = 0.32;
        m.envMapIntensity = 0.65;
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
  const support = (body: Body) => {
    if (body.kind === "housing")
      return body.element.matches(".ph-zoom-controls") ? 10 : 2;
    if (body.element.closest(".ph-panel")) return PANEL_FACE;
    if (body.element.closest(".ph-zoom-controls")) return 18;
    if (body.element.closest(".reactive-window__header")) return 10;
    return 0;
  };
  const setState = (body: Body) => {
    const el = body.element,
      disabled = el.matches(":disabled"),
      selected =
        el.getAttribute("aria-pressed") === "true" ||
        (el instanceof HTMLInputElement && el.checked);
    body.z =
      support(body) +
      (body.kind === "housing"
        ? 0
        : body.kind === "field" || body.kind === "range"
          ? 0.6
          : pressed.has(el)
            ? 0.8
            : selected
              ? 1.6
              : 3.2);
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
          ? 8
          : kind === "field"
            ? 3
            : kind === "check"
              ? 3
              : kind === "range"
                ? 2
                : 6,
        kind === "housing" ? 4 : 2.2,
      );
      mesh.position.set(x, y, body.z);
      if (socket) {
        socket.geometry = geometry(w, h, 3, 3, 1.2);
        socket.position.set(x, y, support(body) + 0.3);
      }
      if (knob) {
        const input = el as HTMLInputElement,
          ratio =
            (Number(input.value) - Number(input.min)) /
            (Number(input.max) - Number(input.min));
        knob.position.set(
          x - w / 2 + 8 + (w - 16) * ratio,
          y,
          support(body) + 5,
        );
      }
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
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      bodies.clear();
    },
  };
}
