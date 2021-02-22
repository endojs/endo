import '@agoric/install-ses';
import test from 'ava';
import { Far } from '../src/marshal';
import { stringify, parse } from '../src/marshal-stringify';

const pairs = harden([
  [['a', { foo: 8 }, []], '["a",{"foo":8},[]]'],
  [
    [1n, NaN, Infinity, -Infinity, undefined],
    '[{"@qclass":"bigint","digits":"1"},{"@qclass":"NaN"},{"@qclass":"Infinity"},{"@qclass":"-Infinity"},{"@qclass":"undefined"}]',
  ],
  [URIError('foo'), '{"@qclass":"error","message":"foo","name":"URIError"}'],
]);

test('marshal stringify', t => {
  for (const [data, str] of pairs) {
    t.is(stringify(data), str);
  }
  t.is(stringify(harden([-0])), '[0]');
});

test('marshal parse', t => {
  for (const [data, str] of pairs) {
    t.deepEqual(parse(str), data);
  }
  t.deepEqual(parse('[0]'), [0]);
});

test('marshal stringify errors', t => {
  t.throws(() => stringify([]), {
    message: /Cannot pass non-frozen objects like .*. Use harden()/,
  });
  t.throws(() => stringify({}), {
    message: /Cannot pass non-frozen objects like .*. Use harden()/,
  });

  t.throws(() => stringify(harden(Promise.resolve(8))), {
    message: /Marshal's stringify rejects presences and promises .*/,
  });
  t.throws(() => stringify(harden({ foo: () => {} })), {
    message: /Marshal's stringify rejects presences and promises .*/,
  });
  t.throws(() => stringify(Far('x', { foo: () => {} })), {
    message: /Marshal's stringify rejects presences and promises .*/,
  });
  t.throws(() => stringify(Far('y', {})), {
    message: /Marshal's stringify rejects presences and promises .*/,
  });

  // This is due to https://github.com/Agoric/agoric-sdk/issues/2018
  // and should no longer be an error once this is fixed.
  t.throws(() => stringify(harden({})), {
    message: /Marshal's stringify rejects presences and promises .*/,
  });

  t.throws(() => stringify(harden({ '@qclass': 'slot', index: 0 })), {
    message: /property "@qclass" reserved/,
  });
});

test('marshal parse errors', t => {
  t.throws(() => parse('{"@qclass":"slot","index":0}'), {
    message: /Marshal's parse must not encode any slot positions .*/,
  });
  t.throws(() => parse('X'), {
    message: /Unexpected token X in JSON at position 0*/,
  });
  t.throws(() => parse('{"@qclass":8}'), {
    message: /invalid qclass typeof "number"*/,
  });
  t.throws(() => parse('{"@qclass":"bogus"}'), {
    message: /unrecognized "@qclass" "bogus"*/,
  });
});
