import { For, onCleanup, onMount } from "solid-js";
import type { ExistingBlockDto } from "../block-tree/types";
import { ReactiveEditor } from "../reactive-editor/editor";
import { ReactiveViewProvider } from "../reactive-editor/context";
import { BlockOutlet } from "../rendering/block-outlet";
import { registerCoreViews } from "../rendering/register-core-views";
import "./standoff-effects-demo.css";

type EffectCard = {
  id: string;
  name: string;
  description: string;
  properties: Array<Record<string, unknown>>;
  text?: string;
};

const sample = "The quick brown fox jumps over the lazy dog while Codex keeps ordinary text editing accurate across wrapped lines.";
const amberWord = "A single CODEX word retains a bright, legible phosphor core.";
const amberFragment = "The amber terminal wakes quietly beside the ordinary prose.";
const amberEditing = "Edit this glowing phrase directly; the caret and selection remain native.";
const amberAdjacent = "Amber terminal output sits beside softened archival text in the same editable line.";
const range = (type: string, text: string, phrase: string, extra: Record<string, unknown> = {}) => ({
  type,
  start: text.indexOf(phrase),
  end: text.indexOf(phrase) + phrase.length - 1,
  ...extra,
});

const effects: EffectCard[] = [
  { id: "amber-word", name: "Amber CRT — short word", description: "A sharp yellow core, tight amber bloom, diffuse orange halo, scanlines and faint grain.", text: amberWord, properties: [range("amber-crt", amberWord, "CODEX")] },
  { id: "amber-fragment", name: "Amber CRT — sentence fragment", description: "Phosphor emission applied to a phrase rather than painted orange text.", text: amberFragment, properties: [range("amber-crt", amberFragment, "amber terminal wakes")] },
  { id: "amber-wrapped", name: "Amber CRT — wrapped range", description: "Every visual line fragment receives the same clipped scanline and grain treatment.", properties: [{ type: "amber-crt" }] },
  { id: "amber-editing", name: "Amber CRT — live editing", description: "This card receives initial focus. Type inside the glowing range to exercise ordinary editing and geometry updates.", text: amberEditing, properties: [range("amber-crt", amberEditing, "this glowing phrase")] },
  { id: "amber-adjacent", name: "Amber CRT + adjacent blur", description: "Two independent visual properties share one editable line without replacing its text DOM.", text: amberAdjacent, properties: [range("amber-crt", amberAdjacent, "Amber terminal output"), range("style/blur", amberAdjacent, "softened archival text", { amount: 2 })] },
  { id: "blur", name: "Blur", description: "Backdrop blur, 3px.", properties: [{ type: "style/blur", amount: 3 }] },
  { id: "glow", name: "Glow / bloom", description: "Sharp text with a restrained phosphor halo.", properties: [{ type: "style/glow", radius: 3, intensity: .38 }] },
  { id: "chromatic", name: "Chromatic aberration", description: "Red/cyan text-shadow separation without moving glyph geometry.", properties: [{ type: "style/chromatic-aberration", offset: 1.5, intensity: .4, direction: "horizontal" }] },
  { id: "motion", name: "Directional blur", description: "Isotropic backdrop fallback: CSS cannot perform directional Gaussian backdrop blur.", properties: [{ type: "style/motion-blur", x: 6, y: 0 }] },
  { id: "ghost", name: "Ghost / echo", description: "A faint displaced and softened text echo.", properties: [{ type: "style/ghost", offsetX: 3, offsetY: 1, blur: 1.5, opacity: .28 }] },
  { id: "grayscale", name: "Grayscale", description: "Partial desaturation of otherwise purple source text.", properties: [{ type: "text/colour", value: "#7947c6" }, { type: "style/grayscale", amount: .8 }] },
  { id: "sepia", name: "Sepia", description: "Aged local colour treatment.", properties: [{ type: "style/sepia", amount: .85 }] },
  { id: "invert", name: "Invert", description: "Full pixel inversion within the measured range.", properties: [{ type: "style/invert", amount: 1 }] },
  { id: "contrast", name: "Contrast / brightness", description: "Local contrast and brightness adjustment.", properties: [{ type: "style/contrast-brightness", contrast: 1.5, brightness: 1.08 }] },
  { id: "grain", name: "Grain / noise", description: "High-frequency SVG turbulence blended over the text.", properties: [{ type: "style/grain", frequency: .75, octaves: 2, opacity: .2, seed: 2 }] },
  { id: "ink", name: "Ink bleed", description: "Dark text halos plus a very light irregular grain.", properties: [{ type: "style/ink-bleed", spread: 1, intensity: .28, roughness: .4 }] },
  { id: "turbulence", name: "Turbulence / disturbance", description: "Subtle low-frequency surface texture; glyph positions are not displaced.", properties: [{ type: "style/turbulence", frequency: .025, octaves: 2, opacity: .2, seed: 4 }] },
  { id: "blur-sepia", name: "Blur + sepia", description: "Two independent backdrop layers over the same range.", properties: [{ type: "style/blur", amount: 2 }, { type: "style/sepia", amount: .75 }] },
  { id: "glow-rgb", name: "Glow + RGB separation", description: "Composable text-shadow effects retain the sharp original.", properties: [{ type: "style/glow", radius: 3, intensity: .32 }, { type: "style/chromatic-aberration", offset: 1.25, intensity: .35, direction: "horizontal" }] },
  { id: "grain-sepia", name: "Grain + sepia", description: "SVG texture above a backdrop colour effect.", properties: [{ type: "style/grain", frequency: .7, octaves: 2, opacity: .16, seed: 9 }, { type: "style/sepia", amount: .7 }] },
  { id: "ink-grain", name: "Ink bleed + grain", description: "Text halo and texture combined.", properties: [{ type: "style/ink-bleed", spread: 1, intensity: .25, roughness: .35 }, { type: "style/grain", frequency: .8, octaves: 2, opacity: .08, seed: 12 }] },
];

