import { For } from "solid-js";
import type { CodexFeature, FeatureScope } from "../../feature-api";
import type { DocumentApplicationCapabilities, DocumentApplicationInstance } from "../../feature-api/document-application";
import "./flint.css";

function FlintView(props: { application: DocumentApplicationInstance }) {
  const app = props.application;
  return <div class="flint-application">
    <header class="flint-application__header"><strong>Flint</strong><span>A space for ideas</span><button type="button" onClick={() => app.closeActiveTab()}>Close tab</button></header>
    <div class="flint-application__body">
      <nav class="flint-application__vault" aria-label="Flint Documents"><h2>Documents</h2>
        <For each={app.documents()}>{doc => <div><button type="button" onClick={() => app.openDocument(doc.id)}>{doc.title}</button><input aria-label={`Rename ${doc.title}`} value={doc.title} onChange={e => { const title = e.currentTarget.value.trim(); if (title) app.renameDocument(doc.id, title); }} /></div>}</For>
      </nav>
      <main class="flint-application__editor"><app.tabs /></main>
    </div>
  </div>;
}
export function createFlintFeature(capabilities: (scope: FeatureScope) => DocumentApplicationCapabilities): CodexFeature {
  return { id: "flint", activate(scope) {
    capabilities(scope).register({ type: "flint-application-block", view: FlintView,
      create(vaultId, documents) {
        return { id: crypto.randomUUID(), type: "flint-application-block", metadata: { vaultId }, children: [{ id: crypto.randomUUID(), type: "tab-row-block", children: documents.map(doc => ({ id: crypto.randomUUID(), type: "tab-block", metadata: { name: doc.title, documentTarget: { version: 1, documentId: doc.id } } })) }] };
      },
    });
  } };
}
