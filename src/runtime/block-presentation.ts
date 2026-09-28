import { createSignal, type Component, type JSX } from "solid-js";

export interface BlockPresentationProps {
  nodeKey: string;
  scale(): number;
  render(): JSX.Element;
}
export interface BlockPresentationContribution {
  view: Component<BlockPresentationProps>;
  controls: Component<{ nodeKey: string }>;
}
export interface PositionedBlockFrame {
  valid: boolean; visible: boolean;
  x: number; y: number; scale: number; width: number; zIndex: number;
  font: string; color: string;
}
export interface PositionedBlockProps {
  nodeKey: string; frame: PositionedBlockFrame; visible: boolean;
  offset: { x: number; y: number }; render(): JSX.Element; controls: JSX.Element;
}

/** One optional presentation owner; not a renderer chain or layout registry. */
export class BlockPresentation {
  private state = createSignal<BlockPresentationContribution>();
  current = this.state[0];
  register(contribution: BlockPresentationContribution): () => void {
    if (this.current()) throw new Error("Block presentation already has an owner");
    this.state[1](contribution);
    return () => { if (this.current() === contribution) this.state[1](undefined); };
  }
}
