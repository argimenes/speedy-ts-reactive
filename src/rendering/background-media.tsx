import { Match, Show, Switch, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { defaultBackgroundUrls, mediaUrl, youtubeBackgroundUrl, type BackgroundType } from "./backgrounds";

function GradientBackground() {
  let canvas!: HTMLCanvasElement;
  let disposed = false;
  let shader: { dispose(): void; setSpeed(speed: number): void } | undefined;
  const [fallback, setFallback] = createSignal(false);
  onMount(() => {
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const visibility = () => shader?.setSpeed(document.hidden || motion?.matches ? 0 : 0.25);
    motion?.addEventListener("change", visibility);
    document.addEventListener("visibilitychange", visibility);
    const lost = (event: Event) => { event.preventDefault(); shader?.dispose(); shader = undefined; setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    void import("@paper-design/shaders").then(({ ShaderMount, getShaderColorFromString, meshGradientFragmentShader }) => {
      if (disposed) return;
      try {
        if (!canvas.getContext("webgl2")) { setFallback(true); return; }
        shader = new ShaderMount(canvas, meshGradientFragmentShader, {
          u_color1: getShaderColorFromString("#283BFC"), u_color2: getShaderColorFromString("#FF2828"),
          u_color3: getShaderColorFromString("#dddddd"), u_color4: getShaderColorFromString("#800080"),
        }, undefined, document.hidden || motion?.matches ? 0 : 0.25);
      } catch { setFallback(true); }
    }).catch(() => { if (!disposed) setFallback(true); });
    onCleanup(() => {
      disposed = true; shader?.dispose();
      motion?.removeEventListener("change", visibility);
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("webglcontextlost", lost);
    });
  });
  return <div class="reactive-background__gradient" data-static-fallback={fallback()}><canvas ref={canvas} aria-hidden="true" /><Show when={fallback()}><span class="reactive-background__notice" role="status">WebGL unavailable — showing a static gradient.</span></Show></div>;
}

function VideoBackground(props: { url: string; paused: boolean; muted: boolean; onError: (message: string) => void }) {
  let video!: HTMLVideoElement;
  let alive = true;
  let attempt = 0;
  createEffect(() => {
    props.url;
    const current = ++attempt;
    video.muted = props.muted;
    if (props.paused) video.pause();
    else video.play()?.catch(() => { if (alive && attempt === current) props.onError("Playback was blocked. Use the background menu to play muted or choose another source."); });
  });
  onCleanup(() => { alive = false; video.pause(); video.removeAttribute("src"); video.load(); });
  return <video ref={video} src={props.url} autoplay={!props.paused} muted={props.muted} loop playsinline preload="auto" tabIndex={-1} aria-hidden="true" onError={() => props.onError("The background video could not load. Check its URL or choose another source.")} />;
}

function YouTubeBackground(props: { url: string }) {
  let iframe!: HTMLIFrameElement;
  onCleanup(() => { iframe.src = "about:blank"; });
  return <div class="reactive-background__youtube"><iframe ref={iframe} src={props.url} title="YouTube background" tabIndex={-1} aria-hidden="true" allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" /></div>;
}

export function BackgroundMedia(props: { type: string; metadata?: Record<string, unknown> }) {
  const source = () => props.metadata?.url ?? defaultBackgroundUrls[props.type as BackgroundType];
  const url = () => mediaUrl(source());
  const paused = () => props.metadata?.paused === true;
  const muted = () => props.metadata?.muted !== false;
  const youtube = () => youtubeBackgroundUrl(source(), paused(), muted());
  const [error, setError] = createSignal("");
  createEffect(() => { source(); props.type; paused(); muted(); setError(""); });
  return <div class="reactive-background" data-background-type={props.type}>
    <Switch>
      <Match when={props.type === "image-background-block"}>
        <Show when={url()} fallback={<span class="reactive-background__notice" role="status">Enter a valid image URL in the background menu.</span>}>
          <img src={url()} alt="" draggable={false} onError={() => setError("The background image could not load. Check its URL or choose another image.")} />
        </Show>
      </Match>
      <Match when={props.type === "video-background-block"}>
        <Show when={url()} fallback={<span class="reactive-background__notice" role="status">Enter a valid video URL in the background menu.</span>}>
          <VideoBackground url={url()!} paused={paused()} muted={muted()} onError={setError} />
        </Show>
      </Match>
      <Match when={props.type === "youtube-video-background-block"}>
        <Show when={youtube()} fallback={<span class="reactive-background__notice" role="status">Enter a valid YouTube URL or video ID in the background menu.</span>}><YouTubeBackground url={youtube()!} /></Show>
      </Match>
      <Match when={props.type === "canvas-background-block"}><GradientBackground /></Match>
    </Switch>
    <Show when={error()}><span class="reactive-background__notice" role="status">{error()}</span></Show>
  </div>;
}
