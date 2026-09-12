import type { PositionMap } from "./types";

export class ReplacePositionMap implements PositionMap {
  constructor(
    readonly start: number,
    readonly end: number,
    readonly insertedLength: number,
  ) {
    if (start < 0 || end < start || insertedLength < 0) {
      throw new Error("Invalid replacement position map");
    }
  }

  map(index: number, affinity: "before" | "after"): number {
    if (index < this.start || (index === this.start && affinity === "before")) return index;
    if (index > this.end || (index === this.end && affinity === "after")) {
      return index + this.insertedLength - (this.end - this.start);
    }
    return this.start + (affinity === "after" ? this.insertedLength : 0);
  }
}

export class CompositePositionMap implements PositionMap {
  constructor(readonly maps: PositionMap[]) {}

  map(index: number, affinity: "before" | "after"): number {
    return this.maps.reduce((current, map) => map.map(current, affinity), index);
  }
}
