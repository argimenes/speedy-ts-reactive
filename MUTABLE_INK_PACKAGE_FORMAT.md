# Mutable Ink Package v1 — archival interchange specification

Status: Stage C implementation. Application flag: `documentInterchange` (existing, default on). This is an archive and copy-import format, not a database restore or synchronization protocol.

## Container and members

An `.inkpkg` is a ZIP containing exactly the members declared in `manifest.json`, plus that manifest. Required paths:

- `resources/document.ink`: unchanged native `mutable-document` envelope from the resource ownership capture, including unplaced retained definitions, placements, internal relations, linked definitions and zero-width annotations. The existing native format version and `valueEncoding` govern its interpretation.
- `data/package-data.json`: versioned `mutable-package-data`, read-only auxiliary resource.
- `schemas/knowledge-schema.json`: versioned `mutable-knowledge-schema`.
- Optional `assets/sha256/<64 lowercase hex>.png|jpg`: validated immutable originals, never recompressed derivatives.

The manifest declares `kind: "mutable-ink-package"`, `version: 1`, `profile: "mutable-inkpkg-passive-v1"`, `entry: "resources/document.ink"`, `source` with originating resource ID and optional Cavern ID, `members`, and explicit `boundaries`. Every member has `path`, `role`, `mediaType`, exact byte count `bytes`, and lowercase SHA-256 hex `sha256`. An original-asset member additionally has its source managed reference `{kind:"managed",cavernId,assetId:"sha256:<digest>"}`. Roles are exactly `document`, `package-data`, `knowledge-schema`, `original-asset`; the first three occur once. Hashes provide integrity, not authenticity or authority.

Source identities are preserved in the archive. The document bytes are the current authored native snapshot (including unsaved edits), not a claim to reproduce historical disk whitespace. The database slice is a separate consistent read-only transaction. Its provenance includes the captured document SHA-256; export checks that the local document and Cavern did not change during the operation. It does not claim a simultaneous distributed snapshot of file and database history.

No executable viewer is included in an archive. The separately built trusted viewer is distributed as `Ink Viewer.html` and loads only local selected packages.

## SQL transport, reconstruction and provenance

`package-data.json` contains `kind`, `version:1`, `readOnly:true`, `encoding:"sqlite-storage-class-v1"`, `provenance`, `selection`, `tables`, `unresolved`, `excluded`, and optional extraction `metrics`.

Each table has its exact SQL `name`, an explanatory `classification`, ordered `columns`, and `rows` as arrays in that column order. Each value is a tagged array:

| SQLite storage class | JSON encoding |
| --- | --- |
| NULL | `["null"]` |
| INTEGER | `["integer","-9223372036854775808"]` — decimal signed int64; never a JSON number |
| REAL | `["real","400921fb54442d18"]` — eight IEEE-754 binary64 bytes, big-endian lowercase hex |
| TEXT | `["text","original Unicode text"]` — no normalization, trimming or JSON reinterpretation |
| BLOB | `["blob","AP8="]` — standard padded base64 |

Tagging every value avoids collisions with authored JSON objects. JSON-valued SQL TEXT remains the original SQL string, including its whitespace and authored-value encoding tags. Invalid UTF-8 SQL TEXT is rejected rather than replaced. Identifiers are case-preserving and are data, never executable expressions.

The schema resource records `applicationId`, `userVersion`, exact `SchemaInfo` key/value rows, and per-table original `CREATE TABLE` SQL, `PRAGMA table_xinfo` column metadata, `PRAGMA foreign_key_list`, and named index SQL (automatic index SQL may be null). Table DDL preserves CHECK, UNIQUE, primary/foreign-key, default, STRICT and nullability semantics. Index descriptions preserve available access paths. FTS triggers/shadow tables and operational audit/index state are deliberately not included; their effects are not necessary to reconstruct selected canonical rows. SchemaInfo may describe the broader source schema whose rebuildable objects are excluded.

An independent reconstruction utility can: inspect/review DDL; create the selected tables in an empty database; bind decoded storage values into explicitly named columns; restore indexes; and run `foreign_key_check`. Do not execute DDL from untrusted archives without an independent security boundary. The Mutable application and viewer **never execute packaged SQL**. Original SQL IDs and relationships remain evidence even when a dependency is absent.

## Selection and privacy

Authored `codex/entity-reference` and `codex/time-reference` occurrences and linked definitions seed Entity GUIDs (Time is an Entity extension). `codex/claim-reference` directly seeds Claim GUIDs and their required participants/qualifiers. Duplicate seeds are coalesced. By default the extractor includes matching Entity rows, Time extensions, and curated/imported EntityAlias rows. Complete rows may contain private descriptions, JSON attributes and actor identifiers; review precedes download.

Optional, initially unchecked inclusion policies:

- One-hop Relationship rows touching original seeds, with endpoint Entity records.
- Claims touching original seeds through ClaimParticipant/ClaimQualifier, with their complete participant and qualifier rows and endpoint Entities.
- ClaimEvidence (requires Claims), preserving resource/block IDs and historical content hashes. Historical source documents are not acquired or verified.
- Actor rows named in included records.
- Observed/recovered aliases.

