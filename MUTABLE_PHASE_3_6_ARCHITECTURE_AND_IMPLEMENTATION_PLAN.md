# Mutable OS — Phase 3.6: Publish to Web

Date: 2026-10-17  
Status: Architecture approved, including Section 14 defaults. Stage A is accepted; its [qualification report](MUTABLE_PHASE_3_6_STAGE_A_QUALIFICATION.md) records the completed milestone. Stage B — Directory Publication is authorized. Stages C–D require separate implementation authorization after preceding qualification.

## 1. Objective and boundary

Generate portable static websites from explicitly selected, saved Ink documents. Support a single document or a directory, with themes, navigation, local search, optional semantic entity interactions, reusable publication profiles, incremental builds and isolated local preview.

Build on the accepted [Application Services Foundation](MUTABLE_APPLICATION_SERVICES_FOUNDATION_QUALIFICATION.md) and [desktop architecture](MUTABLE_APPLICATION_SERVICES_DESKTOP_ARCHITECTURE_REVIEW.md). Contracts, workflows and platform adapters remain separate. Node/TypeScript is the initial host; the static generator has no SolidJS, DOM, HTTP, Electron or Tauri dependency.

**Recommended delivery boundary:** this phase produces, previews and exports a complete static site for uploading to a static host. It does not provision hosting, manage deployment credentials or upload to a provider. The UI distinguishes **Build**, **Preview** and **Export site**; it must not claim that building makes a site live on the Internet. Provider deployment can be separately specified later.

No changes to native document ownership, manual saving or Undo/Redo. No automatic publishing, remote acquisition, crawler, editor bundle in the generated site, public Cavern API, general theme/plugin marketplace, Phase 4 interchange or desktop packaging. Qualified Phase 3.5 workflows and Stage E browser journals remain intact.

The new feature uses one default-enabled `webPublishing` flag, dependent on the existing application-service host. Disabling it removes publishing entry points and execution, without deleting retained profiles or releases or changing other feature defaults. A runtime disable checkpoints/stops active publication work safely.

## 2. Existing implementation and necessary extensions

| Existing component | Reuse and boundary |
| --- | --- |
| [Typed operations](src/application-services/contracts.ts) and [capability ports](src/application-services/capabilities.ts) | Reuse saved native reads with expected hashes, immutable original retrieval, bounded PackageData extraction and scoped host composition. Add publication operation contracts, not filesystem/SQL access for the frontend. |
| [Preparation workflow](src/application-services/service.ts) | Preserve conversion/package behavior. Publication adds a host-owned multi-step workflow; existing preparation requests remain request-bound. |
| [Durable job storage](server/application-services/job-storage.ts) | Reuse Cavern scope, pinned directories, execution leases, immutable publication, expected revisions and recovery evidence. Extend the same facility with versioned publication records and bounded per-unit receipts. |
| [Host executor](server/application-services/executor.ts) | Reuse bounded workers and shared TypeScript libraries. The 30-second task deadline is not a whole-site deadline. |
| [Semantic exporter](src/interchange/export-plan.ts) | Reuse semantic HTML body generation and diagnostics after privacy filtering. A publication-owned shell supplies navigation, theme and security policy. |
| [Native/package projection](src/interchange/package/native.ts), [asset projection](src/interchange/package/projection.ts) and [archive primitives](src/interchange/package/archive.ts) | Reuse native decoding, fragment serialization, content hashes and original-byte verification. Do not create a giant `.inkpkg` or accumulate the site in the existing in-memory package projection. |
| [Collection source bindings](src/interchange/collection/source-export.ts) and [path policy](src/interchange/collection/plan.ts) | Reuse explicit relationship evidence, Markdown parsing and portable-path rules. Do not reuse raw source HTML export as a public page or guess targets from matching titles. |
| [PackageData extraction](src/knowledge-sqlite/package-data.mjs) | Reuse bounded read-only extraction. Build a separate, minimal public data projection; never publish the archival database slice by default. |

Three current limits require an explicit publication design:

