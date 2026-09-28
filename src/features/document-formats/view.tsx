import type { BlockViewProps } from "../../block-tree/types";
import { useReactiveView } from "../../reactive-editor/context";
import { ContainerBlockView } from "../../rendering/container-block-view";
import { readDocumentFormat } from "./model";
import "./formats.css";

/** Styling adapter only. Core retains the one mounted Document and all editing. */
export function FormattedDocumentView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const format = () => readDocumentFormat(projection.state.nodes[props.nodeKey]?.payload.metadata);
  return <ContainerBlockView nodeKey={props.nodeKey}
    class={format() && format()!.format !== "page" ? `document-format document-format--${format()!.format}${format()!.template === "illuminated-manuscript" && format()!.theme === "parchment" ? " document-template--illuminated-manuscript" : ""}` : undefined}
    contentClass={format()?.format === "framed" ? "document-format__content" : undefined} />;
}
