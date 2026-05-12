// @ts-check
import '@endo/init/debug.js';

import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { E } from '@endo/eventual-send';
import { make as makeSandboxFactoryFromPowers } from '@endo/sandbox';

import { makeLocalSandboxPowers } from './src/sandbox/local-powers.js';
import { mintGenieSlice } from './src/sandbox/slice.js';
import { buildGenieTools } from './src/index.js';

const workspaceDir = mkdtempSync(join(tmpdir(), 'sandbox-repro-'));
console.log('Workspace:', workspaceDir);

const {
  powers: sandboxPowers,
  makeMountCapForPath,
  dispose: disposeSandboxPowers,
} = makeLocalSandboxPowers();
const workspaceMount = makeMountCapForPath(workspaceDir);

const sandboxFactory = await makeSandboxFactoryFromPowers(
  sandboxPowers,
  undefined,
);

const { slice, spawner, resolvedBackend, sliceLabel } = await mintGenieSlice({
  sandboxFactory,
  agentName: 'repro',
  workspaceMount,
  workspaceDir,
  backend: 'bwrap',
  network: 'none',
  rootfs: { kind: 'host-bind' },
  rootfsLabel: 'host-bind',
  env: {},
});

console.log('Slice minted:', sliceLabel);

// Use buildGenieTools to construct the bash/exec tools the same way dev-repl.js does
const workspaceMountForVFS = /** @type {any} */ (workspaceMount);
const genieTools = buildGenieTools({
  workspaceDir,
  searchBackend: undefined,
  include: ['bash', 'exec'],
  spawner,
  workspaceMount: workspaceMountForVFS,
});

const { tools } = genieTools;
console.log('Tools:', Object.keys(tools));

const test = async (toolName, args) => {
  try {
    const tool = tools[toolName];
    if (!tool) throw new Error(`no tool ${toolName}`);
    const result = await E(tool).execute(args);
    console.log(`✓ ${toolName} ${JSON.stringify(args)}`);
    console.log('  ', JSON.stringify(result));
  } catch (err) {
    console.log(`✗ ${toolName} ${JSON.stringify(args)}:`, err.message);
    if (err.stack) console.log(err.stack);
  }
};

// Try the failing patterns from the TODO
await test('exec', { args: ['echo', 'Hello from exec'] });
await test('exec', { args: ['ls', workspaceDir] });
await test('bash', { args: ['ls -R'] });
await test('bash', { args: ['find .'] });
await test('bash', { args: ['uname -a'] });
await test('bash', { args: ['free -h'] });

await E(slice).dispose();
await disposeSandboxPowers();
console.log('Done');
