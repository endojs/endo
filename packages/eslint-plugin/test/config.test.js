/* eslint-disable no-shadow */
'use strict';

/**
 * Regression tests for the migrated flat config.  Asserts that:
 *   - @stylistic formatting rules survive eslint-config-prettier v10.
 *   - Core ESLint formatting rules (quotes, indent) are turned off by prettier.
 *   - Representative logic rules from the inlined airbnb-base rules are active.
 *   - eslint:recommended rules are present in flat/recommended.
 *   - import/* rules are wired up via eslint-plugin-import.
 */

import assert from 'node:assert';
import { describe, it, before } from 'node:test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { configs } from '../src/index.js';

const pluginDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Compute the resolved rule config for a virtual `.js` file under a given
 * flat config array.  Returns the `rules` map from calculateConfigForFile.
 *
 * @param {import('eslint').Linter.Config[]} configs
 * @param {string} [filePath]
 * @returns {Promise<Record<string, unknown>>}
 */
async function getRules(configs, filePath = 'src/foo.js') {
  const eslint = new ESLint({
    cwd: pluginDir,
    overrideConfigFile: true,
    overrideConfig: configs,
  });
  const config = await eslint.calculateConfigForFile(filePath);
  if (!config)
    throw new Error(
      `calculateConfigForFile returned undefined for ${filePath}`,
    );
  return config.rules ?? {};
}

/** @param {unknown} severity - 0/'off', 1/'warn', 2/'error' or an array */
function severityOf(severity) {
  const s = Array.isArray(severity) ? severity[0] : severity;
  if (s === 'error' || s === 2) return 2;
  if (s === 'warn' || s === 1) return 1;
  return 0;
}

describe('flat/recommended', () => {
  /** @type {Record<string, unknown>} */
  let rules;

  before(async () => {
    rules = await getRules(configs['flat/recommended']);
  });

  it('has no-undef from eslint:recommended', () => {
    assert.strictEqual(severityOf(rules['no-undef']), 2);
  });

  it('has guard-for-in from endo recommendedRules', () => {
    assert.strictEqual(severityOf(rules['guard-for-in']), 2);
  });

  it('has no-var (airbnb es6 logic rule)', () => {
    assert.strictEqual(severityOf(rules['no-var']), 2);
  });

  it('has eqeqeq (airbnb best-practices rule)', () => {
    assert.strictEqual(severityOf(rules.eqeqeq), 2);
  });

  it('has no-bitwise (airbnb style logic rule)', () => {
    assert.strictEqual(severityOf(rules['no-bitwise']), 2);
  });

  it('has no-shadow (airbnb variables rule)', () => {
    assert.strictEqual(severityOf(rules['no-shadow']), 2);
  });

  it('has import/no-cycle from @endo/eslint-plugin compat rules', () => {
    // import/* rules come from flat/imports, not flat/recommended.
    // This rule should NOT be present in flat/recommended alone.
    assert.strictEqual(rules['import/no-cycle'], undefined);
  });
});

describe('flat/style', () => {
  /** @type {Record<string, unknown>} */
  let rules;

  before(async () => {
    rules = await getRules(configs['flat/style']);
  });

  it('@stylistic/quotes is enabled (single quotes)', () => {
    const rule = rules['@stylistic/quotes'];
    assert.ok(rule !== undefined, '@stylistic/quotes must be set');
    const entry = Array.isArray(rule) ? rule : [rule];
    assert.strictEqual(severityOf(entry[0]), 2);
    assert.strictEqual(entry[1], 'single');
  });

  it('@stylistic/comma-dangle is enabled (always-multiline)', () => {
    const rule = rules['@stylistic/comma-dangle'];
    assert.ok(rule !== undefined, '@stylistic/comma-dangle must be set');
    const entry = Array.isArray(rule) ? rule : [rule];
    assert.strictEqual(severityOf(entry[0]), 2);
    assert.strictEqual(entry[1], 'always-multiline');
  });

  it('core quotes rule is off (prettier handles it)', () => {
    // eslint-config-prettier v10 turns off the deprecated core quotes rule.
    // Our config no longer sets it directly.
    const q = rules.quotes;
    assert.ok(
      q === undefined || severityOf(q) === 0,
      `core quotes rule should be off, got ${JSON.stringify(q)}`,
    );
  });

  it('core indent rule is off (prettier handles it)', () => {
    const ind = rules.indent;
    assert.ok(
      ind === undefined || severityOf(ind) === 0,
      `core indent rule should be off, got ${JSON.stringify(ind)}`,
    );
  });
});

describe('flat/strict', () => {
  /** @type {Record<string, unknown>} */
  let rules;

  before(async () => {
    rules = await getRules(configs['flat/strict']);
  });

  it('@stylistic/quotes survives in strict config', () => {
    assert.strictEqual(severityOf(rules['@stylistic/quotes']), 2);
  });

  it('import/no-cycle is present from flat/imports', () => {
    assert.strictEqual(severityOf(rules['import/no-cycle']), 2);
  });

  it('camelcase is active from inlined airbnb style rules', () => {
    assert.strictEqual(severityOf(rules.camelcase), 2);
  });

  it('no-plusplus is active from inlined airbnb style rules', () => {
    assert.strictEqual(severityOf(rules['no-plusplus']), 2);
  });

  it('no-nested-ternary is active', () => {
    assert.strictEqual(severityOf(rules['no-nested-ternary']), 2);
  });

  it('prefer-template is active (no string concatenation)', () => {
    assert.strictEqual(severityOf(rules['prefer-template']), 2);
  });

  it('no-fallthrough is a warning (endo override of airbnb error)', () => {
    assert.strictEqual(severityOf(rules['no-fallthrough']), 1);
  });

  it('no-inner-declarations is off (endo override)', () => {
    assert.strictEqual(severityOf(rules['no-inner-declarations']), 0);
  });
});