1. `jobs.run` currently awaits completion and aborts on request disconnection. Publication needs a durable start acknowledgement and a lifetime owned by the host, independent of the initiating connection.
2. Preparation records allow 256 revisions, a 64 MiB result and a 128 MiB retained-artifact budget. These are unsuitable for checkpointing a thousand-document site. Add publication-specific record/storage limits and segmented receipts; do not globally raise preparation limits or rewrite existing records.
3. Archival projection intentionally retains otherwise unreachable definitions and authored data. `rootOnly` and `entities: false` are not privacy filters: owned relations are still traversed, and point annotations can expose type identifiers. Publication must filter before calling the exporter.

These are demonstrated dependencies of publishing. They do not justify migrating collections, clipboard flows or the existing offline archival viewer.

## 3. User workflow and publication profiles

Entry points are **Publish document…** and **Publish directory…** in existing Flint menus. A SolidJS dialog edits options, displays service results and follows progress; it does not orchestrate the build. No subscriptions to ordinary text edits or document snapshots are added.

1. Choose scope and a publication profile.
2. Request a bounded inventory and public-content review from the service.
3. Review included documents, proposed URLs, assets, semantic disclosures, exclusions, unresolved links and conversion losses. Change options and regenerate review when necessary.
4. Explicitly approve the review digest and start the build. Show that work continues if the dialog/browser closes while the host remains running.
5. Inspect progress, cancel, or rediscover an interrupted job through the Cavern job list.
6. Preview the completed release and explicitly export it. No remote deployment is implied.

Only **saved native revisions** are inputs. If an included open document is dirty, offer **Save through the existing command and review again**, **Use saved version**, or **Cancel**. Do not silently save, capture unsaved repositories, mark tabs clean, modify history or manufacture temporary native documents. Unopened documents use the same saved-read service.

Profiles are versioned private configuration under `.mutable/publications/`, written only by explicit profile operations with revision conflict checks. They are not standoff properties or document content. A profile contains scope rules, public titles/routes, exclusions, theme tokens, ordering, language, link policy, semantic disclosure fields, search options and an optional deployment base path. Every job pins an immutable profile version and resolved scope.

Approved Stage A clarification: one Cavern supports multiple independent sites. Each site has a stable identity, its own scope/profile, public URL namespace, active release and retained release history. A document may belong to several sites with different policies. Public routes are profile-owned: ordinary document edits, title changes and renames cannot change them. Changing a route requires an explicit reviewed profile operation. Rebinding a renamed native file must verify its existing resource identity.

Stage A establishes the complete Select → Review → Build → Preview → Export workflow through a modest Flint dialog. Advanced theme controls, navigation, search and semantic interactions remain in their planned later stages.

Initial presets:

| Preset | Content and behavior |
| --- | --- |
| **Public Reading — default** | Visible reading content, supported formatting and approved local PNG/JPEG images; directory navigation and local search. No entity data, raw sources or archive attachments. |
| **Public Research — explicit opt-in** | Reading output plus individually reviewed semantic fields and in-scope occurrences. Scope and field allowlists remain mandatory; this is not permission to publish the knowledge database. |
| **Static Reading** | Reading output with no JavaScript. HTML navigation and document contents work independently; interactive search/cards are omitted. |

Saving a profile does not approve future content. Each build receives a fresh review digest. Directory additions appear at the next review; a running job never expands its frozen membership.

## 4. Scope and privacy projection

Inventory is limited to the selected native document or Cavern-relative directory. Subdirectories are explicitly included/excluded in review. No symlink following, hidden infrastructure traversal or automatic inclusion of linked documents. Non-native files are reported; importing them remains the existing explicit interchange operation.

Construct an operation-local **public MutableFragment** from the saved native input. This reuses the existing document model; it is not a second persisted document model. Walk approved reading placements, preserve their reading order and apply exclusions before deriving anything else.

| Source material | Default public treatment |
| --- | --- |
| Text, headings, lists, tables, basic inline formatting | Semantic HTML through the existing exporter; report unsupported layout/formatting. |
| PageBlocks, owned margins and embedded reading content | Enumerate in review; include approved reading regions in an explicit semantic order. Non-reading ownership edges do not imply publication. |
| Entity/time/claim annotations, point annotations and arbitrary annotation attributes | Omit their metadata and special controls, retaining underlying text. Research mode adds only reviewed semantics. |
| Unreachable definitions, deleted/retained content, unknown authored carriers, PackageDataBlock rows | Exclude entirely from public output, including JSON, comments, search, filenames and diagnostics shipped with the site. |
| MarkdownBlock / HTMLBlock | Convert source through existing parsers and semantic fragments. Publish sanitized semantic content, not authoritative source, original CSS, scripts or an editor preview iframe. Report fidelity losses. |
| Legacy HTML Blocks | Separate explicit adapter/policy; never reinterpret them as the new source Block type. Unsupported content is omitted or represented by an approved neutral placeholder. |
| Linked/transcluded content outside the approved scope | Do not acquire or follow it. Show a diagnostic and approved placeholder/text unless the user expands scope and reviews again. |
| VideoBlocks and remote image descriptors | No network acquisition or player loading. Use reviewed external links/alt text; local managed images are handled separately. |

