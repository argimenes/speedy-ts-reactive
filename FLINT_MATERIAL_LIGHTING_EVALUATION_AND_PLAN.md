# Flint Material Lighting Evaluation and Implementation Plan

**Updated:** 6 October 2026  
**Status:** Evaluation and staged implementation plan  
**Scope:** Flint presentation, material lighting and graph visualisation

The limestone and sculptural relief design is feasible within Mutable's existing SolidJS application. Use an existing graph engine for graph behaviour and build Flint's material, artwork and lighting layer around it. **AntV X6 is the first package to prototype.** The initial prototype should reproduce the supplied mockup's small graph composition closely enough to judge visual fidelity before extending it to automatic layout or large datasets.

The principal visual work is the relief vocabulary, material treatment, typography, spacing and coherent illumination. Package configuration alone will not produce those qualities. Phase A also establishes optional local interaction inputs so a later Flint Probe can consume the same materials and lighting. This plan defines that work without beginning the application rewrite, implementing a custom cursor or committing to an engine before the prototype establishes its suitability.

## Current application architecture

Mutable uses SolidJS. References to React in the source brief describe the desired component approach; they do not require introducing React into Mutable.

The [Flint shell](src/features/flint/shell.tsx) uses semantic DOM controls and contains Library, Document and Context surfaces. The [application host](src/application/document-application-capabilities.tsx) supplies the canonical Document tabs and editor occurrences. Preserve their mounts, focus, selection and editing behaviour when changing chrome.

[Flint CSS](src/features/flint/flint.css) scopes appearance to `.flint-application` and already provides colour variables, container queries and responsive sidebars. This root is the boundary for the material system. Elevation, lighting, texture, radius and motion need dedicated tokens; a separate application-wide theme framework is unnecessary for the first stage.

Flint has no active graph view or public graph capability in [DocumentApplicationInstance](src/feature-api/document-application.ts). Legacy Cytoscape modules use older APIs and are not an integrated Flint renderer. Graph functionality therefore needs its own bounded integration stage, alongside the presentation work.

Existing [3D Object views](src/features/three-d-object/view.tsx) load their [Three.js runtime](src/features/three-d-object/scene-runtime.ts) separately and already manage visibility, motion preferences and disposal. Ordinary Flint chrome and the proposed graph should continue to render without Three.js.

## Graph package evaluation

| Candidate | Fit for this design | Planning decision |
| --- | --- | --- |
| AntV X6 | SVG and HTML node rendering, custom geometry and interactions, selection and minimap extensions. Its JavaScript core can be hosted within a SolidJS component. | Prototype first. Use its existing graph behaviour while supplying Flint node and edge artwork. |
| D3 modules | Force simulation is independent of rendering; zoom and drag behaviours can support custom SVG/DOM presentation. More graph UI must be assembled by the application. | Use `d3-force` for automatic layout if needed. Retain D3 with a custom presentation adapter as the alternative if X6 imposes a demonstrated constraint. |
| React Flow | Custom React nodes and interactive graph containers support extensive visual customisation. | Do not introduce a React runtime solely for the graph while a framework-independent candidate fits the architecture. |
| Cytoscape.js | Supports SVG node images and HTML/SVG extensions, with strong graph functionality. Its default canvas rendering makes inherited CSS lighting less direct. | Retain as an alternative if network functionality or measured scale requirements justify the additional presentation integration. |

