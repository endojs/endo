// @ts-check
/* global process */

/**
 * Unit tests for the persistence helpers introduced by sub-task 96 of
 * `TODO/92_genie_primordial.md`.
 *
 * These tests exercise:
 *   - round-trip `saveConfig` → `loadConfig`
 *   - atomic-write semantics: a stray `.tmp` file from an aborted
 *     write does not break a subsequent `loadConfig`
 *   - schema validation: corrupt JSON returns `undefined` and logs a
 *     warning (never throws)
 *   - file mode `0600` on POSIX after `saveConfig`
 *   - `clearConfig` removes the file and is a no-op on a missing file
 *
 * The persistence module logs warnings on schema mismatches; the
 * tests stub `console.warn` for the duration of those assertions to
 * keep AVA's output clean and to verify the warning fires.
 */

import '../setup.js';

import test from 'ava';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
  CONFIG_REL_PATH,
  README_TEXT,
  clearConfig,
  loadConfig,
  saveConfig,
  validateConfig,
} from '../../src/primordial/persistence.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Allocate a unique workspace directory under the OS temp tree.  AVA
 * runs tests in parallel so each test gets its own root to avoid
 * cross-test interference.
 *
 * @param {string} label
 */
const makeWorkspace = async label => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), `genie-persistence-${label}-`),
  );
  return root;
};

/**
 * Capture writes to `process.stderr` for the duration of `body` and
 * return the captured chunks.  SES lockdown freezes `console`, so
 * patching `console.warn` directly fails; the tamed `console.warn`
 * still writes to stderr, which `process.stderr.write` is a stable
 * spy point for.
 *
 * @template T
 * @param {() => Promise<T>} body
 * @returns {Promise<{ result: T, warnings: string[] }>}
 */
const captureWarnings = async body => {
  await null;
  const warnings = /** @type {string[]} */ ([]);
  const original = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line no-param-reassign
  process.stderr.write = /** @type {any} */ ((chunk, ...rest) => {
    if (typeof chunk === 'string') warnings.push(chunk);
    else if (chunk && typeof chunk.toString === 'function')
      warnings.push(chunk.toString());
    // Forward to the real stderr so AVA's reporter still sees it on
    // failure, but only when the test explicitly opts in via the
    // `DEBUG_PERSISTENCE_WARNINGS` env var.
    if (process.env.DEBUG_PERSISTENCE_WARNINGS) {
      return original(chunk, ...rest);
    }
    return true;
  });
  try {
    const result = await body();
    return { result, warnings };
  } finally {
    // eslint-disable-next-line no-param-reassign
    process.stderr.write = original;
  }
};

/**
 * Build a minimal valid {@link import('../../src/primordial/types.js').Config}.
 *
 * @param {Partial<import('../../src/primordial/types.js').ConfigModel>} [overrides]
 * @returns {import('../../src/primordial/types.js').Config}
 */
