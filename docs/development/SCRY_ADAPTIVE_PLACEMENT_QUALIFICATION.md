# Scry adaptive placement — 22 October 2026

Scry now prefers 75% of the visible viewport width and 560px height, with a 500px minimum whenever a usable non-overlapping region permits it. The matched Entity column receives more horizontal space. The entire highlighted source range, including wrapped lines, is protected by a 20px gap.

The bounded placement solver compares four free regions: below, above, right and left. A wide region meeting the height minimum wins over a slightly larger narrow side region, avoiding jumps as the phrase grows. For low source text the popup bottom sits 20px above the selection; horizontal alignment follows the selection start where viewport clamping permits. The tool may extend beyond its owning application's rectangle but retains its existing application ownership and lifecycle.

Safe manual placements are preserved, including owner movement. Final positions are checked against the source again after movement, resizing, source changes, scrolling and viewport/zoom changes. Manual resizing uses a 500px minimum except when the available non-overlapping space itself is smaller. Initial placement occurs on mount; subsequent invalidations coalesce in an animation frame. Geometry reads cover only the selected DOM Range and owning surface, with no document cell sweep, repository snapshots or content edits.

If no region can provide 500px height with a usable control-column width, source visibility takes precedence: Scry uses the best smaller region and its existing scrolling controls. Narrow layouts stack source controls and results. Optional expanded boundary controls, review panels and details can require scrolling. If the selection fills the viewport and no free region exists at all, Scry dismisses without editing the source rather than covering it. While a user is actively dragging/resizing, gesture previews follow the existing geometry controller; the non-overlap check applies on commit.

## Qualification

- **41 autocomplete tests passed**, including nine placement cases: below/above/side selection, wrapped range, constrained viewport, manual placement, zoom offsets, phrase-growth stability, a viewport/position matrix and no-safe-space handling. Existing bounded-edit and no-snapshot checks pass.
- **98 real Chrome checks passed**, with no browser exceptions. These cover 75% width, 500px minimum where space permits, visible search inputs/selectors, source clearance, the 20px above-source gap, dragging, resizing, typing stability, viewport resizing, page scale 1.25, Entity linking and existing cancellation/owner lifecycle behaviour.
- Client TypeScript and whitespace checks passed.
- No new failures in these focused suites; the unrelated accepted baseline suites were not rerun for this presentation change.

Evidence: [above-source screenshot](scry-placement-qualification/above-source.png), [below-source screenshot](scry-placement-qualification/below-source.png), [browser results](scry-placement-qualification/browser-results.json), [unit results](scry-placement-qualification/tests.txt).

Implementation: `src/features/autocomplete/placement.ts`, `view.tsx`, and the embedded Entity-search CSS. No feature defaults, persistence or Save semantics changed.
