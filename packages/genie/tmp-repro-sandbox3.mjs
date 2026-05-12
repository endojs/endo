// @ts-check
// Reproduces the exact failure modes the LLM hit in TODO/58.
//
// Each test mimics one of the failed tool calls verbatim, including the
// JSON-stringified args shape some Ollama models emit when their tool-use
// rendering coerces an array argument to a string.

import '@endo/init/debug.js';

import { resolve } from 'path';

import { E } from '@endo/eventual-send';
import { make as makeSandboxFactoryFromPowers } from '@endo/sandbox';

import { makeLocalSandboxPowers } from './src/sandbox/local-powers.js';
import { mintGenieSlice } from './src/sandbox/slice.js';
import { buildGenieTools } from './src/index.js';

const workspaceDir = resolve('./workspace_dev');

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

const { slice, spawner } = await mintGenieSlice({
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

const genieTools = buildGenieTools({
  workspaceDir,
  searchBackend: undefined,
  include: ['bash', 'exec'],
  spawner,
  workspaceMount: /** @type {any} */ (workspaceMount),
});
const { tools } = genieTools;

const test = async (label, toolName, args) => {
  try {
    const tool = tools[toolName];
    const result = await E(tool).execute(args);
    console.log(
      `${label} ✓ ${toolName} ${JSON.stringify(args)} → exit ${result.exitCode}`,
    );
    if (result.stdout)
      console.log('   stdout:', JSON.stringify(result.stdout.slice(0, 200)));
    if (result.stderr)
      console.log('   stderr:', JSON.stringify(result.stderr.slice(0, 200)));
  } catch (err) {
    console.log(
      `${label} ✗ ${toolName} ${JSON.stringify(args)}: ${err.message}`,
    );
  }
};

console.log('=== model-shaped failures (args as JSON-encoded string) ===');
await test('A', 'bash', { args: '["uname", "-a"]' });
await test('B', 'bash', { args: '["free", "-h"]' });
await test('C', 'exec', { args: '["ps", "aux", "|", "head", "-15"]' });
await test('D', 'exec', { args: '["echo", "Hello from exec command"]' });
await test('E', 'exec', {
  args: '["ls", "/home/jcorbin/endo/packages/genie/workspace_dev"]',
});

console.log('=== array-shaped failures from TODO ===');
await test('F', 'exec', {
  args: ['ls', '/home/jcorbin/endo/packages/genie/workspace_dev'],
});
await test('G', 'exec', ['ps', 'aux', '|', 'head', '-15']);
await test('H', 'exec', { args: ['ps', 'aux', '|', 'head', '-15'] });

await E(slice).dispose();
await disposeSandboxPowers();
