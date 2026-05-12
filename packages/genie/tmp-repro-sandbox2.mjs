// @ts-check
import '@endo/init/debug.js';

import { resolve } from 'path';

import { E } from '@endo/eventual-send';
import { make as makeSandboxFactoryFromPowers } from '@endo/sandbox';

import { makeLocalSandboxPowers } from './src/sandbox/local-powers.js';
import { mintGenieSlice } from './src/sandbox/slice.js';
import { buildGenieTools } from './src/index.js';

const workspaceDir = resolve('./workspace_dev');
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

const { slice, spawner, sliceLabel } = await mintGenieSlice({
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

const genieTools = buildGenieTools({
  workspaceDir,
  searchBackend: undefined,
  include: ['bash', 'exec'],
  spawner,
  workspaceMount: /** @type {any} */ (workspaceMount),
});
const { tools } = genieTools;

const test = async (toolName, args) => {
  try {
    const tool = tools[toolName];
    const result = await E(tool).execute(args);
    console.log(
      `✓ ${toolName} ${JSON.stringify(args)} → exit ${result.exitCode}`,
    );
    if (result.stdout)
      console.log('  stdout:', JSON.stringify(result.stdout.slice(0, 200)));
    if (result.stderr)
      console.log('  stderr:', JSON.stringify(result.stderr.slice(0, 200)));
  } catch (err) {
    console.log(`✗ ${toolName} ${JSON.stringify(args)}: ${err.message}`);
  }
};

// Same failing patterns the LLM in the TODO tried.
await test('bash', { args: ['ls -R'] });
await test('bash', { args: ['find .'] });
await test('bash', { args: ['uname -a'] });
await test('bash', { args: ['free -h'] });
await test('exec', { args: ['echo', 'Hello from exec command'] });
await test('exec', { args: ['ls', workspaceDir] });
await test('exec', { args: ['ls', '/workspace'] });
await test('exec', { args: ['ps', 'aux', '|', 'head', '-15'] });
// And what happens when the model passes args as a JSON-encoded string:
await test('exec', { args: '["echo", "Hello"]' });

await E(slice).dispose();
await disposeSandboxPowers();
console.log('Done');