The package capabilities are documented in [X6](https://github.com/antvis/X6), [X6 node rendering](https://x6.antv.antgroup.com/en/tutorial/basic/node), [D3 force](https://d3js.org/d3-force), [D3 zoom](https://d3js.org/d3-zoom), [React Flow custom nodes](https://reactflow.dev/learn/customization/custom-nodes), and [Cytoscape.js](https://js.cytoscape.org/). X6 is a candidate for this presentation, not an assumption of proven relief performance.

X6 should own its graph viewport and graph elements inside one dedicated container. SolidJS should own the surrounding Flint shell, controls and lifecycle. Dispose graph resources on unmount; avoid having both systems mutate the same node subtree. Solid-rendered HTML inside a graph node should be introduced only where needed and must have an explicit mount and cleanup adapter.

## Visual fidelity to the mockup

Reproduce the reference through custom SVG geometry and CSS materials: the central mask, spiral, leaf, pyramids, moon, disc, diamond, stone spheres and small connecting beads. Give those forms body shading, edge highlights, contact shadows and restrained texture. Keep graph edges fine, with straight, curved and dashed treatments appropriate to their meaning. Contextual outlines can be a separate SVG layer aligned with the graph viewport.

The first visual comparison should use deliberate positions approximating the mockup, with similar whitespace, symbol proportions and label placement. An unconstrained force layout would change the composition before its appearance could be judged. Add automatic layout afterward, preserving user-pinned positions and allowing the simulation to settle.

Use real DOM or SVG typography for labels and real DOM controls for the surrounding interface. Keep reading and editing surfaces visually quiet. The broad diagonal illumination should remain a subtle, non-interactive presentation layer.

The supplied head artwork is a raster asset with baked illumination. Moving an external shadow cannot relight its internal shading. Preserve the existing identity artwork; evaluate a suitable SVG relief representation or an optional genuine 3D asset where changing internal illumination is essential. Asset quality and composition will determine how closely the result resembles the reference.

## Lighting state and material primitives

Create one presentation controller at each Flint application root. It supplies azimuth, elevation, intensity and softness to all material descendants and, later, any optional 3D adapter. Define azimuth in screen coordinates and document the conversion to shadow offsets and the 3D light vector so every layer agrees on direction.

Coalesce light changes into at most one `requestAnimationFrame` update. Write derived CSS custom properties on `.flint-application`; descendants should inherit them rather than each subscribing to a light signal. Small lighting controls may update their displayed values independently. Inherited custom properties support this architecture. [CSS custom property documentation](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascading_variables/Using_custom_properties)

| Token family | Responsibility |
| --- | --- |
| Material | Limestone first; paper and charcoal as later extensions. |
| Surface and texture | Base colours, restrained grain and low-opacity variation. |
| Elevation | `etched`, `carved`, `flush`, `relief`, `raised`, `object`. |
| Lighting | Direction, bounded intensity, elevation and softness. |
| Shadow, highlight and border | Derived responses for each elevation. |
| Local response | Bounded contact illumination, depression, lift and wave response for each material. |
| Radius and motion | Consistent geometry and restrained interaction transitions. |

Use elevation classes or attributes on existing semantic elements. Small `FlintSurface`, `FlintPanel`, `FlintButton` and `FlintRelief` primitives can standardise new components without requiring replacement wrappers around every working control.

Start with procedural gradients. Introduce a small seamless texture only if it materially improves the visual comparison. Keep text colours independent of light intensity, bound blur and displacement, and provide Reset to Flint Default.

## Shared material response and future Flint Probe

Treat interaction as an optional input to material response. Conventional hover and active states are useful input adapters, but do not define the complete interaction vocabulary. Pointer proximity, contact, press, lift, keyboard activation and programmatic demonstrations can supply the same presentation contract. The future Probe is a consumer of that contract, alongside panels, buttons and graph reliefs.

Use a shared response resolver with the following inputs: the material and its response limits, baseline surface elevation and geometry, global light, optional local interaction state, and motion/effects preferences. It derives body shading, highlights, shadows, effective elevation and local decorative fields. DOM/CSS and SVG adapters apply those outputs through their existing primitives; an optional Three.js adapter can consume the same logical inputs later. This is one material model with renderer adapters. It does not require a separate pointer rendering engine.

### Proposed presentation contract

| Input | Meaning and bounds |
| --- | --- |
| Surface identity and geometry | Instance-local target ID, material, baseline elevation, dimensions and local coordinate frame. These are presentation identities, separate from canonical record identities. |
| Local position | Contact anchor in surface-local CSS pixels, plus normalised coordinates for scaling a decorative field. Record the coordinate frame explicitly. |
| Proximity and contact | Separate strengths in `[0, 1]`; proximity can illuminate before contact. Neither implies that an action has occurred. |
| Press and lift | Separate strengths in `[0, 1]`, resolved through material-specific travel limits. Effective elevation is baseline height minus depression plus lift, bounded by the surface's allowed range. |
| Wave impulse | Optional event ID, local origin, start time, bounded amplitude and finite duration. The material defines radius, propagation and decay; an impulse expires rather than creating an idle animation loop. |
| Capabilities | Typed presentation descriptors supplied by the owning control or graph adapter, such as activate, drag or inspect, with availability. Material cues express these descriptors; they do not authorise or dispatch actions. |

Keep surface elevation distinct from the light's elevation angle. Resolve named elevation levels to visual height and shadow/highlight profiles; retain the baseline level when interaction temporarily changes effective height. Defaults for every optional interaction input are neutral, preserving the unmodified material appearance. Response limits belong to the material vocabulary, not to a future cursor's private palette or animation constants.

Global illumination supplies the common directional light. Local contact illumination adds a bounded, surface-local contribution; it does not overwrite the root light or recolour text. Waves modulate the same material response within a bounded region. Press and lift alter presentation height, relief and shadow while keeping layout and hit areas stable. Capability indicators use the shared relief, material and light treatment, with text or accessible descriptions available independently of decorative cues.

A later sculptural Probe should declare its own material, elevation and facet normals in the common screen-space lighting basis. Its facets then receive the global light through the same response model, while its contact with a surface supplies local interaction inputs to that surface. SVG facet shading is a suitable first rendering approach; actual Probe geometry, tracking and interaction behaviour remain a later experiment. Phase A does not create a pointer-following object, hide or replace the native cursor, or change editor caret behaviour.

### Ownership and Phase A boundary

Keep global light at the Flint root and local interaction state scoped to affected surfaces. A small interaction coordinator supplies target-local inputs to the shared resolver and uses the same coalesced frame scheduler as lighting. Clear transient state on target disposal, cancellation, lost capture or application teardown. Reset clears local demonstrations and pending impulses as well as restoring global light.

The X6 adapter converts client coordinates through the current pan/zoom transform into graph and then surface-local coordinates. DOM surfaces use their own local geometry adapter. Geometry updates follow resize, viewport and layout changes; do not read every node's bounds on every pointer event. Overlays are decorative and do not intercept pointer events or determine which semantic action is available.

Phase A proves the contract using ordinary playground controls that inject contact position/strength, press, lift and a finite wave impulse into a panel and an SVG graph relief. This exercises the common response path without a custom cursor. Acceptance requires neutral inputs to restore the baseline, local effects to remain confined to the target, and global light changes to remain coherent during local effects. Reduced-effects mode and keyboard operation must work through the same contract. Probe tracking, sculptural pointer assets and production capability indicators are deferred; a later Probe feature receives its own feature flag under the project convention.

## SVG and graph integration

Register custom X6 node forms and edge treatments through supported extension points. Keep reusable symbols, gradients and filter definitions within the owned graph SVG scope, with identifiers unique to each Flint instance. Verify access to those definitions, filter bounds and CSS-variable inheritance in the prototype.

Where SVG filter parameters require attributes, update the shared definitions directly from the lighting controller instead of assuming every attribute accepts `var()`. [SVG drop shadow documentation](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDropShadow)

Share immutable geometry and global lighting definitions. Target-local effects need scoped variables, overlays or definitions so contact with one node cannot alter every node using a shared filter. Keep these within the graph's rendering ownership; SolidJS supplies inputs through the adapter rather than mutating X6-owned node subtrees independently.

Shared definitions reduce repeated markup; every filtered node still incurs rendering work. Use full relief, simplified relief and flat vector detail levels according to measured visible-node counts and zoom. Keep layout, viewport movement and lighting updates independent so moving the light does not restart a layout or reconstruct graph nodes.

For a live graph, introduce a typed presentation adapter over existing canonical services within the current Cavern. Preserve record identities, participant roles and provenance. A displayed edge must not silently reduce a multi-participant Claim to a different semantic model. Node forms and CSS properties are presentation choices, not additions to Entity, Document or Claim identity.

The prototype uses a presentation fixture corresponding to the mockup. It does not need a new semantic query service or corpus migration.

## Performance and accessibility

Root CSS updates avoid per-node application subscriptions, but they can still cause style recalculation and repainting. Dynamic shadows, large blur regions and many filtered SVG nodes are the principal risks. Prefer transform and opacity for moving the broad illumination overlay where practical; do not assume compositing or acceptable performance without browser measurements. [Browser rendering guidance](https://web.dev/articles/animations-guide)

Compare 50, 250 and 1,000 visible nodes in full, simplified and flat modes, varying zoom and light direction. Record frame-time distribution, lighting-controller work, paint cost, input responsiveness and DOM stability. Establish the practical detail thresholds from those results. A 60 Hz display has approximately 16.7 ms per frame; this is a design budget, not a claimed benchmark result.

Measure local effects during pan, zoom and dragging as well as at rest. Update only affected surfaces, cap simultaneous impulses and their filter area, and stop scheduling frames when no light update or transient effect remains. Under load, simplify or suppress decorative fields while preserving the interaction and its semantic feedback. Local contact must not rebuild graph nodes, restart layout or notify every surface of each pointer movement.

Preserve focus outlines, keyboard navigation, selectable labels and screen-reader semantics. Selection must remain clear without relying on shadows or colour alone. Provide keyboard alternatives to graph dragging and light movement, plus an accessible connections list. Package interaction support does not establish accessibility by itself.

Respect reduced motion and provide reduced effects. Forced-colour treatment should remove decorative textures and filters while retaining controls, labels, selected states and focus. Check readable contrast across the bounded lighting range. Compare Chrome and Safari, including SVG filter clipping, HTML inside SVG where used, scaled labels and pointer interactions.

Keyboard and touch input may supply contact/press feedback without a pointer sculpture. Reduced motion suppresses propagating waves and animated travel; reduced effects can use static outlines or state cues. Capability and activation feedback must remain available through native control semantics and accessible labels. Decorative interaction must preserve text selection, caret placement, focus and native hit testing, and must never dirty a Document or persist transient state in `.ink` records.

## Three.js presentation boundary

Only a genuinely dimensional object should create a WebGL context. A later bridge may pass the same logical direction and strength to the existing Object scene through a host presentation input, with lazy loading and cleanup preserved.

The current Object model has authored `neutral`, `warm` and `dramatic` lighting presets. Define their precedence explicitly: the proposed default is for Flint to supply environment direction and modulation while retaining authored object characteristics. Do not silently rewrite those presets or persist incidental Flint lighting in `.ink` semantic records.

## Staged implementation plan

| Phase | Work | Completion criterion |
| --- | --- | --- |
| A | Build an isolated material playground containing a limestone surface, panel, raised and recessed controls, an X6 reference graph, sculptural SVG forms, one shared movable light and reset. Exercise optional local contact, press, lift and wave inputs through ordinary controls. | A browser comparison demonstrates coherent global and local material response while selection, pan, zoom and dragging work. Local effects remain target-scoped and reset to neutral. No custom cursor is implemented. |
| B | Formalise the lighting controller, shared response resolver, local interaction contract, tokens, relief vocabulary, primitives and reduced-effects treatment. | Existing and new primitives share one bounded material model with explicit lifecycle ownership and renderer adapters usable by a later Probe. |
| C | Apply the material system to Flint's sidebar, tabs, toolbar, search and inspector. | Chrome approaches the reference without remounting Document editors or changing authored typography. Preserve core Window controls and geometry. |
| D | Add the live graph adapter, semantic navigation, appropriate edge meanings, automatic layout, pinned positions and measured detail degradation. | The graph uses canonical services and identities, remains usable at the supported sizes, and preserves semantic roles and provenance. |
| E | Evaluate one optional genuine 3D object receiving the shared light. | Direction agrees with CSS/SVG and the ordinary graph and shell remain independent of Three.js. |
| F | Polish lighting controls, reset and user-preference persistence. | Preferences restore through application settings without becoming semantic data. |

### Phase A sequence

1. Pin an X6 version during implementation and create a lazy, isolated playground route. Add the proposed `flintMaterialLighting` feature flag, enabled by default under the project convention; at this stage it enables the playground without replacing current Flint chrome.
2. Build the shared root controller, response resolver and material/elevation tokens. Define optional local interaction inputs and neutral defaults. Implement the DOM panel and controls alongside representative SVG relief geometry.
3. Place the graph fixture deliberately to resemble the reference. Connect shared lighting to its node artwork and edges through supported X6 extension points.
4. Add selection, dragging, pan, zoom and minimap behaviour through the engine and its extensions. Add application-specific keyboard and accessible-list behaviour.
5. Add ordinary fixture controls for target-local contact, press, lift and a finite wave impulse. Verify the same response vocabulary on DOM and SVG surfaces, including reset, keyboard operation and reduced effects. Keep the native cursor.
6. Compare the visual result with the mockup at the default light and at several changed directions, including during local effects. Inspect material consistency, body shading, shadow clipping, typography and spacing.
7. Measure the representative graph sizes and local effects, and document whether X6 meets the rendering and interaction needs. Retain X6 if it fits; move to the D3 alternative only for a concrete constraint. Formalise the reusable primitives after this decision.

## Files and modules

| Location | Planned responsibility |
| --- | --- |
| `src/features/flint/lighting.ts` | Shared light state, coordinate conventions and coalesced scheduling for global and local presentation updates. |
| `src/features/flint/material-response.ts` | Pure, bounded response resolution from material, elevation, geometry, light, optional local inputs and effects preferences. |
| `src/features/flint/material-interaction.ts` | Presentation input contract, target registration, transient interaction coordination and cleanup; no custom cursor. |
| `src/features/flint/material-tokens.css` | Material, elevation, texture, shadow, highlight, local response limits, radius and motion tokens. |
| `src/features/flint/material-primitives.tsx` | Small semantic primitives for new material UI. |
| `src/features/flint/relief-defs.tsx` | Reusable SVG forms and scoped lighting definitions. |
| `src/features/flint/material-playground.tsx` | Isolated Phase A fixture, lighting controls and local response demonstrations using the native cursor. |
| `src/features/flint/graph/` | X6 lifecycle, coordinate and material adapters and fixture first; layout and live projection in later stages. |
| `src/features/flint/shell.tsx`, `flint.css` | Phase C chrome integration and the shared root boundary. |
| `src/App.tsx`, `src/configuration.ts` | Playground route and explicit feature composition. |
| `package.json`, lockfile | Pinned graph package and later layout dependencies when implemented. |
| `src/feature-api/document-application.ts`, `src/application/document-application-capabilities.tsx` | Bounded live graph capability in Phase D if the existing contracts need extension. |
| `src/features/three-d-object/view.tsx`, `scene-runtime.ts` | Optional Phase E presentation bridge. |

Pass feature settings explicitly through the application composition so individual hosts can opt out. Preserve the existing feature defaults and persistence/service contracts.

## Decisions for later stages

Phase A can proceed with temporary per-instance lighting state and the fixed reference fixture. Before Phase D, settle the first live graph scope: Documents, Entity mentions, canonical Relationships, Claims or a defined combination, including the meaning of each edge type. Before Phase F, settle whether lighting preferences apply across all Flint windows or are remembered per Cavern.

Before a later Flint Probe experiment, decide its sculptural geometry, input-device eligibility, capability vocabulary and exact proximity/contact behaviour. These choices consume the Phase A response contract; they do not require a second material system or block the playground.

The material system remains scoped to Flint. It does not require a new graph library, a React migration, a semantic-schema redesign or a full Three.js interface.