Source-Block publication needs a small read-only adapter because the current semantic exporter does not reconcile collection source attachments. Reuse the existing Markdown/HTML ASTs and exact imported binding evidence to produce the public fragment and asset map. Do not modify source text or use the raw-source collection export as a shortcut.

Filtering applies to every output channel: page text, titles, URL paths, alt text, navigation, search snippets, entity data, HTML attributes and public manifests. Internal resource IDs, Cavern IDs, absolute paths, source filenames not selected as routes, provenance records and arbitrary payload fields stay private. Block/document exclusions remove content structurally; CSS hiding is not redaction.

The review shows the actual projected disclosures and affected counts, not a full side-by-side editor. It warns that public titles, relative routes, outbound URLs and original image metadata can reveal information. Original images remain byte-identical; metadata stripping would require a separately approved derived-resource workflow. Users can omit an image or supply a separately sanitized original.

Only explicit, validated outbound HTTP(S) links are enabled initially; disallowed schemes and unresolved internal targets retain readable text with diagnostics. No automatic requests are made to verify links. Authored links, labels and metadata are escaped. Unsupported semantics are never silently activated.

Public static artifacts are readable by anyone who obtains them. Exclusions and review prevent unintended inclusion; they do not provide access control or retract copies already distributed.

## 5. Single-document and directory output

Both scopes use the same planner and generator. A single document emits `index.html` plus required local assets and optional search/semantic files. A directory emits a site index and pages beneath reviewed relative directories. Use explicit `.html` links so hosting does not require rewrite rules.

Two passes precede rendering:

1. Freeze membership and saved hashes; allocate all public routes, document/block anchors and asset destinations.
2. Resolve references against that allocation, project content and generate pages. References never expand the inventory.

Use authored identities and explicit imported collection bindings as relationship evidence. Resolve a heading/block fragment only when its exact target is unambiguous. Do not guess from a basename, title or a wiki-link spelling that import left unresolved. Preserve readable unresolved text and report missing, ambiguous, excluded and out-of-scope destinations separately. Known in-scope targets receive relative links; external destinations require an explicitly reviewed public URL mapping.

Route allocation validates case-insensitive and Unicode-normalized collisions, reserved filenames, encoded traversal and collisions with generated directories such as `assets/`, `search/` and `entities/`. Default to deterministic suffixes and show them before approval. Persist approved route mappings in the profile; title edits do not silently change URLs. Route changes invalidate affected links and require review; old URLs are not retained as automatic redirects that might disclose excluded content.

Use stable publication-local opaque aliases for document, annotation and entity anchors. Derive them deterministically from a private site namespace and canonical identity, checking collisions. Keep the reverse map private. Do not expose canonical identifiers or use traversal counters as permanent public anchors. Reproducibility assumes the same pinned site namespace and approved route map.

## 6. Themes, navigation, search and semantic interactions

### Themes and navigation

Provide two bundled themes, **Reader** and **Compact**, sharing the same semantic templates. Expose bounded CSS tokens for colors, system-font choices, reading width, spacing and light/dark preference. Themes cannot supply scripts, arbitrary HTML/CSS, external fonts or network resources. Preserve accessibility, responsive layout, visible focus, sufficient contrast and reduced-motion preferences.

Navigation consists of a directory tree/index, breadcrumbs, document heading contents and optional previous/next links. Default order is normalized relative-path order; profiles may explicitly reorder items. All navigation derives from included public documents. Core reading/navigation works without JavaScript. Publishing does not reuse the editor's surrounding chrome, Three.js renderer or live document repository.

### Search

