// @ts-check

/**
 * Tests for the `rootfs` form-field validation helpers in
 * `packages/genie/main.js`:
 *
 *   - `parseRootfsValue(value, { agentName })` parses the
 *     keyword-only subset (`host-bind`, `minimal`, `oci:<ref>`) of
 *     `RootfsSpec` exposed via the configuration form, plus the
 *     pet-name marker (`{ kind: 'pet-name', petName }`) that
 *     `spawnAgent` resolves to a Mount cap before passing into
 *     `E(sandboxFactory).make(...)`.
 *   - `assertRootfsBackendCompatible(rootfs, backend, { agentName })`
 *     front-runs the bwrap driver's structured rejection of the
 *     `oci:` shape so the operator sees a friendly message naming
 *     the agent before `E(sandboxFactory).make(...)` is reached.
 *   - `isAllowedRootfsKind` and `ALLOWED_ROOTFS_KINDS` mirror the
 *     pattern used by the network / backend allow-lists.
 *
 * The pet-name -> Mount-cap resolution itself lives in `spawnAgent`
 * (it requires an `E(agentGuest).lookup(...)` round-trip and the
 * `__getMethodNames__()` validation against `MountInterface`), so the
 * tests here only cover the synchronous form-side parse — the marker
 * shape and the round-trip from a non-keyword value through to the
 * pet-name branch.  See `TODO/52_genie_rootfs_mount_cap.md`.
 */

import '@endo/init/debug.js';

import test from 'ava';

import {
  ALLOWED_ROOTFS_KINDS,
  assertRootfsBackendCompatible,
  isAllowedRootfsKind,
  parseRootfsValue,
} from '../main.js';

// ---------------------------------------------------------------------------
// ALLOWED_ROOTFS_KINDS / isAllowedRootfsKind
// ---------------------------------------------------------------------------

test('ALLOWED_ROOTFS_KINDS — keyword-only subset, frozen', t => {
  t.deepEqual([...ALLOWED_ROOTFS_KINDS], ['host-bind', 'minimal']);
  t.true(Object.isFrozen(ALLOWED_ROOTFS_KINDS));
});

test('isAllowedRootfsKind — accepts the keyword-only subset', t => {
  t.true(isAllowedRootfsKind('host-bind'));
  t.true(isAllowedRootfsKind('minimal'));
});

test('isAllowedRootfsKind — rejects payload-carrying and unknown shapes', t => {
  // The OCI shape carries a payload and is parsed separately; the
  // bare keyword `'oci'` is not a member of `ALLOWED_ROOTFS_KINDS`.
  t.false(isAllowedRootfsKind('oci'));
  t.false(isAllowedRootfsKind('oci:docker.io/library/alpine:3.19'));
  t.false(isAllowedRootfsKind('host'));
  t.false(isAllowedRootfsKind(''));
});

// ---------------------------------------------------------------------------
// parseRootfsValue — happy paths
// ---------------------------------------------------------------------------

test('parseRootfsValue — host-bind', t => {
  const rootfs = parseRootfsValue('host-bind', { agentName: 'main-genie' });
  t.deepEqual(rootfs, { kind: 'host-bind' });
  t.true(Object.isFrozen(rootfs));
});

test('parseRootfsValue — minimal', t => {
  const rootfs = parseRootfsValue('minimal', { agentName: 'main-genie' });
  t.deepEqual(rootfs, { kind: 'minimal' });
  t.true(Object.isFrozen(rootfs));
});

test('parseRootfsValue — oci:<ref> peels the prefix and keeps the ref', t => {
  const rootfs = parseRootfsValue('oci:docker.io/library/alpine:3.19', {
    agentName: 'main-genie',
  });
  t.deepEqual(rootfs, {
    kind: 'oci',
    ref: 'docker.io/library/alpine:3.19',
  });
  t.true(Object.isFrozen(rootfs));
});

// ---------------------------------------------------------------------------
// parseRootfsValue — error paths
// ---------------------------------------------------------------------------

test('parseRootfsValue — empty oci:<ref> rejects with structured error', async t => {
  await t.throwsAsync(
    async () => parseRootfsValue('oci:', { agentName: 'main-genie' }),
    {
      message:
        /agent "main-genie": rootfs "oci:" is missing the OCI image reference/,
    },
  );
});

