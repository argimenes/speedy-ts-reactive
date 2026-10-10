import type { ReactiveEditor } from '../reactive-editor/editor';
import { nativeDocumentSession } from '../persistence/native-session';
import { createDocumentVaults, type DocumentVaultLease } from './document-vault';
import { registerEntityContext } from './entity-service';
import { createNativeKnowledgeHost } from './native-knowledge-scope';
import { FactsQueryProvider } from './facts-query-provider';
import { sqliteIndexLifecycle } from './sqlite-index-lifecycle';

/** Standalone DocumentWindows share one workspace-owned Vault context. Acquire
 * it on the first Entity query, not on workspace startup or each keystroke. */
export function registerWorkspaceEntities(editor: ReactiveEditor, viewId: string) {
  if (!editor.features.nativeDocumentPersistence || !editor.features.sqliteEntities) return () => {};
  const native = nativeDocumentSession(editor);
  const policy = () => ({ version: 1 as const, opaqueTypes: editor.registry.typesWithCapability('opaque-widget') });
  const host = editor.features.nativeKnowledge ? createNativeKnowledgeHost(editor.repository, native, {
    read: policy, subscribe: listener => editor.registry.subscribe(listener),
  }, { loadedOnly: !editor.features.nativeKnowledgeSaved, progressiveSaved: editor.features.nativeKnowledgeSaved, sqliteSaved: editor.features.sqliteKnowledge }) : undefined;
  const facts = host ? new FactsQueryProvider(host) : undefined;
  let index: ReturnType<typeof sqliteIndexLifecycle> | undefined;
  const vaults = createDocumentVaults(native, editor.features.sqliteKnowledge ? root => (index = sqliteIndexLifecycle(root, policy())) : undefined);
  const controller = new AbortController();
  let vault: DocumentVaultLease | undefined, preparing: Promise<void> | undefined, disposed = false;
  const unregister = registerEntityContext(editor, {
    accepts(key) {
      if (disposed || editor.node(key)?.viewId !== viewId) return false;
      const path = editor.blockQueries.ancestorPath(key);
      // Flint projections and Phosphor Screens retain their own contexts.
      return path.some(n => n.viewType === 'document-window-block') && path.some(n => n.viewType === 'document-block')
        && !path.some(n => n.viewType === 'phosphor-screen-block' || n.viewType === 'flint-application-block');
    },
    vault() {
      if (disposed || !vault) throw Error('DocumentWindow Vault is unavailable');
      return vault;
    },
    facts,
    async listingVault() {
      const root = vault?.root ?? await native.defaultVault();
      if (disposed || !root) throw Error('DocumentWindow Vault is unavailable');
      return root;
    },
    prepare() {
      if (disposed) return Promise.reject(Error('DocumentWindow Vault is closed'));
      return preparing ??= (async () => {
        if (!vault) {
          const root = await native.defaultVault();
          controller.signal.throwIfAborted();
          if (!root) throw Error('Open a Mutable Vault before resolving DocumentWindow Entities.');
          const acquired = await vaults.acquire(root, controller.signal);
          if (disposed) { acquired.release(); throw Error('DocumentWindow Vault is closed'); }
          vault = acquired;
          facts?.use(vault);
        } else await vault.refresh();
        // Finish initial indexing/status work before the resolver captures its
        // revision fence. Do not race the first summary against index startup.
        await index?.refresh();
      })().finally(() => { preparing = undefined; });
    },
  });
  return () => {
    disposed = true;
    unregister(); controller.abort(); facts?.dispose();
    vault?.release(); vaults.dispose(); void host?.dispose();
  };
}