Generate a static, bounded search index solely from projected public titles, headings and text; approved semantic names can be included in Research mode. Do not query or export the Cavern's full text/entity index. Excluded source text, PackageData rows and private metadata never enter search inputs.

Use a small pure TypeScript tokenizer/index builder and a bundled browser search module. Initial matching supports normalized Unicode words, case-insensitive terms, title/heading weighting and deterministic result ordering; advanced linguistic analysis, fuzzy matching and semantic/AI search are outside this phase. Index entries use public IDs and URLs.

Build per-document index contributions, merge in bounded shards, and load shards lazily. Browser queries are coalesced and stale results discarded. Enforce index and query/result limits; report over-budget content rather than silently truncating searchable documents. With JavaScript disabled, retain directory/contents navigation and state that interactive search is unavailable. No analytics, remote search, service worker or persistent visitor database.

### Semantic entity interactions

Research mode supports accessible entity/time/claim references with static detail pages and optional lightweight popovers. Initial public fields are the reviewed display name, a reviewed kind label and references to occurrences in included pages. Descriptions, aliases and claim statements are individually opt-in; relationship, evidence and actor disclosure is off by default. Any newly disclosed participant name must appear in review.

Reuse existing PackageData extraction for directly referenced targets. Retain its bounds: at most 500 combined entity/claim seeds, 5,000 rows and 8 MiB of extracted values for one live-context snapshot. For the initial implementation, exceeding the union seed limit requires narrower semantic scope or Reading mode; do not silently batch inconsistent database snapshots or remove the limits.

Where a document carries a frozen PackageDataBlock context, the profile explicitly chooses that context or current-Cavern data. Never silently enrich frozen records from live data or merge foreign identities without provenance. Namespace context-specific identities privately, record the chosen context hash, and project only reviewed fields. Frozen contexts are bounded individually and by the overall review budget.

The public semantic DTO is a small read model, not raw SQLite rows or a new document model. The runtime reads only generated local files. It has no Cavern credentials, database connection or editor bridge. Static detail links remain useful without scripts. Existing SVG underlines and other editor-only effects may receive an approximate semantic style with a conversion diagnostic; the interactive annotation renderer is not shipped.

## 7. Application-service design and durable orchestration