test('parseRootfsValue — empty string names the agent and lists accepted kinds', async t => {
  await t.throwsAsync(
    async () => parseRootfsValue('', { agentName: 'side-genie' }),
    {
      message:
        /agent "side-genie": rootfs value is empty; expected one of "host-bind, minimal", "oci:<ref>", or a pet name/,
    },
  );
});

test('parseRootfsValue — non-string value rejects with structured error', async t => {
  await t.throwsAsync(
    async () =>
      parseRootfsValue(/** @type {any} */ (42), { agentName: 'main-genie' }),
    {
      message:
        /agent "main-genie": rootfs value must be a string; got "number"/,
    },
  );
});

// ---------------------------------------------------------------------------
// parseRootfsValue — pet-name marker (TODO/52, Seam 2)
// ---------------------------------------------------------------------------

test('parseRootfsValue — bare pet name returns pet-name marker', t => {
  // Unknown values that don't match a keyword or `oci:<ref>` shape
  // are no longer an error at parse time; they fall through to the
  // pet-name branch so `spawnAgent` can resolve them via
  // `E(agentGuest).lookup(...)` and validate against `MountInterface`.
  const rootfs = parseRootfsValue('rootfs-mount', { agentName: 'main-genie' });
  t.deepEqual(rootfs, { kind: 'pet-name', petName: 'rootfs-mount' });
  t.true(Object.isFrozen(rootfs));
});

test('parseRootfsValue — pet name preserves arbitrary identifier shape', t => {
  // The form-side parse does not constrain the petName beyond
  // "non-empty string that does not match a keyword shape"; daemon
  // pet-name validity is enforced by `E(agentGuest).lookup(...)`.
  const rootfs = parseRootfsValue('overlay-tree-2025', {
    agentName: 'side-genie',
  });
  t.deepEqual(rootfs, { kind: 'pet-name', petName: 'overlay-tree-2025' });
});

// ---------------------------------------------------------------------------
// assertRootfsBackendCompatible
// ---------------------------------------------------------------------------

test('assertRootfsBackendCompatible — allows host-bind on every backend', t => {
  for (const backend of ['auto', 'bwrap', 'podman', 'lima']) {
    t.notThrows(() =>
      assertRootfsBackendCompatible({ kind: 'host-bind' }, backend, {
        agentName: 'main-genie',
      }),
    );
  }
});

test('assertRootfsBackendCompatible — allows minimal on every backend', t => {
  for (const backend of ['auto', 'bwrap', 'podman', 'lima']) {
    t.notThrows(() =>
      assertRootfsBackendCompatible({ kind: 'minimal' }, backend, {
        agentName: 'main-genie',
      }),
    );
  }
});

test('assertRootfsBackendCompatible — allows oci:<ref> on podman', t => {
  t.notThrows(() =>
    assertRootfsBackendCompatible(
      { kind: 'oci', ref: 'docker.io/library/alpine:3.19' },
      'podman',
      { agentName: 'main-genie' },
    ),
  );
});

test('assertRootfsBackendCompatible — allows the pet-name marker on every backend', t => {
  // A Mount-cap rootfs is compatible with both bwrap and podman, so
  // the cross-validation is a no-op for the pet-name marker — only
  // `oci` + `bwrap` is rejected.  See TODO/52, Seam 2 deliverables.
  for (const backend of ['auto', 'bwrap', 'podman', 'lima']) {
    t.notThrows(() =>
      assertRootfsBackendCompatible(
        { kind: 'pet-name', petName: 'rootfs-mount' },
        backend,
        { agentName: 'main-genie' },
      ),
    );
  }
});

test('assertRootfsBackendCompatible — rejects oci:<ref> on bwrap with friendly message', async t => {
  await t.throwsAsync(
    async () =>
      assertRootfsBackendCompatible(
        { kind: 'oci', ref: 'docker.io/library/alpine:3.19' },
        'bwrap',
        { agentName: 'main-genie' },
      ),
    {
      message:
        /agent "main-genie": rootfs "oci:docker\.io\/library\/alpine:3\.19" is incompatible with "backend: bwrap"; set "backend" to "podman" or pick a non-oci rootfs/,
    },
  );
});
