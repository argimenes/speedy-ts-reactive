import { onCleanup, onMount } from "solid-js";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { registerApplicationViews } from "../../application/features";
import { ReactiveTreeView } from "../../rendering/reactive-tree-view";
import { materializeLocalWorkspace } from "../../reactive-editor/workspace-manifest";
import { openPhosphor } from "../../application/phosphor";
import type { ReactiveEditorConfiguration } from "../../configuration";
export default function PhosphorDemo(props: { configuration?: ReactiveEditorConfiguration } = {}) {
  const editor = new ReactiveEditor(
    materializeLocalWorkspace({
      id: crypto.randomUUID(),
      type: "workspace-block",
      children: [],
    }),
    props.configuration,
  );
  registerApplicationViews(editor);
  const view = editor.createView("phosphor-demo");
  openPhosphor(editor, "rain");
  onMount(() => editor.installGateway(document));
  onCleanup(() => editor.dispose());
  return (
    <div class="ph-demo">
      <div class="ph-ambient" aria-hidden="true" />
      <nav>
        <a href={import.meta.env.BASE_URL}>← Mutable</a>
        <span>PHOSPHOR / A CHARACTER INSTRUMENT</span>
        <span>40 × 24</span>
      </nav>
      <ReactiveTreeView editor={editor} projection={view} />
    </div>
  );
}
