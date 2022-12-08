// @ts-check

import { test } from './prepare-test-env-ava.js';

import { Far, passStyleOf, getInterfaceOf } from '../src/index.js';

const { quote: q } = assert;
const { create, getPrototypeOf } = Object;

// this only includes the tests that do not use liveSlots

test('Remotable/getInterfaceOf', t => {
  t.throws(
    () => Far('MyHandle', { foo: 123 }),
    { message: /cannot serialize/ },
    'non-function props are not implemented',
  );

  t.is(getInterfaceOf('foo'), undefined, 'string, no interface');
  t.is(getInterfaceOf(null), undefined, 'null, no interface');
  t.is(
    getInterfaceOf(a => a + 1),
    undefined,
    'function, no interface',
  );
  t.is(getInterfaceOf(123), undefined, 'number, no interface');

  // Check that a handle can be created.
  const p = Far('MyHandle');
  harden(p);
  // console.log(p);
  t.is(getInterfaceOf(p), 'Alleged: MyHandle', `interface MyHandle`);
  t.is(`${p}`, '[object Alleged: MyHandle]', 'stringify [MyHandle]');
  t.is(`${q(p)}`, '"[Alleged: MyHandle]"', 'quotify [MyHandle]');

  const p2 = Far('Thing', {
    name() {
      return 'cretin';
    },
    birthYear(now) {
      return now - 64;
    },
  });
  t.is(getInterfaceOf(p2), 'Alleged: Thing', `interface is Thing`);
  t.is(p2.name(), 'cretin', `name() method is presence`);
  t.is(p2.birthYear(2020), 1956, `birthYear() works`);
});

const GOOD_PASS_STYLE = Symbol.for('passStyle');
const BAD_PASS_STYLE = Symbol('passStyle');

const testRecord = ({
  styleSymbol = GOOD_PASS_STYLE,
  styleString = 'remotable',
  styleEnumerable = false,
  tagSymbol = Symbol.toStringTag,
  tagString = 'Alleged: Good remotable proto',
  tagEnumerable = false,
  extras = {},
} = {}) =>
  harden(
    create(Object.prototype, {
      [styleSymbol]: { value: styleString, enumerable: styleEnumerable },
      [tagSymbol]: { value: tagString, enumerable: tagEnumerable },
      ...extras,
    }),
  );

const goodRemotableProto = testRecord();

// @ts-ignore We're testing bad things anyway
const badRemotableProto1 = testRecord({ styleSymbol: BAD_PASS_STYLE });

const badRemotableProto2 = testRecord({ styleString: 'string' });

const badRemotableProto3 = testRecord({
  extras: {
    toString: {
      value: Object, // Any function will do
      enumerable: true,
    },
  },
});

const badRemotableProto4 = testRecord({ tagString: 'Bad remotable proto' });

const sub = sup => harden({ __proto__: sup });

test('getInterfaceOf validation', t => {
  t.is(getInterfaceOf(goodRemotableProto), undefined);
  t.is(getInterfaceOf(badRemotableProto1), undefined);
  t.is(getInterfaceOf(badRemotableProto2), undefined);
  t.is(getInterfaceOf(badRemotableProto3), undefined);
  t.is(getInterfaceOf(badRemotableProto4), undefined);

  t.is(
    getInterfaceOf(sub(goodRemotableProto)),
    'Alleged: Good remotable proto',
  );
  t.is(getInterfaceOf(sub(badRemotableProto1)), undefined);
  t.is(getInterfaceOf(sub(badRemotableProto2)), undefined);
  t.is(getInterfaceOf(sub(badRemotableProto3)), undefined);
  t.is(getInterfaceOf(sub(badRemotableProto4)), undefined);
});

const NON_METHOD = {
  message: /cannot serialize Remotables with non-methods like .* in .*/,
};
const IFACE_ALLEGED = {
  message:
    /For now, iface "Bad remotable proto" must be "Remotable" or begin with "Alleged: "; unimplemented/,
};
const UNEXPECTED_PROPS = {
  message: /Unexpected properties on Remotable Proto .*/,
};
const UNEXPECTED_PASS_STYLE = {
  message: /Unrecognized PassStyle/,
};
const EXPECTED_PASS_STYLE = {
  message: /\[Symbol\(passStyle\)\]" property expected/,
};

// Parallels the getInterfaceOf validation cases, explaining why
// each failure failed.
test('passStyleOf validation of remotables', t => {
  t.throws(() => passStyleOf(goodRemotableProto), NON_METHOD);
  t.throws(() => passStyleOf(badRemotableProto1), NON_METHOD);
  t.throws(() => passStyleOf(badRemotableProto2), UNEXPECTED_PASS_STYLE);
  t.throws(() => passStyleOf(badRemotableProto3), NON_METHOD);
  t.throws(() => passStyleOf(badRemotableProto4), NON_METHOD);

  t.is(passStyleOf(sub(goodRemotableProto)), 'remotable');

  t.throws(() => passStyleOf(sub(badRemotableProto1)), EXPECTED_PASS_STYLE);
  t.throws(() => passStyleOf(sub(badRemotableProto2)), UNEXPECTED_PASS_STYLE);
  t.throws(() => passStyleOf(sub(badRemotableProto3)), UNEXPECTED_PROPS);
  t.throws(() => passStyleOf(sub(badRemotableProto4)), IFACE_ALLEGED);
});

test('object without prototype', t => {
  const base = Far('base', { __proto__: null });
  t.is(getPrototypeOf(getPrototypeOf(base)), Object.prototype);
});
