import type { Component } from "solid-js";
import type { BlockNode } from "../block-tree/types";
import type { BlockPresentationContribution, PositionedBlockFrame, PositionedBlockProps } from "../runtime/block-presentation";

export interface AnchorRecord { version: 1; blockId: string; offset: { x: number; y: number } }
export type AnchorFrame = PositionedBlockFrame;
export interface AnchorCapabilities {
  node(key: string): BlockNode | undefined;
  path(key: string): readonly BlockNode[];
  eligible(key: string): boolean;
  revision(): number;
  commit(key: string, targetKey: string | undefined, offset: { x: number; y: number }): void;
  watch(key: string, target: string, document: string, scale: () => number, apply: (frame: AnchorFrame) => void): { refresh(): void; current(): AnchorFrame | undefined; dispose(): void };
  surface: Component<PositionedBlockProps>;
  register(contribution: BlockPresentationContribution): void;
}
