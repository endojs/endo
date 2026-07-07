// @ts-nocheck
import test from '@endo/ses-ava/prepare-endo.js';

import {
  addressesFromLocator,
  assertValidLocator,
  formatLocator,
  formatLocatorForSharing,
  formatLocatorWithHints,
  hintsFromLocator,
  idFromLocator,
  parseLocator,
  externalizeId,
  internalizeLocator,
} from '../src/locator.js';
import { formatId, parseId } from '../src/formula-identifier.js';

/** @import { FormulaNumber, NodeNumber } from '../src/types.js' */

const validNode = /** @type {NodeNumber} */ (
  'd5c98890be3d17ad375517464ec494068267de60bd4b3143ef0214cc895746f2'
);
const validId = /** @type {FormulaNumber} */ (
  '5cf3d8b4d6e03fb51d71fbbb6fa6982edbff673cd193707c902b70a26b7b4680'
);
const validType = 'eval';

/**
 * Build a locator string for testing using the `@`-delimited URL-encoded
 * path-component format:
 *   endo://{host}/{number}?type={type}
 */
const makeLocator = (components = {}) => {
  const {
    protocol = 'endo://',
    host = validNode,
    number = validId,
    type = validType,
  } = components;
  return `${protocol}${host}/${number}?type=${type}`;
};

test('assertValidLocator - valid', t => {
  t.notThrows(() => assertValidLocator(makeLocator()));
});

test('assertValidLocator - invalid', t => {
  /** @type {Array<[any, RegExp]>} */
  const cases = [
    ['foobar', /Invalid URL.$/u],
    ['', /Invalid URL.$/u],
    [null, /Invalid URL.$/u],
    [undefined, /Invalid URL.$/u],
    [{}, /Invalid URL.$/u],
    [makeLocator({ protocol: 'foobar://' }), /Invalid protocol.$/u],
    [makeLocator({ host: 'foobar' }), /Invalid node identifier.$/u],
    [`endo://${validNode}/?type=${validType}`, /Missing formula number.$/u],
    [
      `endo://${validNode}/${validId}?type=${validType}&foo=bar`,
      /Invalid search params.$/u,
    ],
    [makeLocator({ number: 'foobar' }), /Invalid id.$/u],
    [makeLocator({ type: 'foobar' }), /Invalid type.$/u],
  ];
  for (const [locator, reason] of cases) {
    t.throws(() => assertValidLocator(locator), { message: reason });
  }
});

test('parseLocator', t => {
  t.deepEqual(parseLocator(makeLocator()), {
    number: validId,
    node: validNode,
    formulaType: validType,
    hints: [],
  });
});

test('formatLocator', t => {
  t.is(
    formatLocator(formatId({ number: validId, node: validNode }), validType),
    makeLocator(),
  );
});

test('idFromLocator', t => {
  t.is(
    idFromLocator(makeLocator()),
    formatId({ number: validId, node: validNode }),
  );
});

// --- Connection hints in `@`-delimited path components ---

test('parseLocator - single connection hint', t => {
  const hint = 'tcp+netstring+json+captp0://127.0.0.1:54321';
  const locator = `endo://${validNode}/${validId}@${encodeURIComponent(hint)}?type=${validType}`;
  const parsed = parseLocator(locator);
  t.is(parsed.number, validId);
  t.is(parsed.node, validNode);
  t.is(parsed.formulaType, validType);
  t.deepEqual(parsed.hints, [hint]);
});

test('parseLocator - multiple connection hints (ws + libp2p + tor)', t => {
  const hints = [
    'ws-relay+captp0://example.com:8920',
    'libp2p+captp0:///peer1',
    'tor:abc123def456.onion:443',
  ];
  const path = [validId, ...hints].map(encodeURIComponent).join('@');
  const locator = `endo://${validNode}/${path}?type=${validType}`;
  const parsed = parseLocator(locator);
  t.deepEqual(parsed.hints, hints);
});

test('parseLocator - hint containing `@` round-trips via URL-encoding', t => {
  // A hostname that contains an `@` sign (e.g., user@host) must be
  // URL-encoded inside the path component so it does not split the path.
  const hint = 'tcp:user@example.com:8920';
  const path = [validId, hint].map(encodeURIComponent).join('@');
  const locator = `endo://${validNode}/${path}?type=${validType}`;
  const parsed = parseLocator(locator);
  t.deepEqual(parsed.hints, [hint]);
});

test('parseLocator - hint containing `/` and `?` round-trips', t => {
  const hint = 'libp2p+captp0:///peer/with?slashes';
  const path = [validId, hint].map(encodeURIComponent).join('@');
  const locator = `endo://${validNode}/${path}?type=${validType}`;
  const parsed = parseLocator(locator);
  t.deepEqual(parsed.hints, [hint]);
});

test('formatLocatorWithHints', t => {
  const id = formatId({ number: validId, node: validNode });
  const hints = ['iroh+captp0:///peer1', 'tcp+captp0://127.0.0.1:8940'];
  const locator = formatLocatorWithHints(id, validType, hints);
  t.true(locator.startsWith('endo://'));
  const parsed = parseLocator(locator);
  t.is(parsed.number, validId);
  t.is(parsed.node, validNode);
  t.is(parsed.formulaType, validType);
  t.deepEqual(parsed.hints, hints);
  const extractedHints = hintsFromLocator(locator);
  t.deepEqual(extractedHints, hints);
});

