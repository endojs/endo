import test from '@endo/ses-ava/prepare-endo.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  parseJsonc,
  readConfigFile,
  writeConfigFile,
  resolveConfig,
  getConfigFilePath,
  configKeys,
  defaultConfig,
} from '../config.js';

// ---- JSONC parsing ----

test('parseJsonc handles plain JSON', t => {
  const result = parseJsonc('{"a": 1, "b": "two"}');
  t.deepEqual(result, { a: 1, b: 'two' });
});

test('parseJsonc strips single-line comments', t => {
  const input = `{
    // this is a comment
    "key": "value"
  }`;
  const result = parseJsonc(input);
  t.deepEqual(result, { key: 'value' });
});

test('parseJsonc strips multi-line comments', t => {
  const input = `{
    /* multi
       line */
    "key": "value"
  }`;
  const result = parseJsonc(input);
  t.deepEqual(result, { key: 'value' });
});

test('parseJsonc handles trailing commas', t => {
  const input = `{
    "a": 1,
    "b": 2,
  }`;
  const result = parseJsonc(input);
  t.deepEqual(result, { a: 1, b: 2 });
});

test('parseJsonc does not mangle strings containing //', t => {
  const input = '{"url": "https://example.com"}';
  const result = parseJsonc(input);
  t.deepEqual(result, { url: 'https://example.com' });
});

test('parseJsonc does not mangle strings containing /* */', t => {
  const input = '{"pattern": "/* not a comment */"}';
  const result = parseJsonc(input);
  t.deepEqual(result, { pattern: '/* not a comment */' });
});

// ---- getConfigFilePath ----

test('getConfigFilePath honors ENDO_CONFIG', t => {
  const p = getConfigFilePath({ ENDO_CONFIG: '/tmp/my-config.jsonc' });
  t.is(p, '/tmp/my-config.jsonc');
});

test('getConfigFilePath falls back to XDG_CONFIG_HOME', t => {
  const p = getConfigFilePath({ XDG_CONFIG_HOME: '/xdg/config' });
  t.is(p, path.join('/xdg/config', 'endo', 'config.jsonc'));
});

// ---- readConfigFile / writeConfigFile round-trip ----

test('readConfigFile returns empty for missing file', async t => {
  const result = await readConfigFile('/tmp/nonexistent-endo-config-test.jsonc');
  t.deepEqual(result, {});
});

test('writeConfigFile and readConfigFile round-trip', async t => {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'endo-config-test-'),
  );
  const configPath = path.join(tmpDir, 'config.jsonc');

  try {
    await writeConfigFile({ statePath: '/my/state' }, configPath);
    const result = await readConfigFile(configPath);
    t.is(result.statePath, '/my/state');
    t.is(result.sockPath, undefined);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test('writeConfigFile merges with existing values', async t => {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'endo-config-test-'),
  );
  const configPath = path.join(tmpDir, 'config.jsonc');

  try {
    await writeConfigFile({ statePath: '/my/state' }, configPath);
    await writeConfigFile({ sockPath: '/my/sock' }, configPath);
    const result = await readConfigFile(configPath);
    t.is(result.statePath, '/my/state');
    t.is(result.sockPath, '/my/sock');
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---- resolveConfig priority ----

test('resolveConfig uses defaults when no env or file', async t => {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'endo-config-test-'),
  );
  const configPath = path.join(tmpDir, 'config.jsonc');

  try {
    // No file written, no ENDO_* env vars set
    const env = { ENDO_CONFIG: configPath };
    const config = await resolveConfig(env, configPath);
    // Should match the defaults
    t.is(config.statePath, defaultConfig.statePath);
    t.is(config.sockPath, defaultConfig.sockPath);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test('resolveConfig: file overrides defaults', async t => {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'endo-config-test-'),
  );
  const configPath = path.join(tmpDir, 'config.jsonc');

  try {
    await writeConfigFile({ statePath: '/file/state' }, configPath);
    const env = { ENDO_CONFIG: configPath };
    const config = await resolveConfig(env, configPath);
    t.is(config.statePath, '/file/state');
    // Other keys remain as defaults
    t.is(config.sockPath, defaultConfig.sockPath);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test('resolveConfig: env overrides file', async t => {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'endo-config-test-'),
  );
  const configPath = path.join(tmpDir, 'config.jsonc');

  try {
    await writeConfigFile({ statePath: '/file/state' }, configPath);
    const env = {
      ENDO_CONFIG: configPath,
      ENDO_STATE_PATH: '/env/state',
    };
    const config = await resolveConfig(env, configPath);
    t.is(config.statePath, '/env/state');
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---- configKeys and defaultConfig are well-formed ----

test('configKeys matches defaultConfig keys', t => {
  for (const key of configKeys) {
    t.true(key in defaultConfig, `defaultConfig should have key ${key}`);
    t.is(typeof defaultConfig[key], 'string', `${key} should be a string`);
  }
});
