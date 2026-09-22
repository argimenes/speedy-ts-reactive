// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { StandoffEffectsDemo, standoffEffectCards } from "./standoff-effects-demo";

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; document.body.replaceChildren(); });

describe("StandoffEffectsDemo", () => {
  it("shows every effect and composition in editable, unwrapped Codex text", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    dispose = render(() => <StandoffEffectsDemo />, host);
    const cards = host.querySelectorAll<HTMLElement>("[data-effect-card]");
    const flows = host.querySelectorAll<HTMLElement>(".reactive-standoff-flow");
    expect(cards).toHaveLength(standoffEffectCards.length);
    expect(flows).toHaveLength(standoffEffectCards.length);
    expect([...cards].map(card => card.dataset.effectCard)).toEqual(standoffEffectCards.map(card => card.id));
    for (const flow of flows) {
      expect(flow.getAttribute("contenteditable")).toBe("true");
      expect(flow.querySelector(".reactive-standoff-effect, .reactive-standoff-noise-layer")).toBeNull();
      expect(flow.children).toHaveLength([...flow.textContent!].length);
    }
    await Promise.resolve();
    expect(host.querySelector('[data-effect-card="amber-editing"]')?.contains(document.activeElement)).toBe(true);
    expect([...cards].filter(card => card.dataset.effectCard?.startsWith("amber-"))).toHaveLength(5);
  });
});
