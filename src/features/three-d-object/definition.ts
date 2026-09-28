import type { BlockMenuItem } from "../../feature-api";
import type { ObjectState } from "./model";
import { CoffeeSurface } from "./coffee-stain";
// Lightweight content descriptor: semantic actions do not require WebGL.
export const coffeeActions = (state: ObjectState, change: (patch: Partial<ObjectState>, label: string) => void): BlockMenuItem[] =>
  ([ ["steam", "Steam"], ["coffeeStain", "Coffee Stain"] ] as const).map(([key, label]) => ({
    label: `${label}: ${state.settings[key] ? "On" : "Off"}`,
    run: () => change({ settings: { ...state.settings, [key]: !state.settings[key] } }, `Toggle ${label}`),
  }));

/** Internal first content definition. No registration framework or Codex access. */
const coffee = {
  label: "Coffee Cup",
  actions: coffeeActions,
  surface: CoffeeSurface,
  create: async () => (await import("./coffee-cup")).coffeeCup(),
};
export const definitionFor = (scene: string) => scene === "coffee-cup" ? coffee : undefined;
