import { Repo } from '@automerge/automerge-repo';
import { WebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs';
import { getOrCreateRoot } from './root-doc.js';

export const makeRepo = profileName => {
  const dirPath = `/tmp/pbcap-${profileName}`;
  const storageAdapter = new NodeFSStorageAdapter(dirPath);

  const repo = new Repo({
    network: [new WebSocketClientAdapter('wss://sync.automerge.org')],
    storage: storageAdapter,
  });

  /** @type {string} */
  const rootDocUrl = getOrCreateRoot(repo, profileName);
  // Cast to AnyDocumentId type that repo.find expects
  // const handle = await repo.find(/** @type {any} */ (rootDocUrl));
  return { repo, rootDocUrl };
};
