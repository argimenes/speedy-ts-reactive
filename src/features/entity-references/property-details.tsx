import "./property-details.css";
import { Show } from "solid-js";
import type { AnnotationContribution } from "../../feature-api";
export const EntityPropertyDetails: AnnotationContribution["details"] = props => {
  const entity = () => {
    const property = props.property();
    if (property?.type !== "codex/entity-reference") return undefined;
    const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const metadata = object(property.metadata), cache = object(property.cache);
    const details = [object(cache.entity), object(property.entity), object(metadata.entity)];
    const text = (...values: unknown[]) => values.find(value => typeof value === "string" && value.trim()) as string | undefined;
    const id = text(property.value, ...details.flatMap(detail => [detail.Guid, detail.id]), metadata.entityId);
    // Never present cached data for a different reference after Value is edited.
    const matching = details.filter(detail => { const cachedId = text(detail.Guid, detail.id); return !cachedId || !id || cachedId === id; });
    const name = text(...matching.flatMap(detail => [detail.Name, detail.name]),
      !text(metadata.entityId) || metadata.entityId === id ? metadata.entityName : undefined);
    return { id: id ?? "Not assigned", name: name ?? "Entity name not loaded" };
  };
  return <Show when={entity()}>{details => <fieldset class="annotation-entity"><legend>Entity reference</legend>
    <label>Entity name<input readOnly value={details().name} /></label>
    <label>Entity ID<input readOnly value={details().id} /></label>
  </fieldset>}</Show>;
};
