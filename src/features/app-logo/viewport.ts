import * as T from 'three';

const metricsByHost = new WeakMap<HTMLElement, {frames: number; resizes: number}>();
export const logoMetrics = (host: HTMLElement) => metricsByHost.get(host);

/** A canvas contained by one HTML logo. Only its own size affects the camera;
 * scrolling, moving windows and the layout of surrounding controls do not. */
export function createLogoViewport(host: HTMLElement, available: (ready: boolean) => void, layout?: (width: number, height: number) => void) {
  const renderer = new T.WebGLRenderer({alpha: true, antialias: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.className = 'application-logo-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {position:'absolute', inset:'0', width:'100%', height:'100%', pointerEvents:'none'});
  host.append(canvas);
  const scene = new T.Scene(), camera = new T.OrthographicCamera(0, 1, 0, -1, .1, 1000);
  camera.position.z = 400;
  const metrics = {frames: 0, resizes: 0};
  metricsByHost.set(host, metrics);
  let disposed = false, lost = false, visible = true, dirty = true, frame: number | undefined;
  let width = 0, height = 0;
  const draw = () => {
    frame = undefined;
    if (disposed || lost || !visible || document.hidden || !width || !height) return;
    renderer.render(scene, camera);
    dirty = false;
    metrics.frames++;
    available(true);
  };
  const invalidate = () => {
    dirty = true;
    if (!disposed && !lost && visible && !document.hidden && frame === undefined) frame = requestAnimationFrame(draw);
  };
  const resize = () => {
    if (disposed || lost) return;
    width = host.clientWidth; height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.right = width; camera.bottom = -height; camera.updateProjectionMatrix();
    layout?.(width, height);
    metrics.resizes++;
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && dirty) invalidate();
  });
  intersection.observe(host);
  const visibility = () => { if (!document.hidden && dirty) invalidate(); };
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; canvas.hidden = true; available(false); };
  const contextRestored = () => { lost = false; canvas.hidden = false; resize(); };
  document.addEventListener('visibilitychange', visibility);
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  // ResizeObserver supplies the initial dimensions before the first paint.
  return {renderer, scene, camera, metrics, invalidate, dispose() {
    disposed = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
    observer.disconnect(); intersection.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    canvas.removeEventListener('webglcontextlost', contextLost);
    canvas.removeEventListener('webglcontextrestored', contextRestored);
    renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); metricsByHost.delete(host); available(false);
  }};
}
