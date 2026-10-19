# Milestone E — execution matrix

19 October 2026. Implementation and qualification complete; accepted by the user and closed. See the [qualification report](MUTABLE_ACADEMIC_RESOURCE_LOADERS_MILESTONE_E_QUALIFICATION.md) for evidence, supported subsets and deferred maintenance candidates. The execution plan below is retained as the historical implementation scope. The supplied Milestone E brief is authoritative. TEI, AI ingestion and OCR generation are excluded. Existing Milestones A–D and accepted F remain intact.

Use one default-enabled `deterministicAcademicResources` flag. Reuse scoped services, protected acquisition, durable jobs, immutable originals, native fragment/history operations, explicit canonical review and package closure. No loader work belongs on ordinary typing. Provider assertions are unreviewed source data; identifiers do not imply cross-provider equivalence.

| Slice / input | Output and identity | Original / initial bounds | Required qualification |
| --- | --- | --- | --- |
| E1 ORCID iD / profile URL | Public researcher record; explicit Person linking | Official record JSON, 2 MiB; bounded affiliations/works | Check digit, private/missing/rate limit, conflicting identity, live record |
| E1 arXiv modern/legacy ID or abstract URL | Version-pinned preprint citation; explicit PDF candidate | Atom response, 2 MiB; one requested entry | Version agreement, legacy ID, no DOI merge, live metadata |
| E1 PMID / PMCID / official URL | Distinct citation and full-text resource identities | NCBI XML, bounded metadata; rights and candidates retained | Namespace separation, absent full text, live provider |
| E1 ISBN / Open Library ISBN URL | Edition/product citation; supplied Work links remain proposals | Provider JSON, 2 MiB; one edition | ISBN-10/13 checksum, binding/edition differences, live metadata |
| E2 BibTeX / RIS file or explicit clipboard resource import | Citation entries with stable source keys, source fields and diagnostics; explicit selected export | Exact file, 2 MiB / 200 records | Macros, concatenation, repeated/multiline fields, Unicode, round trips, conflicts |
| E3 ALTO / PAGE local or explicit HTTPS XML | Page/region/line/word projection, coordinates, source/run-aligned Ink derivative; explicit image/canvas binding | Exact XML, 8 MiB / depth 64 / 100,000 elements / 1,000,000 text units | Namespaces, entity/DTD rejection, order uncertainty, geometry and persisted anchors |
| E4 EPUB 2/3 file | Chapter/spine navigation, safe reading, source/chapter/fragment-aligned Ink extraction | Exact ZIP; 32 MiB compressed / 64 MiB expanded / 1,000 members; ratio 100 | OPF/container, navigation, local images/links, DRM/active content/path/bomb rejection, annotations |
| E5 all formats | Native save/reopen, fresh package occurrences, retained source provenance and offline views | Existing package and service budgets also apply | Cross-Vault closure, recovery/cancellation, A–F regression, real browser, matched typing |

## Dependency and provider choices

Reuse existing fflate ZIP machinery, semantic HTML conversion, CodeMirror source presentation and PDF/IIIF infrastructure. Evaluate namespace-aware `saxes` for bounded XML and `@retorquere/bibtex-parser` for BibTeX instead of writing either grammar. RIS requires a small bounded tag-record adapter preserving repeated fields. EPUB uses the existing strict ZIP reader with a scoped policy and XML/HTML libraries, avoiding an ebook runtime with network or script activation.

Primary references: [ORCID public record API](https://info.orcid.org/documentation/api-tutorials/api-tutorial-read-data-on-a-record/), [arXiv Atom API](https://info.arxiv.org/help/api/user-manual.html), [NCBI E-utilities](https://www.nlm.nih.gov/dataguide/eutilities/utilities.html), [Open Library APIs](https://openlibrary.org/developers/api), [ALTO](https://www.loc.gov/standards/alto/), [PAGE](https://github.com/PRImA-Research-Lab/PAGE-XML), [EPUB](https://www.w3.org/TR/epub-33/). Live availability and dependencies are qualified separately from fixture correctness.

Reviewable slices are E1 identifiers/services, E2 bibliography, E3 OCR, E4 EPUB, then E5 integration/qualification. Do not label the milestone complete until the full matrix is implemented and tested. Record unsupported variants and failed probes explicitly in the qualification report.
