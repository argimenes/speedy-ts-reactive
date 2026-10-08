import { onCleanup, onMount } from "solid-js";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { registerApplicationViews } from "../../application/features";
import { ReactiveTreeView } from "../../rendering/reactive-tree-view";
import { materializeLocalWorkspace } from "../../reactive-editor/workspace-manifest";
export default function PhosphorDemo() {
  const editor = new ReactiveEditor(
    materializeLocalWorkspace({
      id: crypto.randomUUID(),
      type: "workspace-block",
      children: [],
    }),
  );
  registerApplicationViews(editor);
  const view = editor.createView("phosphor-demo");
  editor.commandRegistry.execute("phosphor.open", {
    targetKey: view.state.rootKey,
    args: undefined,
  });
  onMount(() => editor.installGateway(document));
  onCleanup(() => editor.dispose());
  return (
    <div class="ph-demo">
      <div class="ph-ambient" aria-hidden="true">
        <i />
        <i />
      </div>
      <nav>
        <a href={import.meta.env.BASE_URL}>← Mutable</a>
        <span>PHOSPHOR / A CHARACTER INSTRUMENT</span>
        <span>40 × 24</span>
      </nav>
      <ReactiveTreeView editor={editor} projection={view} />
    </div>
  );
}
