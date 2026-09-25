# Stage 5 implementation report

Stage 5 only is complete. Stage 4 is preserved at commit `298b8f9` (`Stage 4 complete`) and in the clean detached checkout `/tmp/speedy-stage4-baseline-298b8f9`. Stage 6 requires another review. History/persistence extraction and Text Superposition were not started.

## Presentation capability

`src/runtime/window-presentation.ts` supplies one optional document-window presentation contribution. It is a single slot, with duplicate registration rejected and an identity-safe disposer; there is no layout registry, policy chain or service lookup.

The feature-facing port contains only:

```ts
interface WindowPresentationPort {
  readonly marginsCollapsed: Accessor<boolean>;
  requestMarginCollapse(collapsed: boolean): void;
}
```

A contribution creates one instance per mounted document window and supplies a reactive CSS class name and a header control. A single workspace class preserves the existing workspace density styles. Creation runs in the window's Solid owner; feature removal or window disposal releases the instance and revokes its presentation request. Retained callbacks cannot modify a disposed window instance.

`PresentationCapabilities.register` is scope-bound by the application adapter. Neither the editor, the repository, window elements, arbitrary DOM queries nor geometry setters cross the public feature boundary. Expanded geometry and the automatic-collapse cause remain core-private because this pilot has no reason to read or change them directly.

## Ownership and dependencies

`src/features/compact-document/` owns the explicit compact signal, toggle policy, accessible button, pointer handling that preserves a margin selection before collapse, and all Compact Document density/styling rules. Its production dependencies are Solid, the public feature API and its own stylesheet. It does not use `BlockRuntime`.

The existing `compactDocumentMode` capability remains enabled by default. Each window's explicit compact state still starts false and is transient. Disabling the flag prevents feature activation; deleting the module requires only deleting its application import/activation and the now-unused adapter import.

Core retains:

- Existing per-window ResizeObservers, the 730px automatic-collapse threshold, responsive CSS and minimum/minimap lane allocation.
- Expanded window dimensions, temporary width reduction, resize previews/commits, positioning and minimized-window mechanics.
- Margin registration, indicators, drawer contents and access, focus transfer, selection restoration and their existing microtask ordering.
- Authored storage, editing, selection, undo and shared annotation infrastructure.

`src/rendering/window-presentation.ts` shares the actual presentation/geometry adapter between canonical `WindowView` and the legacy demo shell. Core combines the requested collapse with automatic narrow-window collapse. Turning explicit mode off does not override an independently narrow window. Compact resizing converts the displayed dimensions back to expanded dimensions before committing; presentation toggles themselves do not create authored edits.

There are no new observers, polling loops, input dispatch paths or document-tree reconstruction for presentation changes. Existing drawer mounting behavior remains in core. Tests verify stable main-text Cell identity across toggles.

## Geometry correction

The legacy demo's workspace snapshot previously serialized `getBoundingClientRect()` even while compact or minimized. It now prefers the maintained expanded dimensions and avoids reading minimized/maximized presentation dimensions as normal geometry.

A mocked local-workspace-save regression reproduces the bug on Stage 4: a 1000px expanded window saves as 824px while compact. Stage 5 saves 1000px while compact and while minimized, and restores 1000px when expanded again. This corrects the geometry supplied to the existing save path; it does not extract or redesign persistence.

## Physical removal

Created `/tmp/speedy-stage5-without-compact` from the candidate source, physically deleted `src/features/compact-document/` including its stylesheet/tests, and removed only the two composition imports and activation line. The default flag remains true. Core source and public contracts need no stubs or fallback feature implementation.

Results:

- Typecheck and both client/server builds pass.
- All 29 tests across the eight applicable core/demo suites pass. The first removal run identified a Compact button assertion inside a system-bar test; that assertion now lives in the feature suite. The affected demo suite was rerun successfully.
- All 24 removal browser assertions pass: normal windows, automatic collapse, resizing, drawer access, editing, unknown authored metadata and focus restoration after minimize/restore.
- Compact controls and density styles are absent. Generic margin indicators remain available when windows automatically collapse; their availability no longer depends on the Compact feature flag.

## Qualification

Candidate: **33 tests across 10 focused suites**, typecheck, client build and server build pass. After the final CSS ordering correction, the client build and browser checks pass again. The final test-assertion relocation was rechecked in both affected candidate suites and the removal demo suite.

Focused suites cover Compact window/workspace behavior, core window icons/resizing, the demo shell, hosted local file operations, margin commands, feature lifetimes/capabilities and unknown-feature preservation. New checks include independent windows within one editor, disposal/reactivation, unmount/remount, compact resize conversion and expanded workspace snapshots. Existing pointer preview/commit/cancel and keyboard-resize checks remain in the core suites. The earlier compact/native/standoff margin-selection test moved into the feature suite without weakening its assertions.

`scripts/check-stage5-presentation-browser.mjs` passes **47 assertions on both Stage 4 and Stage 5** in Chrome 153. It uses isolated profiles and in-memory documents. Two ordinary laptop CSS viewports (1440×900 and 1280×800) and a 720×450 CSS viewport at scale factor 2 exercise the effective layout of 200% zoom. The latter is emulated high-zoom geometry, not an OS/browser zoom-menu automation test.

| Window scenario | Expanded | Compact | Restored |
| --- | ---: | ---: | ---: |
| 1440px laptop | 1000px | 849px | 1000px |
| 1280px laptop | 840px | 740px | 840px |
| Effective 200% viewport | 640px | 640px | 640px |

Stage 4 and Stage 5 match in all three scenarios. Browser checks also exercise real pointer activation, preserved native margin selection/focus, indicator access, drawer Escape/focus return, keyboard resizing, native text insertion, unknown metadata and window focus restoration. Automatic collapse survives toggling explicit mode in the narrow scenario. The legacy shell's padding, window geometry, header, toolbar and footer measurements also match Stage 4 after correcting stylesheet ordering during extraction.

Raw browser results, test totals, build results, removal procedure and the baseline regression are recorded in `CODEX_FEATURE_MODULE_STAGE_5_QUALIFICATION.json`. Builds retain the existing large-chunk/browser-mapping notices. No exhaustive theme/viewport matrix or typing-performance claim is made.

## Remaining boundaries and reusable requirement

No Compact Document names, flags or implementation imports remain in central window rendering, runtime, demo presentation code or shared styles. Configuration and application composition intentionally retain the feature name. `compactEditorChrome` and `codexSystemBar` remain separate existing concerns, outside this extraction.

The demo shell still has its existing margin registration, observer and focus wiring because its root and storage lifetime differ from canonical Block windows. Those are deliberate host adapters, with no Compact policy or toggle left in them. The geometry/presentation adapter is shared by both hosts.

The demonstrated reusable requirement is small: a disposable per-window presentation request, a contributed control, scoped styling, and core conversion between displayed and expanded geometry. This exercise provides no evidence for multiple competing layout providers, a universal panel/property framework or a generalized layout plugin system.

Stop here for review before Stage 6.
