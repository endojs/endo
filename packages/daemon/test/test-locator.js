import test from '@endo/ses-ava/prepare-endo.js';

import {
  assertValidLocator,
  formatLocator,
  idFromLocator,
  parseLocator,
} from '../src/locator.js';
import { formatId } from '../src/formula-identifier.js';

const validNode =
  'd5c98890be3d17ad375517464ec494068267de60bd4b3143ef0214cc895746f2892baca4fec19b6d4dfc1f683b7cf3d2a884dfcae568555dd89665c33dfdc4b3';
const validId =
  '5cf3d8b4d6e03fb51d71fbbb6fa6982edbff673cd193707c902b70a26b7b468017fbcfc5c2895f4379459badbe507a4ef00e1d3638f4a67e8a8c14fd1d85d9aa';
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
