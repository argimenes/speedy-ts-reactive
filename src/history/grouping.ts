import { freeze, type DeepReadonly } from "../block-tree/commit-capture";
import type { HistorySource, Revision } from "./memory-store";
import { HistoryError } from "./replay";
import { readOnlyHistorySource } from "./source";
export interface PlaybackGroup {
  groupId: string; policyId: string; policyVersion: string;
  memberRevisionIds: string[]; endpointRevisionId: string;
  label: string; boundaryReason: string; finalized: boolean;
}
export interface GroupingRequest {
  segmentId: string; headRevisionId: string;
  revisionIds?: readonly string[];
  scope?: string; locale?: string; idleMs?: number; maxSpanMs?: number;
  asOfTimestamp?: string;
}
export interface HistoricalGroupingContext {
  source: HistorySource; request: GroupingRequest;
  branchId: string;
  revisions: readonly DeepReadonly<Revision>[];
  positions: ReadonlyMap<string, number>;
  sentenceEnds(text: string, locale: string): readonly number[];
}
export interface HistoricalGroupingPolicy {
  id: string; version: string;
  group(context: HistoricalGroupingContext): Promise<PlaybackGroup[]>;
}

/** Segmenter offsets are UTF-16; consumers use canonical code-point/Cell offsets. */
export function sentenceEnds(text: string, locale: string): number[] {
  const segments = [...new Intl.Segmenter(locale, { granularity: "sentence" }).segment(text)];
  const ends: number[] = [];
  for (const segment of segments) {
    const end = segment.index + segment.segment.length;
    // A trailing period by itself is tentative. Context/space permits closure;
    // common title abbreviations remain tentative even if the engine splits.
    if (!/[.!?。！？][\s\u3000]+$/u.test(segment.segment) && end === text.length) continue;
    if (/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc)|\b[A-Z])\.\s*$/u.test(segment.segment)) continue;
    if (/[.!?。！？][\s\u3000]*$/u.test(segment.segment)) ends.push(Array.from(text.slice(0, end)).length);
  }
  return ends;
}

