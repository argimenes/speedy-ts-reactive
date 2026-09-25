import { createSignal, type Accessor, type Component } from "solid-js";
import type { Disposer } from "./features";

/** One mounted document window. Geometry and focus stay behind this port. */
export interface WindowPresentationPort {
  readonly marginsCollapsed: Accessor<boolean>;
  requestMarginCollapse(collapsed: boolean): void;
}
export interface WindowPresentationInstance {
  readonly className: Accessor<string>;
  readonly control: Component;
}
export interface WindowPresentationContribution {
  readonly workspaceClass: string;
  /** Runs in the window's Solid owner; cleanup also runs on feature removal. */
  create(port: WindowPresentationPort): WindowPresentationInstance;
}

/** A single optional presentation policy, not a layout registry or middleware. */
export class WindowPresentation {
  private current = createSignal<WindowPresentationContribution>();
  readonly contribution = this.current[0];
  workspaceClass = () => this.contribution()?.workspaceClass ?? "";

  register(contribution: WindowPresentationContribution): Disposer {
    if (this.contribution()) throw new Error("Document window presentation already registered");
    this.current[1](() => contribution);
    return () => { if (this.contribution() === contribution) this.current[1](undefined); };
  }
}