const makeConfig = (overrides = {}) => ({
  version: 1,
  model: {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    credentials: { ANTHROPIC_API_KEY: 'sk-ant-test' },
    options: {},
    ...overrides,
  },
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

test('saveConfig + loadConfig round-trip — same config returned', async t => {
  const workspaceDir = await makeWorkspace('roundtrip');
  const original = makeConfig();
  await saveConfig(workspaceDir, original);
  const loaded = await loadConfig(workspaceDir);
  t.truthy(loaded);
  t.is(loaded?.version, 1);
  t.is(loaded?.model.provider, 'anthropic');
  t.is(loaded?.model.modelId, 'claude-sonnet-4-5');
  t.deepEqual(loaded?.model.credentials, { ANTHROPIC_API_KEY: 'sk-ant-test' });
  t.deepEqual(loaded?.model.options, {});
  t.is(
    // eslint-disable-next-line no-underscore-dangle
    loaded?._README,
    README_TEXT,
    'saveConfig forces the canonical README pointer on disk',
  );
});

test('saveConfig — accepts options alongside credentials', async t => {
  const workspaceDir = await makeWorkspace('with-options');
  const config = makeConfig({
    provider: 'ollama',
    modelId: 'llama3.2',
    credentials: {},
    options: { OLLAMA_HOST: 'http://localhost:11434' },
  });
  await saveConfig(workspaceDir, config);
  const loaded = await loadConfig(workspaceDir);
  t.deepEqual(loaded?.model.options, {
    OLLAMA_HOST: 'http://localhost:11434',
  });
});

test.serial('loadConfig — absent file returns undefined without warning', async t => {
  const workspaceDir = await makeWorkspace('absent');
  const { result, warnings } = await captureWarnings(() =>
    loadConfig(workspaceDir),
  );
  t.is(result, undefined);
  t.deepEqual(warnings, [], 'absent file is a sentinel, not a warning');
});

// ---------------------------------------------------------------------------
// Atomic-write semantics
// ---------------------------------------------------------------------------

test('loadConfig — stray .tmp file does not shadow the previous good value', async t => {
  const workspaceDir = await makeWorkspace('atomic');
  const good = makeConfig();
  await saveConfig(workspaceDir, good);

  // Simulate an aborted write: leave a junk `.tmp` next to the real file.
  const tmpPath = path.join(workspaceDir, `${CONFIG_REL_PATH}.tmp`);
  await fs.writeFile(tmpPath, '{ "version": 1, "model": {}, ', 'utf8');

  const loaded = await loadConfig(workspaceDir);
  t.truthy(loaded, 'real file is still readable');
  t.is(loaded?.model.modelId, 'claude-sonnet-4-5');

  // The persistence layer never reads `.tmp`; its presence is purely a
  // historical artefact.  Confirm we do not accidentally honour it.
  const stillThere = await fs
    .stat(tmpPath)
    .then(() => true)
    .catch(() => false);
  t.true(stillThere, 'stray .tmp file is left untouched (caller cleans up)');
});

test('saveConfig — overwrites without leaving a stray .tmp behind', async t => {
  const workspaceDir = await makeWorkspace('overwrite');
  await saveConfig(workspaceDir, makeConfig());
  await saveConfig(
    workspaceDir,
    makeConfig({ modelId: 'claude-opus-4-1' }),
  );

  const tmpPath = path.join(workspaceDir, `${CONFIG_REL_PATH}.tmp`);
  const tmpExists = await fs
    .stat(tmpPath)
    .then(() => true)
    .catch(() => false);
  t.false(tmpExists, 'rename consumes the .tmp file on success');

  const loaded = await loadConfig(workspaceDir);
  t.is(loaded?.model.modelId, 'claude-opus-4-1');
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

test.serial('loadConfig — corrupt JSON returns undefined and warns', async t => {
  const workspaceDir = await makeWorkspace('corrupt');
  const filePath = path.join(workspaceDir, CONFIG_REL_PATH);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, '{not valid json', 'utf8');

  const { result, warnings } = await captureWarnings(() =>
    loadConfig(workspaceDir),
  );
  t.is(result, undefined);
  t.true(
    warnings.some(w => /invalid JSON/u.test(w)),
    `expected an "invalid JSON" warning, got ${JSON.stringify(warnings)}`,
  );
});

test.serial('loadConfig — wrong version returns undefined and warns', async t => {
  const workspaceDir = await makeWorkspace('wrong-version');
  const filePath = path.join(workspaceDir, CONFIG_REL_PATH);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify({ version: 999, model: {} }),
    'utf8',
  );

  const { result, warnings } = await captureWarnings(() =>
    loadConfig(workspaceDir),
  );
  t.is(result, undefined);
  t.true(
    warnings.some(w => /unsupported schema version/u.test(w)),
    `expected schema version warning, got ${JSON.stringify(warnings)}`,
  );
});

test.serial('validateConfig — missing model.provider returns undefined and warns', async t => {
  const { result, warnings } = await captureWarnings(async () =>
    validateConfig(
      { version: 1, model: { modelId: 'x', credentials: {}, options: {} } },
      '<test>',
    ),
  );
  t.is(result, undefined);
  t.true(warnings.some(w => /model\.provider/u.test(w)));
});

test.serial('validateConfig — non-string credential value returns undefined', async t => {
  const { result, warnings } = await captureWarnings(async () =>
    validateConfig(
      {
        version: 1,
        model: {
          provider: 'anthropic',
          modelId: 'x',
          credentials: { ANTHROPIC_API_KEY: 42 },
          options: {},
        },
      },
      '<test>',
    ),
  );
  t.is(result, undefined);
  t.true(warnings.some(w => /credentials/u.test(w)));
});

test('saveConfig — refuses a bad-version config without writing anything', async t => {
  const workspaceDir = await makeWorkspace('refuse');
  await t.throwsAsync(
    () =>
      saveConfig(
        workspaceDir,
        /** @type {any} */ ({ version: 2, model: makeConfig().model }),
      ),
    { message: /schema version/u },
  );
  // No file should have been created.
  const filePath = path.join(workspaceDir, CONFIG_REL_PATH);
  const exists = await fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
  t.false(exists, 'rejected config must not leave a file behind');
});

// ---------------------------------------------------------------------------
// File mode (POSIX-only)
// ---------------------------------------------------------------------------

test('saveConfig — POSIX file mode is 0600 after write', async t => {
  if (process.platform === 'win32') {
    t.pass('chmod is a no-op on Windows; mode assertion skipped');
    return;
  }
  const workspaceDir = await makeWorkspace('mode');
  await saveConfig(workspaceDir, makeConfig());
  const filePath = path.join(workspaceDir, CONFIG_REL_PATH);
  const stat = await fs.stat(filePath);
  // Mask off the file-type bits and check the perm bits only.
  // eslint-disable-next-line no-bitwise
  const perms = stat.mode & 0o777;
  t.is(
    perms,
    0o600,
    `expected 0600, got ${perms.toString(8).padStart(3, '0')}`,
  );
});

// ---------------------------------------------------------------------------
// clearConfig
// ---------------------------------------------------------------------------

test('clearConfig — removes the file', async t => {
  const workspaceDir = await makeWorkspace('clear');
  await saveConfig(workspaceDir, makeConfig());
  await clearConfig(workspaceDir);
  const filePath = path.join(workspaceDir, CONFIG_REL_PATH);
  const exists = await fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
  t.false(exists);
  // Subsequent loadConfig must observe the absence as the canonical
  // sentinel — undefined, no warning.
  const loaded = await loadConfig(workspaceDir);
  t.is(loaded, undefined);
});

test('clearConfig — missing file is a no-op (does not throw)', async t => {
  const workspaceDir = await makeWorkspace('clear-missing');
  await t.notThrowsAsync(() => clearConfig(workspaceDir));
});
