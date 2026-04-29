// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

import * as nodeCrypto from 'node:crypto';
import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Phase 1.5 deliverable: "Add a unit test that asserts the JSON
 * matches a checked-in fixture (so changes are deliberate)."
 *
 * Implementation: SHA-256 the JSON profile and compare to a
 * checked-in expected hash.  Anyone who modifies `default.json` must
 * also update the hash here, which forces the change through code
 * review.  The matching `default.json.md` must record the new
 * snapshot date in the same change.
 *
 * The hash is computed over the file bytes as committed (LF
 * line-endings, no BOM).  If a contributor accidentally introduces
 * CRLF line endings the hash will diverge, which is the desired
 * signal.
 */

const here = nodePath.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = nodePath.resolve(
  here,
  '..',
  'src',
  'seccomp',
  'default.json',
);
const PROFILE_DOC_PATH = `${PROFILE_PATH}.md`;

/**
 * Expected hash of `src/seccomp/default.json` as of the snapshot
 * documented in `default.json.md`.  Update both when refreshing the
 * profile against upstream `containers/common`.
 */
const EXPECTED_SHA256 =
  '99cf08accf04a1e2cab5b999b1a9347143adcacc80915ed73d71130839b477ee';

test('default.json matches the checked-in fixture hash', t => {
  const bytes = nodeFs.readFileSync(PROFILE_PATH);
  const actual = nodeCrypto.createHash('sha256').update(bytes).digest('hex');
  t.is(
    actual,
    EXPECTED_SHA256,
    [
      'Seccomp profile drift detected.',
      'If this change is deliberate:',
      '  1. Update EXPECTED_SHA256 in test/seccomp-fixture.test.js,',
      '  2. Update the snapshot date / source notes in',
      '     src/seccomp/default.json.md,',
      '  3. Diff against the rebased upstream and document any',
      '     newly added or removed syscalls in the commit message.',
    ].join('\n'),
  );
});

test('default.json parses as valid JSON with the expected top-level shape', t => {
  const text = nodeFs.readFileSync(PROFILE_PATH, 'utf8');
  /** @type {any} */
  const parsed = JSON.parse(text);
  t.is(parsed.defaultAction, 'SCMP_ACT_ERRNO', 'default-deny on miss');
  t.true(Array.isArray(parsed.archMap), 'archMap is present');
  if (t.true(Array.isArray(parsed.syscalls), 'syscalls is present')) {
    t.true(/** @type {Array<any>} */ (parsed.syscalls).length > 0);
  }
});

test('default.json includes io_uring_* (Phase 1.5 podman-defaults rebase)', t => {
  /** @type {any} */
  const parsed = JSON.parse(nodeFs.readFileSync(PROFILE_PATH, 'utf8'));
  /** @type {string[]} */
  const allowed = [];
  for (const block of parsed.syscalls) {
    if (block.action === 'SCMP_ACT_ALLOW') {
      for (const name of block.names) allowed.push(name);
    }
  }
  for (const name of [
    'io_uring_setup',
    'io_uring_enter',
    'io_uring_register',
  ]) {
    t.true(
      allowed.includes(name),
      `${name} should be in the Phase 1.5-rebased allowlist`,
    );
  }
  // Sanity: privileged ops the README-rationale calls out as
  // explicitly omitted should NOT be in the allowlist.
  for (const denied of [
    'mount',
    'pivot_root',
    'init_module',
    'kexec_load',
    'reboot',
  ]) {
    t.false(
      allowed.includes(denied),
      `${denied} must remain denied (default action errno)`,
    );
  }
});

test('default.json.md documents the snapshot provenance', t => {
  const doc = nodeFs.readFileSync(PROFILE_DOC_PATH, 'utf8');
  t.regex(doc, /Source/i);
  t.regex(doc, /Snapshot date/i);
  t.regex(doc, /containers\/common/i);
});
