import type { BlockRegistry } from "./registry";
import type { BlockTreeProjection } from "./projection";
import type { BlockTypeDescriptor, InsertPlan, InsertRequest } from "./types";

const ordinaryContent = {
  name: "children",
  cardinality: "many" as const,
  role: "content" as const,
  accepts: (_type: BlockTypeDescriptor) => true,
  persistence: "children" as const,
};

export class InsertionPlanner {
  constructor(
    private readonly registry: BlockRegistry,
    private readonly projection: BlockTreeProjection,
  ) {}

  plan(request: InsertRequest): InsertPlan {
    const target = this.projection.state.nodes[request.targetKey];
    if (!target) return { accepted: false, reason: "The insertion target no longer exists" };
    const registration = this.registry.resolve(target.viewType);
    const slots = registration?.slots?.length
      ? registration.slots
      : registration?.capabilities.includes("container")
        ? [ordinaryContent]
        : [];
    const candidates = request.preferredSlot
      ? slots.filter((slot) => slot.name === request.preferredSlot)
      : slots;
    const slot = candidates.find((candidate) => candidate.accepts(request.source));
    if (!slot) {
      return {
        accepted: false,
        reason: `${request.source.type} is not accepted by ${target.viewType}`,
      };
    }
    if (slot.persistence === "children") {
      return {
        accepted: true,
        slot: slot.name,
        destination: {
          kind: "at",
          parentKey: request.targetKey,
          index: target.children.length,
        },
      };
    }
    if (slot.persistence.startsWith("relation:")) {
      return {
        accepted: true,
        slot: slot.name,
        reason: "Use the relation command for this single attachment slot",
      };
    }
    return {
      accepted: false,
      slot: slot.name,
      reason: `${slot.name} requires the extended/session insertion adapter`,
    };
  }
}