test('formatLocatorWithHints - no hints', t => {
  const id = formatId({ number: validId, node: validNode });
  const locator = formatLocatorWithHints(id, validType, []);
  t.is(locator, formatLocator(id, validType));
  t.deepEqual(hintsFromLocator(locator), []);
});

test('formatLocatorWithHints - hint with `@` round-trips', t => {
  const id = formatId({ number: validId, node: validNode });
  const hints = ['tcp:user@example.com:8920'];
  const locator = formatLocatorWithHints(id, validType, hints);
  // The `@` inside the hint is URL-encoded so it does not split the path.
  t.true(locator.includes('user%40example.com'));
  t.deepEqual(hintsFromLocator(locator), hints);
});

test('hintsFromLocator - plain locator returns empty', t => {
  t.deepEqual(hintsFromLocator(makeLocator()), []);
});

test('previous connection-hint helper names remain aliases', t => {
  const id = formatId({ number: validId, node: validNode });
  const hints = ['tcp:user@example.com:8920'];
  const locator = formatLocatorForSharing(id, validType, hints);
  t.is(locator, formatLocatorWithHints(id, validType, hints));
  t.deepEqual(addressesFromLocator(locator), hintsFromLocator(locator));
});

// --- externalizeId, internalizeLocator ---

test('externalizeId formats locator from id', t => {
  const formulaNumber = validId;
  const id = formatId({ number: formulaNumber, node: validNode });
  const locator = externalizeId(id, validType, validNode);
  const parsed = parseLocator(locator);
  t.is(parsed.node, validNode);
  t.is(parsed.number, formulaNumber);
  t.is(parsed.formulaType, validType);
});

test('externalizeId preserves remote node', t => {
  const formulaNumber = validId;
  const remoteNode =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const remoteId = formatId({ number: formulaNumber, node: remoteNode });
  const locator = externalizeId(remoteId, validType, validNode);
  const parsed = parseLocator(locator);
  t.is(parsed.node, remoteNode, 'remote node should be preserved');
});

test('internalizeLocator preserves node', t => {
  const formulaNumber = validId;
  const locator = formatLocator(
    formatId({ number: formulaNumber, node: validNode }),
    validType,
  );
  const result = internalizeLocator(locator);
  const { number, node } = parseId(result.id);
  t.is(node, validNode, 'node should be preserved');
  t.is(number, formulaNumber);
  t.is(result.formulaType, validType);
});

test('internalizeLocator preserves remote node', t => {
  const formulaNumber = validId;
  const remoteNode =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const locator = formatLocator(
    formatId({ number: formulaNumber, node: remoteNode }),
    validType,
  );
  const result = internalizeLocator(locator);
  const { node } = parseId(result.id);
  t.is(node, remoteNode, 'remote node should be preserved');
});

test('externalizeId / internalizeLocator round-trip', t => {
  const formulaNumber = validId;
  const id = formatId({ number: formulaNumber, node: validNode });
  const locator = externalizeId(id, validType, validNode);
  const result = internalizeLocator(locator);
  t.is(result.id, id, 'round-trip should preserve id');
  t.is(result.formulaType, validType);
});

test('externalizeId / internalizeLocator round-trip preserves remote node', t => {
  const formulaNumber = validId;
  const remoteNode =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const remoteId = formatId({ number: formulaNumber, node: remoteNode });
  const locator = externalizeId(remoteId, validType, validNode);
  const result = internalizeLocator(locator);
  t.is(result.id, remoteId, 'remote id should be preserved');
});

test('internalizeLocator extracts connection hints', t => {
  const id = formatId({ number: validId, node: validNode });
  const hints = ['tcp://127.0.0.1:8940', 'ws://example.com'];
  const locator = formatLocatorWithHints(id, validType, hints);
  const result = internalizeLocator(locator);
  t.deepEqual(result.hints, hints);
  t.deepEqual(result.addresses, hints);
});

// --- Format verification ---

test('formatLocator produces path-based format', t => {
  const fmtId = formatId({ number: validId, node: validNode });
  const locator = formatLocator(fmtId, validType);
  // Formula number in path, no `?id=` query parameter.
  t.true(locator.includes(`/${validId}`));
  t.false(locator.includes('id='));
  t.true(locator.includes(`type=${validType}`));
});

test('formatLocator round-trips through parseLocator', t => {
  const fmtId = formatId({ number: validId, node: validNode });
  const locator = formatLocator(fmtId, validType);
  const parsed = parseLocator(locator);
  t.is(parsed.number, validId);
  t.is(parsed.node, validNode);
  t.is(parsed.formulaType, validType);
  t.deepEqual(parsed.hints, []);
});

test('parseLocator - rejects locator with no formula number', t => {
  const badLocator = `endo://${validNode}/?type=${validType}`;
  t.throws(() => parseLocator(badLocator), {
    message: /Missing formula number/,
  });
});

test('parseLocator - rejects unrecognized search params', t => {
  const badLocator = `endo://${validNode}/${validId}?type=${validType}&bad=param`;
  t.throws(() => parseLocator(badLocator), {
    message: /Invalid search params/,
  });
});
