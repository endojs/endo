import test from '@endo/ses-ava/prepare-endo.js';

import {
  addressesFromLocator,
  assertValidLocator,
  formatLocator,
  formatLocatorForSharing,
  idFromLocator,
  parseLocator,
} from '../src/locator.js';
import { formatId } from '../src/formula-identifier.js';

const validNode =
  'd5c98890be3d17ad375517464ec494068267de60bd4b3143ef0214cc895746f2';
const validId =
  '5cf3d8b4d6e03fb51d71fbbb6fa6982edbff673cd193707c902b70a26b7b4680';
const validType = 'eval';

const makeLocator = (components = {}) => {
  const {
    protocol = 'endo://',
    host = validNode,
    param1 = `id=${validId}`,
    param2 = `type=${validType}`,
  } = components;
  return `${protocol}${host}/?${param1}&${param2}`;
};

test('assertValidLocator - valid', t => {
  t.notThrows(() => assertValidLocator(makeLocator()));

  // Reverse search param order
  t.notThrows(() =>
    assertValidLocator(
      makeLocator({
        param1: `type=${validType}`,
        param2: `id=${validId}`,
      }),
    ),
  );
});

test('assertValidLocator - invalid', t => {
  [
    ['foobar', /Invalid URL.$/u],
    ['', /Invalid URL.$/u],
    [null, /Invalid URL.$/u],
    [undefined, /Invalid URL.$/u],
    [{}, /Invalid URL.$/u],
    [makeLocator({ protocol: 'foobar://' }), /Invalid protocol.$/u],
    [makeLocator({ host: 'foobar' }), /Invalid node identifier.$/u],
    [makeLocator({ param1: 'foo=bar' }), /Invalid search params.$/u],
    [makeLocator({ param2: 'foo=bar' }), /Invalid search params.$/u],
    [`${makeLocator()}&foo=bar`, /Invalid search params.$/u],
    [makeLocator({ param1: 'id=foobar' }), /Invalid id.$/u],
    [makeLocator({ param2: 'type=foobar' }), /Invalid type.$/u],
  ].forEach(([locator, reason]) => {
    t.throws(() => assertValidLocator(locator), { message: reason });
  });
});

test('parseLocator', t => {
  t.deepEqual(parseLocator(makeLocator()), {
    number: validId,
    node: validNode,
    formulaType: validType,
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

test('parseLocator - tolerates at= connection hints', t => {
  const locator = `${makeLocator()}&at=libp2p%2Bcaptp0%3A%2F%2Fpeer1&at=libp2p%2Bcaptp0%3A%2F%2Fpeer2`;
  const parsed = parseLocator(locator);
  t.is(parsed.number, validId);
  t.is(parsed.node, validNode);
  t.is(parsed.formulaType, validType);
});

test('formatLocatorForSharing', t => {
  const id = formatId({ number: validId, node: validNode });
  const addresses = ['libp2p+captp0:///peer1', 'tcp+captp0://127.0.0.1:8940'];
  const locator = formatLocatorForSharing(id, validType, addresses);
  t.true(locator.startsWith('endo://'));
  const parsed = parseLocator(locator);
  t.is(parsed.number, validId);
  t.is(parsed.node, validNode);
  t.is(parsed.formulaType, validType);
  const extractedAddresses = addressesFromLocator(locator);
  t.deepEqual(extractedAddresses, addresses);
});

test('formatLocatorForSharing - no addresses', t => {
  const id = formatId({ number: validId, node: validNode });
  const locator = formatLocatorForSharing(id, validType, []);
  t.is(locator, formatLocator(id, validType));
  t.deepEqual(addressesFromLocator(locator), []);
});

test('addressesFromLocator - plain locator returns empty', t => {
  t.deepEqual(addressesFromLocator(makeLocator()), []);
});