**Vault context and portability:** A Vault owns the complete workspace root; Cavern is its Flint presentation. Preserve logical identity independently of filesystem location and keep publication services bound to explicit authorized Vault contexts. The [desktop architecture clarification](MUTABLE_APPLICATION_SERVICES_DESKTOP_ARCHITECTURE_REVIEW.md#8-vault-identity-portability-and-future-replication) distinguishes portable site identities/profiles/routes from device-local jobs, locks, recovery receipts, caches and preview grants. Existing site records contain both categories; future replication must not treat them as an undifferentiated portable record. S3 is a future replication layer over local Vaults, not a replacement for filesystem or SQLite semantics. Archive inspection must remain isolated from active canonical knowledge and assets. These constraints require no synchronization, mounting or multi-Vault lifecycle implementation in Phase 3.6.

Keep three concerns explicit:

| Concern | Proposed responsibility |
| --- | --- |
| Contracts | Versioned scope/profile/review/job/release DTOs, diagnostic codes, expected revisions, pagination and operation outcomes. No Express requests, filesystem handles, Node classes or editor state. |
| Workflows and pure libraries | Inventory planning, public projection, route resolution, HTML generation, index construction, dependency hashing, checkpoint coordination and commit policy. Inject capabilities; reuse existing parsers/models. |
| Platform adapters | Cavern-scoped enumeration and reads, immutable assets, bounded knowledge extraction, worker execution, durable job/artifact storage, isolated preview and controlled artifact delivery. Node initially; HTTP is one adapter. |

Proposed operation families, with names finalized during implementation:

| Operations | Contract behavior |
| --- | --- |
| `publication.profiles.list/read/write` | Private versioned configuration; writes require an expected revision. |
| `publication.review.create/inspect` | Persist an explicit bounded review job; return paged inventory, proposed outputs, disclosures and a digest when complete. |
| `publication.build.start` | Require a completed review digest, profile revision and idempotency key. Persist approved intent before returning the job identity. |
| `publication.jobs.list/inspect/resume/cancel` | Paginated progress and diagnostics; explicit resume with expected revision and source/receipt revalidation. |
| `publication.releases.inspect/export` | Identify a sealed release and obtain a bounded download or application-managed folder artifact. No arbitrary filesystem destination supplied by a web client. |
| `publication.preview.open/close` | Grant/revoke access to one sealed release through the isolated platform preview adapter. |

A running publication survives browser/request disconnection. Shutdown or Cavern close stops work at a safe boundary, terminates active workers and records interruption where possible. Process crashes are detected from execution-lease availability and receipts. No automatic replay on startup. Existing `jobs.run` disconnect/cancellation semantics stay unchanged.

Publication-specific states distinguish `reviewing`, `awaiting-approval`, `ready`, `running`, `paused`, `interrupted`, `review-required`, `completed`, `cancelled` and `failed`. Pause/interruption can resume after revalidation; `review-required` needs a newly approved plan. Completion requires the durable release receipt. Retrying a start with the same idempotency key returns the same job only when its request digest matches; conflicting reuse is rejected. The old preparation state union is not reinterpreted.

### Journal and execution units

Extend `.mutable/jobs/<id>/` with a discriminated, versioned publication record format in the same job facility. Retain existing version-1 preparation readers, storage limits and behavior. Publication stores immutable approved plans, bounded source snapshots, segmented unit receipts, phase checkpoints and references to private staged output. It does not use operational SQLite tables, IndexedDB or browser file handles as recovery authority.

Units are inventory batches, individual document projections/pages, individual assets, bounded search/semantic shards, manifest validation and release commit. Each receipt records its input fingerprint, policy/tool versions and output paths, sizes and hashes. Publish output files durably before their completion receipt. Recovery accepts a unit only after verifying both; incomplete stages are never public. A missing phase acknowledgement can be reconstructed from validated receipts without repeating completed units.

Use short metadata locks and a job execution lease; serialize publication commits for the same site with a site lease and expected active-release revision. Do not hold a global filesystem writer lock while converting documents. Segment receipts so a thousand-document site does not consume a preparation checkpoint per file or require loading its entire history on every progress request. The new format has its own explicit bounds; old journals require no migration.

Share the bounded executor across publication and preparation to avoid multiplying CPU/memory limits. Initially allow one active publication and one active CPU worker per host, at most two queued worker tasks. Tasks retain the 30-second deadline; a document that cannot complete within existing conversion/fragment limits fails explicitly. Site jobs span many tasks and checkpoints. A 30-minute active-work allowance yields a resumable pause, rather than increasing one worker's deadline to site length.

The frontend only observes paged progress while the publishing UI is open. It may coalesce status updates; closing it unsubscribes. Host workers and progress must never trigger editor snapshots, geometry work, backlink refreshes, saves or Undo entries.

## 8. Consistency, publication and recovery

Review captures bounded saved inputs and their hashes privately, plus the selected knowledge snapshot and public projection policy. Build uses those pinned inputs. Revalidate source hashes, approved mappings and live-context extraction digest at start, resume and before commit. A changed approved source/context requires a new review; unchanged unit outputs may be reused only after approval of the new plan. New directory entries are not silently added to a frozen selection.

Live-context comparison hashes canonical logical data and extraction options, with stable table/row ordering. Exclude operational provenance such as the extractor's `exportedUtc` and query metrics, which otherwise change on an identical read. Retain the original extraction privately for audit; do not change the archival extractor's format. Public dependency hashes use the approved projected fields, while the private review records which source context was checked.

These checks establish the exact reviewed revisions used in the output; they do not promise an atomic transaction across all native files and SQLite. Do not hold a database transaction open throughout a site build. Frozen contexts are compared by their captured hashes; live extraction is repeated only at explicit consistency boundaries, never on typing.

Proposed layout separates private inputs from deliverable files:

```text
.mutable/jobs/<job-id>/                 private plan, snapshots, receipts, diagnostics
.mutable/publications/<site-id>/
  profile records / private cache      never served or exported
  staging/<job-id>/                     incomplete output, never served
  releases/<content-digest>/public/     sealed public files only
  active release record                private durable commit receipt
```

The release manifest lists every public file and digest. Generate a fresh complete file tree, validate paths/content/budgets, seal it, then publish the active-release record with expected revision and existing durable filesystem primitives. If the existing adapter lacks a needed directory/record primitive, add it narrowly and qualify it; do not assume cross-platform directory replacement is automatically atomic.

The manifest is the serving/export allowlist. Private plans, error messages containing source paths, native files, caches and raw archival contexts can never be reached through the release root. A failed build leaves the previous release unchanged. Default behavior is **all approved documents or no new release**; document failures cannot silently create a partial public site. Users may exclude failures and approve a new review.

Before commit, cancellation stops work and retains private recovery evidence. After a successful commit, cancellation reports completion rather than promising to undo publication. A lost response is reconciled using the release digest and durable commit receipt. Interrupted jobs require explicit resume and reject corrupt evidence, incompatible tool versions, changed sources or changed site revisions. A cancelled job is terminal; a new approved job may reuse verified artifacts.

Retain completed releases conservatively. Show retained bytes and provide explicit deletion of an unreferenced release/job with lease checks; never delete managed asset originals. An older release may contain content removed from a new one: expose only the selected release, revoke its preview grants on deletion, and make historical retention visible. No automatic garbage collection or automatic rollback to a formerly public revision.

## 9. Assets, portable output and determinism

Retrieve only referenced, approved managed PNG/JPEG originals through the existing asset service. Verify identity/hash/media type, deduplicate once per release, and use `assets/<content-hash>.<extension>`. Keep original bytes, even across incremental builds. No automatic remote acquisition, image transformation, arbitrary media activation or data-URL inflation of large images. Missing or corrupt required assets block completion unless the user explicitly approves omission/placeholder in a new review.

Generate relative links and keep the chosen deployment base path in the profile. The same public tree can be served by a conventional static HTTP server without Mutable services. An optional bounded ZIP is a delivery wrapper, not the site model or `.inkpkg`; reuse archive validation/path helpers with a separate publication policy and normalized ZIP timestamps. Leave existing archive defaults/limits unchanged. Larger sites remain folder artifacts; do not assemble them as browser Blobs.

In the current browser-hosted environment, the service owns the generated folder and offers a capped download plus its application-managed export location. A future native destination picker supplies a scoped capability grant, not a raw arbitrary path in the contract. Do not add Electron/Tauri dialogs now or silently overwrite user-selected directories.

Determinism covers all public file bytes and relative paths given identical reviewed inputs, profile/namespace, theme/exporter versions and deployment base. Sort canonical JSON keys, inventory entries, nav ties and semantic/search output deterministically; use a specified tokenizer/normalization version. Wall-clock timestamps, job IDs, machine paths and random execution data belong only in private receipts. Release identity hashes the canonical public manifest, excluding its own digest field.

## 10. Incremental builds

Maintain a private dependency manifest keyed by saved document hash, public-policy/profile hash, selected context hash, asset hashes, routes/anchors and generator versions. Reuse a page or index contribution only when all relevant dependencies and output hashes match. Reuse is an optimization, never a substitute for current privacy review.

| Change | Required invalidation |
| --- | --- |
| Saved document content | Its projection, page, search contribution and semantic occurrences; dependants if anchors/links change. |
| Public route or inclusion | Navigation and affected inbound links; removed documents disappear from every public index and output. |
| Semantic disclosure/context | Affected semantic pages, references and search contributions. |
| Theme tokens/templates | Theme assets and pages depending on them; not native conversion unless its contract changes. |
| Asset bytes/reference | Affected asset and pages; content hashes prevent accidental substitution. |
| Exporter/policy/tokenizer version | All outputs governed by that version. |

Build a fresh release manifest from the current approved scope; never copy an old site directory wholesale. Shared cached artifacts cannot resurrect an excluded page, old search shard or removed entity. Validate reused files against receipts. An empty, corrupt or incompatible cache falls back to a full build. **A full build and an incremental build of the same approved inputs must produce identical public bytes.**

No background watch/build on edits or saves in this phase. Users explicitly request another build; the service determines reusable work outside the editing path.

## 11. Local preview and web security

Preview serves only a sealed release through a dedicated loopback origin and a narrowly scoped, expiring preview grant. It does not mount the Cavern root or share application-service routes. Use validated Host headers, manifest-based path lookup, traversal/symlink rejection, correct MIME types, `nosniff`, no directory listing, no permissive CORS and a no-referrer policy. Preview access tokens remain outside public artifacts and operational logs redact them. Closing preview or the Cavern revokes its grant. Open the preview without an opener relationship to Flint.

Different ports form different origins, but origin separation alone is not a filesystem permission or CSRF boundary. Preview has no document-writing endpoints or credential bridge; qualify isolation against the authenticated app, including attempted requests to its APIs. Browser `file:` origins are implementation-dependent, so supported interactive preview uses HTTP rather than relying on local-file fetch behavior. [MDN: same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy).

Generated pages use trusted bundled scripts/styles only, escaped data, and a restrictive CSP: no authored scripts, inline handlers, frames, forms, objects, remote fonts or remote fetches. Local search data is fetched only from the site itself. Sanitize before HTML generation; CSP is additional protection rather than a substitute. Supply an early HTML policy and recommended HTTP headers; directives requiring headers must be applied by the preview adapter and documented for deployment. [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP).

No arbitrary source HTML/CSS, generic plugin scripts or untrusted content on the app origin. Native desktop adapters will provide equivalent static serving without exposing privileged IPC to the published runtime. Static HTML reading should remain useful when opened directly, but interactive search/semantic file loading is qualified under HTTP. Existing Stage C offline-viewer behavior is unchanged.

## 12. Initial resource limits and performance expectations

These are proposed admission ceilings, not measured throughput promises. Keep stricter existing parser, fragment and native limits where applicable; never quietly truncate a site to fit.

| Resource | Proposed initial policy |
| --- | --- |
| Scope | 1,000 native documents; 5,000 inventoried entries; at most 512 MiB of captured native input; 8 MiB per native document. |
| Source Block conversion | Existing parser limits, including the preparation conversion ceiling of 200,000 UTF-16 code units per conversion task. Report oversized Blocks explicitly. |
| Original images | PNG/JPEG only; at most 10 MiB each, 2,000 distinct assets and 512 MiB total. |
| Knowledge projection | Existing 500-seed / 5,000-row / 8 MiB live extraction limits; at most 16 MiB of captured context data across frozen and live sources per job. |
| Public artifacts | At most 10,000 files / 2 GiB; HTML page at most 16 MiB, subject to stricter exporter limits. |
| Search | At most 32 MiB generated index, 1 MiB per shard; query at most 256 characters / 16 terms, first 100 results. A 4 MiB browser shard cache and cancellable query work. |
| Durable job data | At most 20,000 unit receipts in bounded segments, 256 phase checkpoints and 4 GiB private/staged retained bytes per job; explicit refusal before exceeding limits. No increase to version-1 job limits. |
| Execution | One active publication/CPU worker per host, two queued tasks, existing worker memory/input limits, 30 seconds per task. Pause after 30 minutes of active job work for explicit continuation. |
| Delivery | ZIP only when both expanded inputs and compressed result fit the separate 64 MiB delivery budget; otherwise use the service-generated folder. |

Stream/copy files individually and spool intermediate contributions; do not hold all native documents, images, HTML or ZIP members in memory. Bound host manifests and receipt pages separately. Check storage budgets before each publication, and handle disk-full failures without changing the active release. Initial limits may be lowered during qualification if measured memory or responsiveness requires it; raising them requires evidence and documented review.

No claimed whole-site completion time before representative benchmarks. Report wall time, peak host/worker RSS, output sizes, reused-unit counts and cancellation latency for small, medium and admission-limit fixtures. Worker V8 limits do not alone bound process RSS. Measure typing while a real build runs; isolated workers still compete for machine resources.

## 13. Implementation sequence and qualification gates

The following stages are proposed for approval. No stage starts from this document alone. Implement in reviewable increments, recording qualification before moving to the next agreed stage.

| Stage | Deliverables | Required gate |
| --- | --- | --- |
| **A — Safe single-document publication** | Feature flag; typed profiles/review/build operations; publication job record and host-owned execution; public projection; semantic page/theme shell; immutable release commit; minimal isolated preview and bounded export. | Privacy and service-boundary tests; source/asset fidelity; crash/cancellation/commit tests; unchanged manual save and editor behavior. |
| **B — Directory publication** | Two-pass scope/routes, explicit relationship resolution, navigation, bounded unit receipts, restart/resume and folder output. | Nested/duplicate/ambiguous-link fixtures; 1,000-document bounded execution; partial-failure and concurrent-host tests; no incomplete public release. |
| **C — Reader experience** | Reader/Compact themes, bounded theme settings, local search, Research profile and reviewed semantic detail pages/popovers. | Accessibility and no-script reading; excluded-data canaries in every output; context provenance; network-inert site runtime; search limits. |
| **D — Incremental builds and final qualification** | Dependency reuse, profile/route changes, retained-release maintenance, full preview/export validation and consolidated report. | Full/incremental byte equivalence; deletion/privacy invalidation; browser/host performance and recovery qualification; explicit user acceptance. |

Implementation belongs primarily in shared publication libraries, application-service workflows and narrowly scoped Node adapters. Add only the publication dialog/menu integration in SolidJS. Any proposed change to a qualified Phase 3.5 workflow must identify the concrete dependency and preserve its tests/behavior; no opportunistic refactoring.

Required qualification matrix:

- **Content:** single text document, PageBlocks/margins, nested directories, Unicode/case collisions, duplicate titles, explicit wiki bindings, ambiguous/missing/out-of-scope links, crossing annotations, unsupported Blocks, source Blocks and legacy HTML, passive video and original images.
- **Privacy/security:** unique canary strings in excluded text, retained definitions, annotation attributes, PackageData rows, source metadata and filenames; assert absence from every public byte/path/search shard. Exercise hostile markup, URI schemes, CSS, serialized data, malformed IDs, traversal/symlinks, excessive input and preview-to-app attacks. Check original-image metadata warning and absence of network acquisition.
- **Durability:** terminate at each staged-file/receipt/manifest/commit boundary; lose acknowledgements; corrupt receipts; fill disk; change sources/profile/context/site revision; close browser/Cavern; cancel queued/active work; compete from two hosts. Verify recovery and that the previous release stays intact until commit.
- **Determinism/incremental:** shuffled input order and repeat builds yield identical output; theme, route, scope, asset and knowledge changes invalidate correctly; deleted content never survives through caches or previous indexes. ZIP metadata is normalized.
- **Browser behavior:** real Chromium, Firefox and WebKit/Safari where available, recording actual versions and untested cases. Verify nested-base-path hosting, isolated preview grants, keyboard/screen-reader semantics, no-script fallback, bounded search, downloads and no unintended requests. Do not claim cross-browser qualification from Chromium alone.
- **Editor preservation:** matched real Flint typing runs with feature off, on idle and on during real publication, reversing run order and recording median/p95. Assert zero per-keystroke publication calls, snapshots, geometry scans, save-status scans and history entries; verify caret/selection/IME and manual save. Investigate repeatable regression; do not optimize unrelated editor code to hide it.
- **Regression:** existing foundation native/asset/PackageData/job tests, applicable Phase 3.5 export/package/collection tests, type checks and client/server builds using existing commands. Preserve known unrelated compatibility and video-playback follow-ups.

Produce `MUTABLE_PHASE_3_6_QUALIFICATION.md` with implementation boundaries, commands, fixtures, actual browser results, performance, failure/recovery evidence and remaining limits. Windows/Linux durability and desktop packaging are not implied by a macOS qualification.

## 14. Recommended decisions for approval

Approve saved-native inputs; explicit scope and privacy review per build; Public Reading as default; two bundled themes; no automatic remote fetching or player activation; minimal opt-in semantic disclosure; host-owned durable publication jobs; additive publication journal records; immutable complete releases; explicit incremental builds; isolated loopback preview; and static folder/bounded ZIP delivery without provider deployment.

The Application Services Foundation remains accepted and complete. This document proposes only the publishing-specific extensions needed to use it. Phase 3.5 remains unchanged, and Phase 4 and Electron/Tauri packaging remain separate projects.

**Current approval gate:** Stage A and the Vault architecture amendment are accepted. The authorized Stage B — Directory Publication implementation is complete: directory scope, two-pass route/link resolution, navigation and durable multi-document jobs. Its [qualification report](MUTABLE_PHASE_3_6_STAGE_B_QUALIFICATION.md) records the tests, browser checks, 1,000-document execution, typing measurements and limitations. Stage B now awaits acceptance. Stages C–D, Phase 4 and Electron/Tauri packaging require separate authorization and have not begun.
