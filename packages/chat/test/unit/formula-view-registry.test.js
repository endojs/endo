// @ts-check

import 'ses';

import test from 'ava';

import {
  getFormulaViewSpec,
  listKnownFormulaTypes,
} from '@endo/spaces-util/formula-view-registry.js';

test('listKnownFormulaTypes covers the canonical daemon formula types', t => {
  const known = listKnownFormulaTypes();
  // The canonical daemon-side type list per
  // packages/daemon/src/formula-type.js. Each must have a registry
  // entry so the back face renders a coherent header (and not the
  // fallback "Unknown formula type" message) for everyday-encountered
  // formulas.
  //
  // Note: `keypair` is intentionally NOT in this list. The registry
  // carries a `keypair` spec (with the privateKey omission) as a
  // forward-looking placeholder for a daemon-side type that does not
  // yet exist in `formula-type.js`. See the privacy-suppression test
  // below for the registry-shape coverage of the placeholder spec.
  const canonical = [
    'eval',
    'lookup',
    'guest',
    'host',
    'directory',
    'pet-store',
    'mailbox-store',
    'mail-hub',
    'message',
    'make-archive',
    'make-from-tree',
    'make-unconfined',
    'peer',
    'pet-inspector',
    'handle',
    'invitation',
    'worker',
    'least-authority',
    'known-peers-store',
    'loopback-network',
    'readable-blob',
    'promise',
    'resolver',
    'marshal',
  ];
  for (const type of canonical) {
    t.true(known.includes(type), `registry missing canonical type ${type}`);
  }
});

test('getFormulaViewSpec returns the eval spec with source/endowments/worker', t => {
  const spec = getFormulaViewSpec('eval');
  t.is(spec.header, 'Evaluation');
  t.true(typeof spec.helpText === 'string' && spec.helpText.length > 0);
  t.deepEqual(spec.propertyList, ['source', 'endowments', 'worker']);
});

test('getFormulaViewSpec returns a fallback spec for unknown types', t => {
  const spec = getFormulaViewSpec('forward-looking-type-not-yet-registered');
  // The header is the type name itself so a power user can still see
  // what they are looking at; the property list is empty so the
  // empty-state row appears.
  t.is(spec.header, 'forward-looking-type-not-yet-registered');
  t.deepEqual(spec.propertyList, []);
  t.true(
    typeof spec.emptyStateText === 'string' && spec.emptyStateText.length > 0,
    'fallback spec carries an empty-state hint',
  );
});

test('the keypair spec omits privateKey for safety', t => {
  const spec = getFormulaViewSpec('keypair');
  t.deepEqual(spec.propertyList, ['publicKey']);
  t.true(
    Array.isArray(spec.omitProperties) &&
      (spec.omitProperties || []).includes('privateKey'),
    'privateKey is in omitProperties so the back face suppresses it',
  );
});

test('leaf types render with an explicit empty-state row, not silently', t => {
  for (const type of [
    'worker',
    'pet-store',
    'mailbox-store',
    'least-authority',
    'known-peers-store',
    'loopback-network',
  ]) {
    const spec = getFormulaViewSpec(type);
    t.deepEqual(spec.propertyList, [], `${type} has no surfaced properties`);
    t.true(
      typeof spec.emptyStateText === 'string' && spec.emptyStateText.length > 0,
      `${type} has explicit empty-state text`,
    );
  }
});

test('forward-looking types fall back to a "not yet exposed" hint', t => {
  // Per designs/formula-inspector.md, types whose daemon-side metadata
  // has not yet shipped render with a one-line "Properties not yet
  // exposed; see <design-link>" message so the gap is visible.
  for (const type of ['git', 'git-credential', 'git-remote', 'channel']) {
    const spec = getFormulaViewSpec(type);
    t.deepEqual(spec.propertyList, []);
    t.regex(
      spec.emptyStateText || '',
      /not yet exposed|designs\//,
      `${type} surfaces a not-yet-exposed hint`,
    );
  }
});

test('the registry is frozen so callers cannot mutate per-type specs', t => {
  const spec = getFormulaViewSpec('eval');
  t.true(Object.isFrozen(spec), 'eval spec is frozen');
});