const rangeStart = sample.indexOf("brown");
const rangeEnd = sample.indexOf("wrapped") + "wrapped".length - 1;

function demoDocument(): ExistingBlockDto {
  return {
    id: "standoff-effects-demo",
    type: "document-block",
    children: effects.map(effect => ({
      id: `effect-${effect.id}`,
      type: "standoff-editor-block",
      text: effect.text ?? sample,
      standoffProperties: effect.properties.map((property, index) => ({
        id: `${effect.id}-${index}`,
        start: rangeStart,
        end: rangeEnd,
        ...property,
      })),
      children: [],
    })),
  };
}

export function StandoffEffectsDemo() {
  const editor = new ReactiveEditor(demoDocument());
  registerCoreViews(editor);
  const projection = editor.createView("standoff-effects-demo");
  let disposeGateway: (() => void) | undefined;
  let page!: HTMLElement;
  onMount(() => {
    disposeGateway = editor.installGateway(document);
    queueMicrotask(() => {
      const flow = page.querySelector<HTMLElement>('[data-effect-card="amber-editing"] .reactive-standoff-flow');
      const cell = flow?.children[amberEditing.indexOf("glowing")];
      const text = cell?.firstChild;
      if (!flow || !text) return;
      flow.focus({ preventScroll: true });
      const selection = document.getSelection(), caret = document.createRange();
      caret.setStart(text, 0); caret.collapse(true);
      selection?.removeAllRanges(); selection?.addRange(caret);
    });
  });
  onCleanup(() => { disposeGateway?.(); editor.dispose(); });
  const nodeKey = (index: number) => projection.state.nodes[projection.state.rootKey]?.children[index];

  return <main ref={page} class="standoff-effects-demo">
    <header>
      <nav><a href={import.meta.env.BASE_URL}>Workspace</a> · <a href={`${import.meta.env.BASE_URL}pilot`}>Reactive pilot</a></nav>
      <p class="standoff-effects-demo__eyebrow">Experimental visual standoff effects</p>
      <h1>Editable text, non-invasive effects</h1>
      <p>Each card uses the ordinary Codex Cell DOM. Select, click, and type in the examples; overlays remain pointer-passive and follow the mapped annotation range.</p>
    </header>
    <ReactiveViewProvider editor={editor} projection={projection}>
      <div class="standoff-effects-demo__grid">
        <For each={effects}>{(effect, index) => <section class="standoff-effects-demo__card" data-effect-card={effect.id}>
          <h2>{effect.name}</h2>
          <p>{effect.description}</p>
          {nodeKey(index()) && <BlockOutlet nodeKey={nodeKey(index())!} />}
        </section>}</For>
      </div>
    </ReactiveViewProvider>
  </main>;
}

export { effects as standoffEffectCards };
