// @ts-check

import assert from 'node:assert';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

const pluginDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = resolve(pluginDir, '..', '..');

describe('root flat config', () => {
  it('serializes the configured processor', async () => {
    const eslint = new ESLint({ cwd: repoDir });
    const config = await eslint.calculateConfigForFile(
      'packages/captp/src/captp.js',
    );
    assert.ok(config);
    assert.doesNotThrow(() => JSON.stringify(config));
    assert.deepEqual(config.processor?.meta, {
      name: '@jessie.js/use-jessie',
    });
  });

  it('keeps restored paths discoverable and applies per-file overrides', async () => {
    const eslint = new ESLint({ cwd: repoDir });
    const restoredPaths = [
      'browser-test/tests/chat-smoke.spec.js',
      'packages/compartment-mapper/demo/policy/index.mjs',
      'packages/compartment-mapper/test/fixtures-order/a.js',
      'packages/familiar/scripts/build.mjs',
      'packages/preact-container/vitest.config.mjs',
      'packages/ses/test/_check-intrinsics.js',
      'packages/daemon/src/bus-xs-host-globals.d.ts',
      'packages/chat/css-modules.types.d.ts',
      'packages/compartment-mapper/test/test.types.d.ts',
      'packages/immutable-arraybuffer/shim.types.d.ts',
      'packages/lal/agent.types.d.ts',
      'packages/module-source/src/external.types.d.ts',
      'packages/module-source/src/shim.types.d.ts',
      'packages/platform/src/fs/search.types.d.ts',
    ];
    const ignoredStates = await Promise.all(
      restoredPaths.map(filePath => eslint.isPathIgnored(filePath)),
    );
    assert.deepEqual(
      ignoredStates,
      restoredPaths.map(() => false),
    );

    const rootScript = await eslint.calculateConfigForFile(
      'scripts/pack-all.mjs',
    );
    const packageScript = await eslint.calculateConfigForFile(
      'packages/familiar/scripts/download-node.mjs',
    );
    assert.strictEqual(rootScript?.rules['no-await-in-loop'][0], 0);
    assert.strictEqual(packageScript?.rules['no-await-in-loop'][0], 2);
    assert.strictEqual(
      packageScript?.rules['@jessie.js/safe-await-separator'][0],
      1,
    );
  });
});
