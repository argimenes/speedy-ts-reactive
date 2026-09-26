# Extending Codex after Stage 5

This is a guide to the implementation at `308bd74` (Stages 1–5), not the migration roadmap. Stage 6 / History extraction is deferred. Extensions are trusted TypeScript/Solid modules compiled with the application; there is no external plugin loader, discovery mechanism, sandbox or dependency resolver.

Start with the model that owns your behavior:

| Need | Implement today | Guide / real example |
| --- | --- | --- |
| Authored document content with its own interaction | A Block Application, registered by a feature module | [Creating Block Types](CREATING_BLOCK_TYPES.md); Timer |
| Cross-cutting editor operation or annotation workflow | A feature with injected semantic capabilities | [Feature Modules](FEATURE_MODULES.md); Grouping, Entity References |
| Passive visual interpretation of an authored text range | An `EffectDefinition`, registered by a feature | [Creating Standoff Effects](CREATING_STANDOFF_EFFECTS.md); Entity underline |
| An application inside a movable window | An application Block in a core Window Block's children | [Creating Window Applications](CREATING_WINDOW_APPLICATIONS.md) |
| Document-window density / margin-collapse policy | The single optional `WindowPresentationContribution` | [Window presentation](CREATING_WINDOW_APPLICATIONS.md#document-window-presentation-is-a-different-boundary); Compact Document |
| Cell CSS, backdrop regions, editable alternate text | Inspect the existing core/legacy implementation first | [Effect limits](CREATING_STANDOFF_EFFECTS.md#what-this-contract-does-not-cover) |

## Feature modules and ownership

[`CodexFeature`, `FeatureHost`, `FeatureScope`](../../src/runtime/features.ts) define activation and lifetime. [`registerApplicationViews`](../../src/application/features.ts) registers core views and activates configured Compact Document, Entity References, Grouping and Timer modules. Feature factories receive capability adapters from [`src/application`](../../src/application/features.ts); features import the [public API](../../src/feature-api/index.ts), not `ReactiveEditor`.

A scope owns registrations and module resources. Views and controllers own shorter-lived resources. Configuration controls startup activation; the disposers support teardown and tests, not a general hot-plugin system. Physical removal means deleting a feature's implementation and its application wiring while unrelated editor behavior and authored data still work.

## A Block can be an application

```text
Feature/module lifetime
    ↓ registers a Block Type
    ↓ creates zero or more mounted Block occurrences
        ↓ each gets its own BlockRuntime and cleanup
```

A registered Block Type can run an interactive mini-application, not just render different HTML. Timer owns controls, clock ticks, audio and local drag state. Its authored duration/deadline/settings live in the document; interval handles and input drafts live in each mounted occurrence; displayed remaining time is derived.

`BlockRuntime` is bound to one occurrence. Shared authored content can appear in several occurrences or views, so a single stored Block is not a singleton runtime. Unknown types use [`UnknownBlockView`](../../src/rendering/unknown-block-view.tsx), preserving authored payload/children/relations through generic storage even though their application behavior is absent. There is no type-specific serializer registration required for an ordinary JSON payload.

## Standoff effects interpret text

```text
Authored standoff property → inclusive Cell range
    → core DOM measurement → immutable local fragments
    → effect provider → SVG path descriptors → core SVG layer
```

The provider interprets geometry; it does not own text, selection or mutation authority. Passive SVG differs from backdrop/region rendering and from editable Text Superposition. Only the passive measured-fragment contribution boundary was extracted in Stage 4.

## Window presentation is not a Window application

A core Window Block hosts child Blocks and owns movement, geometry, resizing, standard controls and focus restoration. The Stage 5 port requests document margin collapse and contributes Compact's button/styles. It is not a per-application header or layout API. There is currently no public Window-header customization contract; the Window guide inventories the hard-coded behavior and records a small proposal separately.

## Choose a model, then combine it when needed

1. Does the feature represent authored content with its own state and interaction? Start with a Block Type / Block Application.
2. Does it coordinate editor behavior across existing Blocks? Start with a feature module and the relevant capabilities, rather than inventing a hidden Block.
3. Does it interpret a text range visually? Use a passive effect if SVG paths from measured fragments suffice. Inspect the region path for filters/backdrops; editable alternate content is not a passive effect.
4. Does it only change document-window presentation? Check the existing single presentation slot, which is occupied by Compact when enabled. Do not use it as an application launcher or a generic header slot.

These are composable categories. Timer is both a feature module and a registered Block Application. Entity References is a feature with commands, panels, annotation UI and a passive effect. A future application Block could contain authored standoff content, but `BlockRuntime` currently has no child-rendering or arbitrary annotation capability; document the concrete need before extending it.

## Development rules

- Depend on public semantic capabilities, not editor context, repository mutation or an editor escape hatch.
- Separate authored, runtime and derived state; persist deliberate document changes, not timers, geometry caches or UI previews.
- Keep generic measurement, selection, focus, storage and window mechanics in core; keep policy and feature UI in modules.
- Own registrations and resources at the correct module, panel or occurrence lifetime. Clean up partial activation and asynchronous work.
- Preserve unknown authored data. Removing executable behavior must not delete its stored meaning.
- Never infer deletion/edit authority from a highlight, decoration or visible rectangle. Use validated ranges and the current-operation boundary.
- Use core standoff measurement; providers do not query/edit Cells or install layout observers.
- Add capabilities for demonstrated requirements. Avoid universal service locators and speculative registries.
- Qualify physical removal, not just a disabled flag. Keep testing proportional to the boundary changed.

Continue with [the Block tutorial](CREATING_BLOCK_TYPES.md), [effect tutorial](CREATING_STANDOFF_EFFECTS.md), [Window guide](CREATING_WINDOW_APPLICATIONS.md) or [feature tutorial](FEATURE_MODULES.md). The [extension invariants](EXTENSION_INVARIANTS.md) add identity and persistence cautions.

The tutorial modules and Window fixture were extracted into temporary source files and checked with `npm run typecheck`. Two temporary runtime smoke tests verified Counter editing/undo inside the example Window, style application and panel focus/selection restoration. The examples are documentation, not enabled built-in features.
