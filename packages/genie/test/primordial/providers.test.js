// @ts-check

/**
 * Tests for `PROVIDER_CREDENTIAL_SPEC` — the hard-coded provider catalog
 * consumed by the `/model` builtin (sub-task 95 of
 * `TODO/92_genie_primordial.md`).
 *
 * These assertions are the bridge between the genie-side spec table and
 * pi-ai's `getEnvApiKey` helper: every non-ollama provider name in our
 * catalog must be one pi-ai recognises, and at least one of the spec's
 * `requiredCreds` / `altCreds` env vars must satisfy `getEnvApiKey` when
 * the other pi-ai-side env vars are stripped from the environment.
 *
 * The `ollama` entry is explicitly carved out of the pi-ai contract: it
 * targets a local endpoint via an OpenAI-compatible API, so pi-ai does
 * not register a credential env key for it.  We assert its shape
 * separately — empty `requiredCreds`, no `altCreds`, and `OLLAMA_HOST` /
 * `OLLAMA_API_KEY` present as optional options — so a regression that
 * accidentally demands a credential still surfaces.
 */

import '../setup.js';

import test from 'ava';

import { getEnvApiKey } from '@mariozechner/pi-ai';

import {
  PROVIDER_CREDENTIAL_SPEC,
  PROVIDER_NAMES,
  getProviderSpec,
  listKnownKeys,
} from '../../src/primordial/providers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The union of every env-var name any provider in the catalog mentions —
 * used to scrub `process.env` before driving `getEnvApiKey` so stale
 * credentials from the developer's shell do not leak into assertions.
 */
const EVERY_CANDIDATE_ENV_VAR = (() => {
  const names = new Set();
  for (const name of PROVIDER_NAMES) {
    const spec = PROVIDER_CREDENTIAL_SPEC[name];
    for (const key of spec.requiredCreds) names.add(key);
    for (const key of spec.altCreds || []) names.add(key);
    for (const key of spec.optionalOptions) names.add(key);
  }
  return [...names];
})();

/**
 * Snapshot the subset of `process.env` the test may mutate, so
 * `test.afterEach` can restore it verbatim.  Plain `process.env` writes
 * work fine under ava — the test framework runs each file in its own
 * worker — but per-test isolation keeps the assertions independent when
 * they do share process state.
 */
const snapshotEnv = () => {
  /** @type {Record<string, string | undefined>} */
  const snap = {};
  for (const key of EVERY_CANDIDATE_ENV_VAR) {
    snap[key] = process.env[key];
  }
  return snap;
};

