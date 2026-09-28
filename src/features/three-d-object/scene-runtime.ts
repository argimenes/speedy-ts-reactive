import * as T from "three";
import type { ObjectState, ViewAngles } from "./model";
import type { ObjectContent } from "./content";
import { fitCamera } from "./camera";

export interface SceneStatus { frames: number; geometries: number; contact: { x: number; y: number; rx: number; ry: number }; }
export function createObjectScene(canvas: HTMLCanvasElement, initial: ObjectState, content: ObjectContent, status: (status: SceneStatus) => void, fail: (message: string) => void) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(32, 1, .05, 100);
  scene.add(content.root);
  const fill = new T.HemisphereLight(0xf4f7ff, 0x8d8173, 2.0), key = new T.DirectionalLight(0xfff9ef, 3.2), rim = new T.DirectionalLight(0xdce9ff, 1.7);
  key.position.set(-3, 5, 4); rim.position.set(3, 3, -3); scene.add(fill, key, rim);
  let state = initial, view = { ...initial.view }, visible = false, motion = true, paused = false, dead = false, lost = false;
  let width = 1, height = 1, frame = 0, frames = 0, last = 0, seconds = 0;
  function lights() {
    key.color.set(state.lighting === "warm" ? 0xffdcaa : 0xfff9ef);
    fill.intensity = state.lighting === "dramatic" ? .9 : 2;
    key.intensity = state.lighting === "dramatic" ? 4.2 : 3.2;
    rim.intensity = state.lighting === "warm" ? 1.1 : 1.7;
    content.apply(state.settings);
  }
  function request() { if (!dead && !lost && visible && !document.hidden && !frame) frame = requestAnimationFrame(render); }
  function render(now: number) {
    frame = 0; if (dead || lost || !visible || document.hidden) return;
    const delta = last ? Math.min(.05, Math.max(0, (now - last) / 1000)) : 0; last = now;
    if (motion && !paused) { seconds += delta; if (state.autoRotate) view.azimuth = (view.azimuth + delta * 6) % 360; }
    fitCamera(camera, content.bounds, view); content.update(seconds, T.MathUtils.degToRad(view.azimuth));
    renderer.render(scene, camera); frames++;
    const base = content.contact.clone().project(camera);
    // Local ground contact treatment; deliberately not part of Document annotation geometry.
    const distance = camera.position.distanceTo(content.contact), radius = .58 / (2 * distance * Math.tan(T.MathUtils.degToRad(camera.fov / 2))) * height;
    status({ frames, geometries: renderer.info.memory.geometries, contact: { x: (base.x + 1) * width / 2, y: (1 - base.y) * height / 2, rx: radius, ry: Math.max(3, radius * Math.sin(T.MathUtils.degToRad(view.elevation))) } });
    if (motion && !paused && (state.autoRotate || content.animated())) request();
  }
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; fail("Graphics paused. Retry to restore this object."); };
  canvas.addEventListener("webglcontextlost", contextLost);
  lights();
  return {
    update(next: ObjectState) {
      if (next.view.azimuth !== state.view.azimuth || next.view.elevation !== state.view.elevation) view = { ...next.view };
      state = next; lights(); request();
    },
    view(next?: ViewAngles) { if (next) { view = { ...next }; request(); } return { ...view }; },
    size(w: number, h: number) { if (w <= 0 || h <= 0) return; width = w; height = h; camera.aspect = w / h; renderer.setSize(w, h, false); request(); },
    activity(show: boolean, reduced: boolean, pause: boolean) { visible = show; motion = !reduced; paused = pause; if (!show || document.hidden) { cancelAnimationFrame(frame); frame = 0; last = 0; } else request(); },
    fit: request,
    dispose() { if (dead) return; dead = true; cancelAnimationFrame(frame); canvas.removeEventListener("webglcontextlost", contextLost); content.dispose(); scene.clear(); renderer.dispose(); if (!lost) renderer.forceContextLoss(); },
  };
}
export type ObjectScene = ReturnType<typeof createObjectScene>;
