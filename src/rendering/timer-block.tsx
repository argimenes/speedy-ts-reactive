import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { unwrap } from "solid-js/store";
import type { BlockViewProps } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import { MAX_TIMER_SECONDS, readTimerPayload, type TimerPayload } from "../runtime/timer-block";
import "./timer-block.css";

const formatDuration = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

const parseDuration = (value: string) => {
  const match = value.trim().match(/^(\d{1,4}):([0-5]\d)$/);
  if (!match) return;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds >= 1 && seconds <= MAX_TIMER_SECONDS ? seconds : undefined;
};

export function TimerBlockView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const timer = createMemo(() => readTimerPayload(node()?.payload.timer));
  const [now, setNow] = createSignal(Date.now());
  const [draft, setDraft] = createSignal(formatDuration(timer().durationSeconds * 1000));
  const [message, setMessage] = createSignal("");
  const [previewSize, setPreviewSize] = createSignal<{ width: number; height: number }>();
  let root!: HTMLDivElement;
  let durationInput!: HTMLInputElement;
  let disposeMount: (() => void) | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let audio: AudioContext | undefined;
  let resize: { pointerId: number; x: number; y: number; width: number; height: number } | undefined;
  const mountedAt = Date.now();
  let deadline: number | undefined, notified: number | undefined;

  const remainingMilliseconds = createMemo(() => {
    const state = timer();
    if (state.mode === "running") return Math.max(0, Number(state.runningUntil) - now());
    if (state.mode === "paused") return Math.max(0, Number(state.remainingMilliseconds ?? state.durationSeconds * 1000));
    return state.durationSeconds * 1000;
  });
  const done = createMemo(() => timer().mode === "running" && remainingMilliseconds() <= 0);
  const size = createMemo(() => {
    const property = ((node()?.payload.blockProperties as Array<Record<string, unknown>> | undefined) ?? []).find(item => item.type === "block/size" && !item.isDeleted);
    const metadata = property?.metadata as Record<string, unknown> | undefined;
    return { width: Math.max(210, Number(metadata?.width) || 260), height: Math.max(210, Number(metadata?.height) || 260) };
  });

  const commit = (next: TimerPayload, label: string) => editor.commands.setPayloadField(props.nodeKey, "timer", next, label);
  const prepareAudio = () => {
    const Audio = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    audio ??= new Audio();
    void audio.resume();
  };
  const sound = () => {
    try {
      prepareAudio(); if (!audio) return;
      const oscillator = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime;
      oscillator.type = "sine"; oscillator.frequency.setValueAtTime(880, start);
      gain.gain.setValueAtTime(.12, start); gain.gain.exponentialRampToValueAtTime(.001, start + .22);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + .22);
    } catch { /* The visual Done state remains available when browser audio is blocked. */ }
  };
  const start = () => {
    prepareAudio();
    const state = timer(), remaining = state.mode === "paused" ? remainingMilliseconds() : state.durationSeconds * 1000;
    commit({ durationSeconds: state.durationSeconds, mode: "running", runningUntil: Date.now() + Math.max(1000, remaining) }, state.mode === "paused" ? "Resume Timer" : "Start Timer");
  };
  const pause = () => {
    const state = timer(); if (state.mode !== "running" || done()) return;
    commit({ durationSeconds: state.durationSeconds, mode: "paused", remainingMilliseconds: remainingMilliseconds() }, "Pause Timer");
  };
  const reset = () => {
    const seconds = timer().durationSeconds;
    commit({ durationSeconds: seconds, mode: "idle", remainingMilliseconds: seconds * 1000 }, "Reset Timer");
  };
  const setDuration = () => {
    const seconds = parseDuration(draft());
    if (!seconds) { setMessage("Enter a duration from 00:01 to 1440:00."); durationInput.focus(); return; }
    setMessage(""); commit({ durationSeconds: seconds, mode: "idle", remainingMilliseconds: seconds * 1000 }, "Set Timer Duration");
  };
  const remove = () => {
    const fallback = editor.focusFallback(props.nodeKey);
    editor.focus.clearRemoved(props.nodeKey); editor.commands.remove(props.nodeKey);
    if (fallback) queueMicrotask(() => editor.focus.request(fallback, { reason: "timer-done", caret: "start" }));
  };
  const finishResize = (event: PointerEvent) => {
    if (!resize || resize.pointerId !== event.pointerId) return;
    const final = previewSize() ?? size(); resize = undefined; setPreviewSize(undefined);
    const properties = unwrap((node()?.payload.blockProperties as Array<Record<string, unknown>> | undefined) ?? []);
    editor.commands.setPayloadField(props.nodeKey, "blockProperties", [...properties.filter(item => item.type !== "block/size" || item.isDeleted), { type: "block/size", metadata: { width: Math.round(final.width), height: Math.round(final.height), "min-width": 210 } }], "Resize Timer");
  };

  createEffect(() => {
    const state = timer();
    clearInterval(interval); interval = undefined; setNow(Date.now());
    if (state.mode !== "running" || Number(state.runningUntil) <= Date.now()) return;
    interval = setInterval(() => { const current = Date.now(); setNow(current); if (current >= Number(state.runningUntil)) { clearInterval(interval); interval = undefined; } }, 1000);
  });
  createEffect(() => {
    const state = timer(), currentDeadline = state.mode === "running" ? state.runningUntil : undefined;
    if (currentDeadline !== deadline) { deadline = currentDeadline; notified = currentDeadline && currentDeadline <= mountedAt ? currentDeadline : undefined; }
    if (currentDeadline && done() && notified !== currentDeadline) { notified = currentDeadline; sound(); }
  });
  createEffect(() => {
    const state = timer();
    if (document.activeElement !== durationInput) setDraft(formatDuration(state.durationSeconds * 1000));
  });
  onMount(() => {
    disposeMount = editor.mounts.register(props.nodeKey, { root, focusElement: root, inputPolicy: "opaque-widget", focus: () => root.focus({ preventScroll: true }) });
  });
  onCleanup(() => { clearInterval(interval); disposeMount?.(); void audio?.close(); });

  const dimensions = () => previewSize() ?? size();
  return <div ref={root} class="abstract-block reactive-timer" classList={{ "reactive-timer--done": done() }} tabIndex={-1}
    style={{ width: `${dimensions().width}px`, height: `${dimensions().height}px` }}
    data-block-id={String(node()?.payload.id ?? "")} data-client-id={props.nodeKey} data-runtime-key={props.nodeKey} data-block-type="timer-block">
    <header>Timer</header>
    <output class="reactive-timer__display" role="timer" aria-label={`${formatDuration(remainingMilliseconds())} remaining`}>{formatDuration(remainingMilliseconds())}</output>
    <Show when={!done()} fallback={<div class="reactive-timer__finished"><strong role="status">Time’s up</strong><button type="button" class="reactive-timer__done" onClick={remove}>Done</button></div>}>
      <div class="reactive-timer__controls">
        <Show when={timer().mode === "running"} fallback={<button type="button" onClick={start}>{timer().mode === "paused" ? "Resume" : "Start"}</button>}><button type="button" onClick={pause}>Pause</button></Show>
        <button type="button" disabled={timer().mode === "idle"} onClick={reset}>Reset</button>
      </div>
      <div class="reactive-timer__setting">
        <label for={`${props.nodeKey}-duration`}>Duration</label>
        <input ref={durationInput} id={`${props.nodeKey}-duration`} aria-label="Timer duration in minutes and seconds" inputmode="numeric" value={draft()} disabled={timer().mode === "running"}
          onInput={event => { setDraft(event.currentTarget.value); setMessage(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); setDuration(); } }} />
        <button type="button" disabled={timer().mode === "running"} onClick={setDuration}>Set</button>
      </div>
      <Show when={message()}>{text => <small role="alert">{text()}</small>}</Show>
    </Show>
    <div class="reactive-timer__resize" title="Drag to resize timer" aria-hidden="true"
      onPointerDown={event => { if (event.button !== 0) return; const current = dimensions(); resize = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, width: current.width, height: current.height }; event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault(); event.stopPropagation(); }}
      onPointerMove={event => { if (!resize || resize.pointerId !== event.pointerId) return; setPreviewSize({ width: Math.max(210, resize.width + event.clientX - resize.x), height: Math.max(210, resize.height + event.clientY - resize.y) }); }}
      onPointerUp={finishResize} onLostPointerCapture={finishResize} onPointerCancel={() => { resize = undefined; setPreviewSize(undefined); }} />
  </div>;
}
