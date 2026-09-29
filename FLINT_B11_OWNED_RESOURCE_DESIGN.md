# B1.1 — owned nested Documents (design only)

**Subsequent decision:** accepted in principle. The bounded implementation and evidence are in the [B1.2 qualification report](FLINT_B12_OWNED_RESOURCE_QUALIFICATION_REPORT.md); the text below preserves the design as submitted for that decision.

**Recommendation:** support the concept of **A owning resource B while B keeps its own resource identity and native serialization boundary**. Do not classify every nested Document as a transclusion. This is a proposal for review, not implemented semantics.

There are three separate facts: which resource owns authored content, which resource owns another resource's lifetime, and which occurrence presents a resource. Stage A established that the third fact supplies no ownership. B1.1 preserves that distinction. An authored nested Document is not automatically equivalent to a Flint tab or another presentation occurrence.

## Comparison

| Question | Owned resource relationship | All nested Documents are references |
|---|---|---|
| Canonical identity | B remains one canonical Document/resource, distinct from A. | Same, but A has no ownership of B. |
| Authorial intent | Can represent a chapter, enclosure or subordinate Document that belongs to A. | Cannot express belonging/lifetime; nested placement only points to a separately retained resource. |
| Opening B separately | Opens a transient occurrence of B; no copy or reparenting. | Also opens a transient occurrence. |
| Editing/history | Edits target B's canonical content/history, regardless of presentation. | Same. |
| Moving B from A to C | Explicit resource-ownership transfer plus placement change. Must preserve B's resource/Block identities. | Moves only a reference; actual ownership is elsewhere. |
| Transclusion | Additional references to B do not add owners. | Every nested placement has this meaning. |
| Saving | A stores an owned-resource edge; B stores its own graph. | A stores a reference edge; B is saved independently. |
| Deletion | Needs an explicit policy for owned descendants and external consumers. | Deleting A's reference does not delete B. |
| Composition | Expresses authored containment without requiring nested application execution. | Simpler today, but cannot model authored resource ownership. |

The all-reference rule is simpler only if one accepts that nesting never owns anything. That would reinterpret existing owned Document edges. Do not perform that migration implicitly. Conversely, an ordinary embedded container that does not need independent resource identity should remain a Block within A rather than automatically becoming resource B.

## Proposed representation

Extend the **existing resource edge model**, in a separately reviewed graph-schema revision, to permit an owned edge to a **Document resource root**. Reuse the existing target descriptor rather than add a parallel graph model. An illustrative edge in A would be:

```json
{
  "placementId": "chapter-placement",
  "kind": "owned",
  "target": {
    "kind": "external",
    "reference": {
      "kind": "block",
      "targetId": "document-b-root-block-id",
      "source": { "scope": "document", "resourceId": "document-b-resource-id" },
      "version": { "kind": "unpinned" }
    }
  }
}
```

Here `external` means **outside A's serialization boundary**, not necessarily non-owned. Today the validator deliberately permits only `reference` for an external target; **that rule has not been relaxed**. Acceptance would require an explicit schema change, not merely deleting the check.

Required future validation:

- The target is B's actual Document resource root, not an arbitrary Block inside B.
- B has at most one semantic owning resource; repeated occurrences are references/views.
- Resource-ownership cycles are invalid. Reference cycles are distinct and may remain valid.
- Ownership and identity conflicts fail explicitly. Loading order must not select the owner.
- A references B's identity without embedding another B body or silently adopting B's descendants.

Do not invent a separate `NestedDocumentDto`. Do not use `definitionOwnerKey` for this relationship: that field retains Block definitions within one Document and explicitly does not model one Document owning another.

## Lifetime, storage and saving decisions still needed

**Canonical ownership versus storage retention.** A Workspace/object bank may retain or catalog B without adding another semantic owner. Today's owned bank placement also serves as B's canonical storage placement; it does not yet provide a distinct non-owning resource-retention role. In particular, opening B before A is loaded must not make the bank B's new semantic owner. This is the main admission limitation exposed by the proposal. It needs a bounded, reviewed representation of a resource retained for loading with ownership unresolved; a transient view cannot supply that representation.

**Ownership authority.** Prefer the authored edge in A as the authority, with any reverse owner index treated as derived state. A standalone B file cannot then prove whether an unloaded A owns it. Independent opening/editing can still be permitted, but ownership transfer/deletion must wait for evidence. Adding an authoritative owner backlink to B is an alternative, but would introduce duplicated authority and coordinated writes; it is not proposed as a casual envelope field.

**Native save/reopen.** Saving B writes B's native graph. Saving A writes A's content and the owned-resource edge. A first durable save of a newly created A/B pair must not report complete success while B's referenced resource is missing. File discovery, write ordering and partial failure need a small explicit contract before implementation. This is not permission for B2's paired Markdown save or a general transaction system. Resource IDs are not automatically filesystem paths; the existing store/catalog mechanism must provide location evidence or expose a missing dependency.

**Move.** Reparenting B from A to C must be explicit, preserve B's identity, and reject conflicting/missing ownership evidence. In-memory changes should be one undoable operation. Durable updates to A/C need conflict/partial-write handling. Moving a visual occurrence does not perform this transfer. No such operation has been added in B1.1.

**Delete and orphans.** Recommend an explicit destructive-resource action separate from unlinking a reference or closing a view. Do not immediately garbage-collect B merely because its owner is unloaded or one reference disappears. Before release, choose whether deleting A retains B as an orphan or includes B in a reviewed cascade. Outstanding foreign references must remain explicit unresolved references, never acquire ownership. The current atomic rejection when a resource still owns retained foreign-referenced definitions is a limitation, not the proposed final UX.

**Workspace membership.** Catalog membership, durable resource ownership, and visible Window/tab membership need distinct meanings, but not necessarily a new Workspace envelope. First investigate whether existing registrations plus a narrow admission/storage role suffice. If persistence of unresolved ownership requires a new Workspace format or broader repository reconstruction, return that concrete requirement for review.

**Future composition.** An application may eventually own or reference resources under the same semantics. This does not authorize recursive application mounting, multiple editors, a new selection pipeline, Canvas/Spatial changes, or removing Stage A's recursive-hosting restriction.

## Review decision

Accept or revise the semantic distinction and the proposed owned-resource edge first. The next implementation proposal must resolve the storage/admission role, ownership authority, location discovery and deletion/save-failure rules before enabling nested-resource persistence. Existing nested Documents remain editable under their current representation and continue to fail the native qualification boundary explicitly. B1.1 has neither flattened nor converted them to foreign references.
