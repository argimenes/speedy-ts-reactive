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

Practical recipes:

- [Add a Block type](development/ADDING_A_BLOCK_TYPE.md)
- [Add a standoff property](development/ADDING_A_STANDOFF_PROPERTY.md)
- [Add a Block property](development/ADDING_A_BLOCK_PROPERTY.md)
- [Extension invariants](development/EXTENSION_INVARIANTS.md)
- [Copyable minimal examples and development loop](development/MINIMAL_EXTENSION_EXAMPLES.md)

Names in this guide use **Block** for an authored Codex concept, `ContentRecord` for its canonical content, `PlacementRecord` for an attachment of that content, and `BlockNode` for one occurrence projected into one view.

Current migration status: Stage 0/1 is complete with Timer as the first module; Stage 2 is not implemented. Use the [architecture review](../CODEX_FEATURE_MODULE_ARCHITECTURE_REVIEW.md) for the plan and the [Stage 1 report](../CODEX_FEATURE_MODULE_STAGE_1_REPORT.md) for implementation/qualification. New Block examples use the public runtime; property/selection guides identify the remaining legacy paths.