Endpoint entities do not become new expansion roots. No backlinks, recursive graph expansion, unrelated files, audit history, outbox, derived Resource/Block records, FTS or schemaless attribute references are followed. Canonical recoveryState and alias origin remain exact; observed aliases are not relabeled authored. The schema has no Trait table: typed Trait claims and authored attributes are displayed as such. DataPointDimension lacks an entity-first index; arbitrary-role entity-to-datapoint discovery is explicitly excluded instead of scanning it. DataPoint/DataSet schema remains interpretable, but empty tables do not claim that no related records exist.

Unavailable seeds are listed in `unresolved`. Policy exclusions, absent actor records and evidence dependencies are explicit. Privacy scope does not redact individual row fields silently: excluding an Actor row does not remove an actor GUID already present in an included Entity row. Raw authored document metadata remains part of the native archive; users must review whether that document is suitable for sharing.

## Bounds and untrusted input

ZIP: 64 MiB input, 96 MiB actual output, 256 members, 100:1 per-member and aggregate expansion. Manifest: 256 KiB. Native and each data/schema member: 8 MiB. Images: 20, 10 MiB each, 40 MiB aggregate. Database: 500 combined Entity/Time/Claim seeds, 5,000 selected rows, 8 MiB encoded values. Existing fragment limits also apply to copy import and semantic viewer projection. Operations run in terminable workers with a 30-second client deadline.

The v1 reader accepts stored or deflate members with exact ASCII paths. It rejects encrypted/split/ZIP64 archives, comments, data descriptors, unsupported flags/extras (only bounded extended timestamps are accepted), nonregular files, traversal, backslashes, encoded paths, duplicate or case/NFC-colliding names, unlisted data, local/central header discrepancies, CRC/hash/length mismatches, duplicate roles, missing or unreferenced originals. Some otherwise valid generic ZIP files are intentionally outside this controlled format profile. Exports use stored members so compressible native JSON never violates the expansion ceiling. `fflate` 0.8.3 supplies maintained ZIP writing and incremental inflation; admission checks occur before inflation, and actual output is counted. No archive pathname is extracted to a filesystem.

Image validation checks the admitted original again on destination publication. The viewer checks PNG/JPEG signatures and package hashes and never requests remote content. A missing managed original prevents package or self-contained export. Legacy/unmanaged image descriptors can be archived with an explicit missing-binary inventory warning; this is a degraded archive, not a claim that their binaries are present; projection placeholders are available through the existing ordinary semantic export, clearly distinct from “with assets.”

## Copy import and offline reading

Import creates one unsaved native Document through existing fragment/history insertion. Blocks, placements, cells, properties, linked definitions and resource identity are fresh. Typed internal references are remapped; opaque authored bags are not globally string-replaced. Retained definitions remain outside reading order. The imported PackageDataBlock is retained under the new document as inert context, retaining original SQL identities. It does not populate or reconcile the destination knowledge database, even if a source GUID happens to match a destination Entity. Foreign semantic annotations are opaque. The Document menu exposes the frozen context inventory; the offline viewer supplies clickable entity-context reading.

The archive is retention-complete native evidence; the imported safe copy applies the existing passive allowlist. Unsupported/active types and foreign targets become opaque, preserving safe authored data. Executable style fields on supported Blocks are inactive, not applied. Plugins cannot activate imported unsupported types. Non-JSON native authored values are preserved using the existing `codex-authored-value-v1` encoding in an inert `packageAuthoredSource` carrier whose `value` is the JSON text of the encoded original payload (including undefined, non-finite numbers and negative zero); the JSON-only presentation sees safe placeholders. This is deliberate inactive preservation, not automatic reinterpretation. Existing complexity/opaque-object limits still reject oversized copies without partial insertion.

The viewer uses a pure in-memory table adapter, the native decoder and safe semantic presentation. It has no editor, database, migration, graph, persistence or network client. It presents Entities, Time, aliases, relationships, claims, roles, qualifiers and available evidence using actual table/column fields; original attributes are shown verbatim. Missing records and export boundaries remain visible. Unsupported SVG/layout/active presentation degrades with diagnostics. A blob worker owns validation/render preparation; opening another package, closing, timeout and page teardown terminate it and revoke its URL. Image data URLs refer only to validated package originals and are released with the displayed document. Local source refresh is never performed by the viewer.

## Other Stage C operations

“Export HTML/Markdown with assets” writes a projection ZIP with relative original-image paths; “Export standalone HTML” embeds originals as data URLs with a 20 MiB final limit. Neither projection contains a hidden native payload or database slice. “Open native Ink”, “Import external”, “Embed source”, “Link to source” and “Import Ink package” retain their different ownership and save semantics.

Local source links persist only version, linkId, basename, format, accepted byte hash and accepted decoded-text hash. File handles and absolute paths are not persisted. Refresh uses explicit file reselection and rebind confirmation, compares the source baseline and current local text, and offers replace/separate/cancel on conflicts. Source and baseline update in one undo transaction; ordinary typing performs no hashing, preview, file reads or refresh. The external source is never overwritten.
