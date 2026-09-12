import { createContext, useContext, type ParentComponent } from "solid-js";
import type { BlockTreeProjection } from "../block-tree/projection";
import type { ReactiveEditor } from "./editor";

interface ReactiveViewContextValue {
  editor: ReactiveEditor;
  projection: BlockTreeProjection;
}

const ReactiveViewContext = createContext<ReactiveViewContextValue>();

export const ReactiveViewProvider: ParentComponent<ReactiveViewContextValue> = (props) => (
  <ReactiveViewContext.Provider value={{ editor: props.editor, projection: props.projection }}>
    {props.children}
  </ReactiveViewContext.Provider>
);

export function useReactiveView(): ReactiveViewContextValue {
  const context = useContext(ReactiveViewContext);
  if (!context) throw new Error("Block views require a ReactiveViewProvider");
  return context;
}
