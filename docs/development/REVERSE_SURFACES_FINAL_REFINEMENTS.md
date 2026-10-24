# Reverse Surfaces — final refinements

Date: 24 October 2026. Scope: visual affordance and focused qualification of the accepted ContainerBlocks/Reverse Surfaces implementation. No new schema, feature flag, resource ownership or flip mechanism.

## Changes

A native button with a 22px folded-paper graphic and a 36px hit target appears on surfaces with a reverse, including an empty reverse. Front and reverse use bottom-right and bottom-left corners respectively, with the graphic and hit target inside a reserved 36px gutter immediately below the face edge. This keeps the target clear of both the current viewer and the following Block. The gutter is present only when a reverse exists, including an empty reverse; each nested reversible surface reserves its own gutter. Ordinary Blocks and front-only surfaces have no fold. The button uses the existing `reveal` operation; both editing subtrees stay mounted. Labels and tooltips distinguish “Show reverse side” and “Return to front side”. Enter and Space preserve button focus for repeated activation. Pointer activation preserves the existing face-selection restoration. Reduced-motion behaviour remains in the existing animation stylesheet.

The reserved gutter is the user-approved exception to the original overlay-only/no-spacing-change requirement. It uses conditional bottom padding on the runtime surface, not persisted Block attributes.

The affordance is CSS-positioned; it performs no geometry measurement, persistence operation or document mutation. Its resource-control isolation and final positioning are covered by browser checks below. Perspective moved from the surface wrapper into the existing face transform so neighbouring Blocks cannot paint over the corner hit target. The existing 180ms rotation and reduced-motion rule are retained. Source-link and Copy URL spacing now wraps cleanly on narrow reverse faces.

## Shortcut proposals — none registered

Each option is a single simultaneous chord, not a sequence. Platform-specific modifiers avoid macOS Command-Shift-Y's Make Sticky service and Option character-entry combinations.

| Candidate | macOS | Windows | Assessment |
| --- | --- | --- | --- |
| Y | Control-Command-Y | Control-Shift-Y | Preferred for ordinary Document editing. No registered Mutable default collision. Existing Scry explicitly intercepts modified Y as a history key; flipping must remain unavailable during provisional Scry, rather than overriding that protection. |
| K | Control-Command-K | Control-Shift-K | No registered Mutable default collision. Windows CodeMirror uses Control-Shift-K to delete a line: only suitable with Document/Block scope, never while an embedded code editor owns input. |
| U | Control-Command-U | Control-Shift-U | No registered Mutable default collision. Distinct from normal underline. Windows/macOS candidate only; GNOME/GTK reserves Control-Shift-U for Unicode input. |