/** @param {Record<string, string | undefined>} snap */
const restoreEnv = snap => {
  for (const key of Object.keys(snap)) {
    const value = snap[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

/**
 * Clear every candidate env var so `getEnvApiKey` reads from a clean
 * slate.  Called at the top of each pi-ai-bridge test.
 */
const scrubEnv = () => {
  for (const key of EVERY_CANDIDATE_ENV_VAR) {
    delete process.env[key];
  }
};

// ---------------------------------------------------------------------------
// Catalog shape
// ---------------------------------------------------------------------------

test('PROVIDER_NAMES lists every key in PROVIDER_CREDENTIAL_SPEC', t => {
  t.deepEqual(
    [...PROVIDER_NAMES].sort(),
    Object.keys(PROVIDER_CREDENTIAL_SPEC).sort(),
  );
});

test('getProviderSpec returns the spec object for known names', t => {
  for (const name of PROVIDER_NAMES) {
    const spec = getProviderSpec(name);
    t.truthy(spec, `expected a spec for ${name}`);
    t.is(spec, PROVIDER_CREDENTIAL_SPEC[name]);
  }
});

test('getProviderSpec returns undefined for unknown / non-string input', t => {
  t.is(getProviderSpec('no-such-provider'), undefined);
  t.is(getProviderSpec(''), undefined);
  t.is(getProviderSpec(/** @type {any} */ (undefined)), undefined);
  t.is(getProviderSpec(/** @type {any} */ (42)), undefined);
});

test('every spec entry has the documented fields', t => {
  for (const name of PROVIDER_NAMES) {
    const spec = PROVIDER_CREDENTIAL_SPEC[name];
    t.is(typeof spec.api, 'string', `${name}.api is a string`);
    t.true(spec.api.length > 0, `${name}.api is non-empty`);
    t.true(
      Array.isArray(spec.requiredCreds),
      `${name}.requiredCreds is an array`,
    );
    t.true(
      Array.isArray(spec.optionalOptions),
      `${name}.optionalOptions is an array`,
    );
    if (spec.altCreds !== undefined) {
      t.true(
        Array.isArray(spec.altCreds),
        `${name}.altCreds is an array when present`,
      );
    }
    t.is(typeof spec.notes, 'string', `${name}.notes is a string`);
    t.true(spec.notes.length > 0, `${name}.notes is non-empty`);
  }
});

test('listKnownKeys returns the union of required + alt + optional', t => {
  for (const name of PROVIDER_NAMES) {
    const spec = PROVIDER_CREDENTIAL_SPEC[name];
    const known = listKnownKeys(spec);
    const expected = [
      ...spec.requiredCreds,
      ...(spec.altCreds || []),
      ...spec.optionalOptions,
    ];
    t.deepEqual([...known], expected);
  }
});

// ---------------------------------------------------------------------------
// Ollama — the local carve-out
// ---------------------------------------------------------------------------

test('ollama is configured as a local endpoint with no required credentials', t => {
  const spec = PROVIDER_CREDENTIAL_SPEC.ollama;
  t.truthy(spec, 'ollama must be listed in the catalog');
  t.deepEqual([...spec.requiredCreds], [], 'ollama has no required creds');
  t.is(spec.altCreds, undefined, 'ollama has no alt creds');
  t.true(
    spec.optionalOptions.includes('OLLAMA_HOST'),
    'ollama exposes OLLAMA_HOST as an option',
  );
  t.true(
    spec.optionalOptions.includes('OLLAMA_API_KEY'),
    'ollama exposes OLLAMA_API_KEY as an option',
  );
});

// ---------------------------------------------------------------------------
// pi-ai bridge — every non-ollama provider must round-trip through
// `getEnvApiKey`.
// ---------------------------------------------------------------------------

test.serial(
  'every non-ollama provider is recognised by pi-ai getEnvApiKey',
  t => {
    const snap = snapshotEnv();
    try {
      for (const name of PROVIDER_NAMES) {
        if (name === 'ollama') continue;
        const spec = PROVIDER_CREDENTIAL_SPEC[name];
        const union = [...spec.requiredCreds, ...(spec.altCreds || [])];
        t.true(
          union.length > 0,
          `${name} must declare at least one credential env var`,
        );
        // For each declared credential, stamping it into process.env
        // should let pi-ai resolve the provider.  This proves our
        // provider name + env-var name pair matches the pi-ai-side map.
        for (const envKey of union) {
          scrubEnv();
          process.env[envKey] = `test-${name}-${envKey}`;
          const resolved = getEnvApiKey(name);
          t.is(
            resolved,
            `test-${name}-${envKey}`,
            `pi-ai getEnvApiKey(${JSON.stringify(name)}) must return ${envKey}`,
          );
        }
      }
    } finally {
      restoreEnv(snap);
    }
  },
);

test.serial('pi-ai getEnvApiKey returns undefined when no env is set', t => {
  const snap = snapshotEnv();
  try {
    scrubEnv();
    for (const name of PROVIDER_NAMES) {
      if (name === 'ollama') continue;
      // With every candidate env var stripped, pi-ai cannot resolve an
      // API key for the provider.  Assert that so a regression that
      // flips the default to a shared global key surfaces here.
      const resolved = getEnvApiKey(name);
      t.is(
        resolved,
        undefined,
        `pi-ai must return undefined for ${name} when no env var is set`,
      );
    }
  } finally {
    restoreEnv(snap);
  }
});
