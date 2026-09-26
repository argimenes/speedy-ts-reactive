# Codex developer guide

This guide explains the rebuilt Codex to a developer familiar with the original imperative `Block` classes. It documents the implementation in `src/block-tree`, `src/reactive-editor`, `src/rendering`, `src/input`, `src/runtime`, `src/history`, `src/application`, `src/feature-api`, and `src/features` as it exists now. Root-level planning documents describe how the rebuild was conceived; these pages describe the current code.

Recommended reading order:

1. [Old Codex to new Codex](architecture/OLD_TO_NEW_MODEL.md)
2. [Architecture overview](architecture/OVERVIEW.md)
3. [Feature modules and hosted Block applications](architecture/FEATURE_MODULES_AND_BLOCK_APPLICATIONS.md)
4. [Rendering and reactivity](architecture/RENDERING_AND_REACTIVITY.md)
5. [Input, commands, and keybindings](architecture/INPUT_COMMANDS_AND_KEYBINDINGS.md)
6. [Persistence and history](architecture/PERSISTENCE_AND_HISTORY.md)
7. [SVG and overlays](architecture/SVG_AND_OVERLAYS.md)
8. [Where do I go to change X?](development/REPOSITORY_MAP.md)

Practical extension guides (accepted Stages 1–5):

- [Choose an extension model](development/EXTENSION_ARCHITECTURE.md)
- [Creating a Block Type / Block Application](development/CREATING_BLOCK_TYPES.md)
- [Creating an SVG Standoff Effect](development/CREATING_STANDOFF_EFFECTS.md)
- [Creating an application hosted by a Window Block](development/CREATING_WINDOW_APPLICATIONS.md)
- [Creating a cross-cutting Feature Module](development/FEATURE_MODULES.md)

Additional recipes and references:

- [Legacy CSS standoff properties](development/ADDING_A_STANDOFF_PROPERTY.md)
- [Add a Block property](development/ADDING_A_BLOCK_PROPERTY.md)
- [Extension invariants](development/EXTENSION_INVARIANTS.md)
- [Other minimal examples and development loop](development/MINIMAL_EXTENSION_EXAMPLES.md)

Names in this guide use **Block** for an authored Codex concept, `ContentRecord` for its canonical content, `PlacementRecord` for an attachment of that content, and `BlockNode` for one occurrence projected into one view.

Current migration status: Stages 1–5 are accepted: Timer, Grouping, Entity References and Compact Document have feature-owned implementations with the demonstrated Block, operation, passive-effect/panel and presentation boundaries. [Stage 5 report](../CODEX_FEATURE_MODULE_STAGE_5_REPORT.md) records the latest extraction. Stage 6 / History extraction is deliberately deferred; the [architecture review](../CODEX_FEATURE_MODULE_ARCHITECTURE_REVIEW.md) is a roadmap, not an API reference.

Proposal awaiting review: [Canvas workspace / presentation investigation and plan](../CODEX_CANVAS_WORKSPACE_PRESENTATION_PLAN.md). This describes a possible Desktop/Canvas extension; Canvas is not implemented.