No exact candidate appears in the published Chrome Windows/macOS shortcut tables or the Windows/macOS general shortcut tables. This is a default-table audit, not a guarantee against user overrides, extensions, accessibility tools or IME configurations. Windows also allows Control-Shift to switch keyboard layouts; this user configuration should be checked before adopting any Windows candidate. Sources: [Chrome shortcuts](https://support.google.com/chrome/answer/157179?hl=en), [Apple shortcuts](https://support.apple.com/en-us/102650), [Windows shortcuts](https://support.microsoft.com/en-us/accessibility/windows/keyboard-shortcuts-in-windows). The Linux exclusion is documented by [Unicode's keyboard FAQ](https://www.unicode.org/faq/font_keyboard.html).

Application audit covers `src/input/binding-catalog.ts`, the runtime binding registry, autocomplete/Scry's temporary bindings and key interceptor, and the installed CodeMirror keymap. The command picker uses plain navigation, Enter, Escape and Control-A; none of the proposed exact chords is a picker command. Existing Command/Control-Shift-Enter resource processing and Shift-P Thesis launch are unaffected. A future approved binding should use the existing surface command, respect composition/modal input ownership, and never take keys from native fields, embedded viewers or provisional Scry. Native Windows OS interception has not been tested on this Mac.

## Image consolidation

With the existing default-enabled `reversibleBlocks` flag, image reverses use `ReversibleSurfaceView` exclusively. `ImageView` has no independent flip control or double-click implementation. Legacy image reverse text, identities and annotations retain the accepted in-memory normalisation and explicit Save behaviour. A focused test checks the absence of the old control and confirms image double-click does not flip.

`FlippableSurfaceView` remains in the code solely as the exclusive feature-disabled legacy fallback, selected by `register-core-views.ts`. It is not mounted alongside the accepted renderer. Removing that rollback path was outside this refinement.

## Qualification

- Focused surface suite: **43 passed**, covering both direct and Solid character renderers. New tests cover conditional/empty reverse controls, both directions, unchanged selection and exact mounts, no snapshots/commits/Save commands, one prior undo entry, permission gating and exclusive image controls.
- Related suites (preceding refinement pass, not rerun for the CSS gutter follow-up): **111 passed** across source-view, Mutable clipboard, interchange clipboard, package resources and reader tests. No newly introduced failure identified. The previously documented three failures in the broader Block-selection/WorkspaceDemo comparison were not rerun or reclassified in this focused pass; this is not a fresh whole-project regression run.
- Reactive TypeScript check and `git diff --check`: passed.
- **35 browser checks passed**, Chrome 155.0.8059.85 on macOS; **zero browser exceptions**. [Machine-readable results](evidence/reverse-surfaces-final/reverse-surfaces.json) and [shortcut audit](evidence/reverse-surfaces-final/shortcut-audit.json). The runner uses real Flint, a native Document fixture, a live iframe and the real PDF renderer with deterministic retained PDF bytes. It performs real pointer events and native Enter/Space activation. PDF reads, repository snapshots/commits, revisions and Save-command dispatch are instrumented.

Visual review: video and image retain source links, a collapsible canonical-attribute record and editable initial metadata/notes. Managed PDF additionally retains its title, page count, capture notice, provenance and reviewed relationships. Operational player/PDF controls remain on the front. The spacing correction above is the only metadata presentation change. Runtime reading density is tested; published reader exports retain the accepted front-only privacy projection.

Evidence: [video reverse](evidence/reverse-surfaces-final/video-reverse.png), [image reverse](evidence/reverse-surfaces-final/image-reverse.png), [PDF reverse](evidence/reverse-surfaces-final/pdf-reverse.png), [resized image corner](evidence/reverse-surfaces-final/image-front-corner.png).

## Compatibility and limitations

**Gutter follow-up:** the user approved a small reserved gutter after browser testing demonstrated that an exterior overlay could cover the following Block’s source-preview controls. The implementation now allocates 36px below each reversible surface and positions the full hit target within that space. Updated browser checks cover front and reverse faces, resizing, neighbouring controls and nested surfaces. The follow-up passes all 43 surface tests and 35 browser checks, with zero browser exceptions; TypeScript and whitespace checks also pass. Visual inspection of the refreshed screenshots confirms that the source-preview controls are clear. The previously reported corner-overlap defect is resolved in the qualified layouts.


Initial conversion of an already-mounted live iframe/media viewer still uses the accepted state-preserving move capability gate. If `Element.moveBefore` is unavailable, unsafe conversion is refused before mutation; there is no reconstruct-and-reset fallback. Existing surfaces can flip without reparenting. Chrome documents the state-preserving move behaviour in [its API introduction](https://developer.chrome.com/blog/movebefore-api). This pass does not broaden the existing browser support contract.

External authenticated/DRM providers and every browser/OS combination are not qualified. Local iframe document identity and real PDF page/canvas/scroll continuity provide bounded evidence, not a guarantee about remote provider behaviour. No load testing, user Vault writes or server restart were performed.


## Video player loading follow-up

At the user's request, valid generic, YouTube and Vimeo VideoBlocks now load their player automatically. The previous visibility handler unloaded players when a view, graph presentation or browser tab was hidden and did not reactivate them on return. It has been removed: retained occurrences keep the exact iframe and browsing context across visibility changes. Explicit Stop, view disposal and editor disposal still unload the player. A restored/new occurrence loads automatically; Stop remains local to its mounted occurrence. Provider URLs still use `autoplay=0`, so automatic loading does not start playback. URI-import labels now accurately describe player loading instead of claiming network-free video insertion. No persistence schema or manual Save behaviour changed.

Qualification: 62 tests passed (URI import, URI validation and reverse surfaces), reactive TypeScript passed, and 38 Chrome checks passed with zero exceptions. Browser evidence includes a real switch away from and back to the browser tab, application visibility/graph transitions, generic VideoBlock auto-loading and the existing reverse-surface continuity checks. [Video activation evidence](evidence/reverse-surfaces-final/video-activation.json). The older URI acquisition browser runner was updated for the new behaviour and syntax-checked, but was not rerun in this follow-up.
