import { Portal } from "solid-js/web";
import type { Component } from "solid-js";
import type { PositionedBlockProps } from "../runtime/block-presentation";
import { useReactiveView } from "../reactive-editor/context";

/** Core owns the unclipped DOM host and preserves the existing view context. */
export const PositionedBlockSurface: Component<PositionedBlockProps> = props => {
  const { editor } = useReactiveView();
  const path = editor.blockQueries.ancestorPath(props.nodeKey);
  const page = path.find(node => node.viewType === "document-block");
  const host = page && editor.mounts.get(page.key)?.root.closest<HTMLElement>(".workspace-demo");
  const windowNode = [...path].reverse().find(node => node.viewType === "document-window-block");
  const peer = windowNode && editor.mounts.get(windowNode.key)?.root.parentElement;
  // On Desktop stay in the Window's stacking context. Scaled Canvas hosts
  // require the outer, untransformed Portal and viewport coordinates.
  let transformed = false;
  for (let element = peer; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    transformed ||= style.transform !== "none" && !!style.transform || style.perspective !== "none" && !!style.perspective || style.filter !== "none" && !!style.filter || /paint|strict|content/.test(style.contain);
  }
  return <Portal mount={peer && !transformed ? peer : host ?? document.body}>
    <div data-positioned-block={props.nodeKey} hidden={!props.visible}
      style={{ position: "fixed", left: `${props.frame.x + props.offset.x * props.frame.scale}px`, top: `${props.frame.y + props.offset.y * props.frame.scale}px`,
        width: `${props.frame.width}px`, transform: `scale(${props.frame.scale})`, "transform-origin": "top left", "z-index": props.frame.zIndex,
        font: props.frame.font, color: props.frame.color, "pointer-events": "auto" }}>
      {props.controls}{props.render()}
    </div>
  </Portal>;
};