export const sentencePolicy: HistoricalGroupingPolicy = {
  id: "sentence", version: "1",
  async group(context) {
    const { source, request, revisions, positions } = context;
    const idle = request.idleMs ?? 1000, maxSpan = request.maxSpanMs ?? 10000;
    if (!Number.isFinite(idle) || idle <= 0 || !Number.isFinite(maxSpan) || maxSpan <= 0) throw new HistoryError("invalid", "Invalid grouping timing options");
    const result: PlaybackGroup[] = [];
    let open: PlaybackGroup | undefined, owner: string | undefined, caret: number | undefined;
    let firstTime = 0, previousTime = 0, previousPosition = -1, occurrence: string | undefined, producerId: string | undefined, commandKinds: string | undefined;
    const close = (reason: string) => { if (open) { open.finalized = true; open.boundaryReason = reason; open = undefined; } };
    for (const revision of revisions) {
      const event = revision.event, time = Date.parse(event.timestamp), position = positions.get(revision.revisionId)!;
      if (!Number.isFinite(time)) throw new HistoryError("invalid", "Invalid captured timestamp");
      const state = await source.getStateAt(request.segmentId, revision.revisionId);
      const owners = event.contents.filter(c => c.kind === "patch-content" && c.sequences.some(s => s.field === "inlineContent") && state.contents[c.key]?.inlineKind === "standoff");
      const edit = owners.length === 1 && owners[0].kind === "patch-content" ? owners[0] : undefined;
      const sequence = edit?.sequences.find(s => s.field === "inlineContent");
      const hints = event.inputIntent;
      const boundary = hints?.boundaryBefore && ["composition", "paste", "selection-replacement", "relocation", "focus"].includes(hints.boundaryBefore);
      const hintAction = hints?.kind && ["paste", "selection-replacement", "composition"].includes(hints.kind);
      const authoredChanges = event.contents.filter(c => {
        const content = state.contents[c.key] ?? (c.kind === "record-content" ? c.before : undefined);
        return content && content.viewType !== "text-cell" && content.viewType !== "image-cell";
      });
      const commands = JSON.stringify(event.commands.map(command => command.commandId));
      const explicitAction = event.cause.kind !== "edit" || !edit || authoredChanges.length !== 1 || hintAction || event.commands.some(c => c.relation);
      if (open) {
        if (revision.producerId !== producerId) close("branch");
        else if (position !== previousPosition + 1) close("omitted-revision");
        else if (time < previousTime) close("clock-regression");
        else if (time - previousTime >= idle) close("idle");
        else if (time - firstTime >= maxSpan) close("max-span");
        else if (explicitAction || boundary || commands !== commandKinds || owner !== edit?.key || hints?.occurrenceToken && occurrence && hints.occurrenceToken !== occurrence) close("editing-boundary");
        else if (sequence && caret !== undefined && sequence.index !== caret && sequence.index + sequence.removed.length !== caret) close("discontinuous-edit");
      }
      if (!open) {
        const namespace = JSON.stringify(["sentence", "1", request.segmentId, context.branchId, revision.producerId, request.scope ?? "all", request.locale ?? "en", idle, maxSpan]);
        open = { groupId: `${namespace}:${revision.revisionId}`, policyId: "sentence", policyVersion: "1", memberRevisionIds: [], endpointRevisionId: revision.revisionId,
          label: "Sentence", boundaryReason: "open-tail", finalized: false };
        result.push(open); firstTime = time;
      }
      open.memberRevisionIds.push(revision.revisionId); open.endpointRevisionId = revision.revisionId;
      owner = edit?.key; caret = sequence ? sequence.index + sequence.inserted.length : undefined;
      occurrence = hints?.occurrenceToken; producerId = revision.producerId; commandKinds = commands; previousTime = time; previousPosition = position;
      if (explicitAction) { open.label = event.label; close(event.cause.kind === "edit" ? "explicit-action" : event.cause.kind); }
      else if (owner && caret !== undefined) {
        const text = state.contents[owner].inlineContent.map(key => {
          const cell = state.contents[state.placements[key].contentKey]; return cell.viewType === "text-cell" ? String(cell.payload.text ?? "") : "\uFFFC";
        }).join("");
        if (context.sentenceEnds(text, request.locale ?? "en").includes(caret)) close("sentence");
      }
    }
    if (request.asOfTimestamp) {
      const asOf = Date.parse(request.asOfTimestamp);
      if (!Number.isFinite(asOf) || asOf < previousTime) throw new HistoryError("invalid", "Invalid grouping as-of timestamp");
      if (asOf - previousTime >= idle) close("idle");
    }
    return result;
  },
};

export async function groupTimeline(source: HistorySource, request: GroupingRequest, policy: HistoricalGroupingPolicy = sentencePolicy,
  segment: HistoricalGroupingContext["sentenceEnds"] = sentenceEnds): Promise<DeepReadonly<PlaybackGroup[]>> {
  source = readOnlyHistorySource(source);
  if (request.segmentId !== source.segmentId) throw new HistoryError("incomplete", "Unknown grouping segment");
  const ancestry = await source.ancestry(request.headRevisionId);
  const positions = new Map(ancestry.map((id, index) => [id, index]));
  const ids = Object.freeze([...(request.revisionIds ?? ancestry.slice(1))]);
  let previous = 0;
  for (const id of ids) {
    const position = positions.get(id);
    if (position === undefined || position <= previous) throw new HistoryError("invalid", "Grouping members must be ordered on one branch");
    previous = position;
  }
  const revisions = await Promise.all(ids.map(async id => (await source.getRevision(id))!));
  const branchId = (await source.getRevision(request.headRevisionId))?.producerId ?? source.baselineRevisionId;
  const groups = await policy.group({ source, request, branchId, revisions: Object.freeze(revisions), positions: new Map(positions), sentenceEnds: segment });
  const members = groups.flatMap(group => group.memberRevisionIds);
  if (members.length !== ids.length || members.some((id, index) => id !== ids[index])) throw new HistoryError("invalid", "Grouping changed exact revision membership");
  for (const group of groups) {
    if (!group.memberRevisionIds.length || group.endpointRevisionId !== group.memberRevisionIds.at(-1) || group.policyId !== policy.id || group.policyVersion !== policy.version) throw new HistoryError("invalid", "Invalid playback group endpoint/policy");
    for (let i = 1; i < group.memberRevisionIds.length; i++) if (positions.get(group.memberRevisionIds[i]) !== positions.get(group.memberRevisionIds[i - 1])! + 1) throw new HistoryError("invalid", "Group crossed omitted revisions");
  }
  return freeze(groups);
}
