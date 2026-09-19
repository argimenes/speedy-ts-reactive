/**
 * Application feature switches.
 *
 * Block history is deliberately opt-in while the feature is being introduced.
 * Set `blockHistory` to `true` to expose the History/Restore UI and allow a
 * ReactiveEditor to start session or persistent history recording.
 */
export type FeatureFlags = Readonly<{
  blockHistory: boolean;
}>;

export const featureFlags: FeatureFlags = Object.freeze({
  blockHistory: false,
});

export type ReactiveEditorConfiguration = {
  features?: Partial<FeatureFlags>;
};

export function resolveFeatureFlags(configuration: ReactiveEditorConfiguration = {}): FeatureFlags {
  return Object.freeze({ ...featureFlags, ...configuration.features });
}
