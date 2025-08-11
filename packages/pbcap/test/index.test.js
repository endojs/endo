import test from '@endo/ses-ava/prepare-endo.js';
import { Repo } from '@automerge/automerge-repo';
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs';
import { join } from 'path';
import { homedir } from 'os';
import { rmSync, existsSync } from 'fs';
import { setRootDocUrl, getOrCreateRoot } from '../src/root-doc.js';

test('root-doc storage and retrieval', async t => {
  // Setup test storage directory
  const testDir = join(homedir(), '.pbcap-test');
  const storageAdapter = new NodeFSStorageAdapter(testDir);

  const repo = new Repo({
    storage: storageAdapter,
  });

  // Mock contact object
  const contact = { url: 'contact://test.com/self' };

  // Test setting and getting root doc URL
  const testUrl = 'automerge://test-doc-id';
  setRootDocUrl(testUrl);

  // Test getOrCreateRoot with existing URL
  const existingId = getOrCreateRoot(repo, contact);
  t.is(existingId, testUrl);

  // Clean up test storage
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('root-doc creation when none exists', async t => {
  // Setup test storage directory
  const testDir = join(homedir(), '.pbcap-test-2');
  const storageAdapter = new NodeFSStorageAdapter(testDir);

  const repo = new Repo({
    storage: storageAdapter,
  });

  // Mock contact object
  const contact = { url: 'contact://test.com/self' };

  // Test getOrCreateRoot when no URL exists (should create new)
  const newId = getOrCreateRoot(repo, contact);
  t.truthy(newId);
  t.is(typeof newId, 'string');
  t.true(newId.startsWith('automerge:'));

  // Clean up test storage
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});
