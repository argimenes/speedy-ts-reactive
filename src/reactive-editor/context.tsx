import { createContext, useContext, type ParentComponent } from "solid-js";
import type { BlockTreeProjection } from "../block-tree/projection";
import type { ReactiveEditor } from "./editor";
import type { NodeKey } from "../block-tree/types";
import { identityCoordinates, type LocalCoordinates } from "../runtime/local-coordinates";
import type { WindowGeometryHost } from "../rendering/window-geometry";

interface ReactiveViewContextValue {
  editor: ReactiveEditor;
  projection: BlockTreeProjection;
  coordinates?: LocalCoordinates;
  windowGeometry?: (key: NodeKey) => WindowGeometryHost | undefined;
}

const ReactiveViewContext = createContext<ReactiveViewContextValue>();

export const ReactiveViewProvider: ParentComponent<ReactiveViewContextValue> = (props) => (
  <ReactiveViewContext.Provider value={{ editor: props.editor, projection: props.projection, coordinates: props.coordinates ?? identityCoordinates, windowGeometry: props.windowGeometry }}>
    {props.children}
  </ReactiveViewContext.Provider>
);

export function useReactiveView(): ReactiveViewContextValue {
  const context = useContext(ReactiveViewContext);
  if (!context) throw new Error("Block views require a ReactiveViewProvider");
  return context;
}
