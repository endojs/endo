// @ts-check

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/swingset-vat/tools/prepare-test-env-ava.js';

import {
  getInterfaceOf,
  passStyleOf,
  ALLOW_IMPLICIT_REMOTABLES,
} from '../src/passStyleOf.js';

import { Remotable, Far, makeMarshal } from '../src/marshal.js';

const { create, prototype: objectPrototype } = Object;

// this only includes the tests that do not use liveSlots

test('Remotable/getInterfaceOf', t => {
  t.throws(
    // @ts-ignore We're testing the dynamic consequences of this type violation
    () => Remotable({ bar: 29 }),
    { message: /unimplemented/ },
    'object ifaces are not implemented',
  );
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
  t.is(getInterfaceOf(p), 'Alleged: MyHandle', `interface is MyHandle`);
  t.is(`${p}`, '[Alleged: MyHandle]', 'stringify is [MyHandle]');

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

  // Remotables and Fars can be serialized, of course
  function convertValToSlot(_val) {
    return 'slot';
  }
  const m = makeMarshal(convertValToSlot);
  t.deepEqual(m.serialize(p2), {
    body: JSON.stringify({
      '@qclass': 'slot',
      iface: 'Alleged: Thing',
      index: 0,
    }),
    slots: ['slot'],
  });
});

const GOOD_PASS_STYLE = Symbol.for('passStyle');
const BAD_PASS_STYLE = Symbol('passStyle');

const goodRemotableProto = harden({
  [GOOD_PASS_STYLE]: 'remotable',
  toString: Object, // Any function will do
  [Symbol.toStringTag]: 'Alleged: Good remotable proto',
});

const badRemotableProto1 = harden({
  [BAD_PASS_STYLE]: 'remotable',
  toString: Object, // Any function will do
  [Symbol.toStringTag]: 'Alleged: Good remotable proto',
});
const badRemotableProto2 = harden({
  [GOOD_PASS_STYLE]: 'string',
  toString: Object, // Any function will do
  [Symbol.toStringTag]: 'Alleged: Good remotable proto',
});
const badRemotableProto3 = harden({
  [GOOD_PASS_STYLE]: 'remotable',
  toString: {}, // Any function will do
  [Symbol.toStringTag]: 'Alleged: Good remotable proto',
});
const badRemotableProto4 = harden({
  [GOOD_PASS_STYLE]: 'remotable',
  toString: Object, // Any function will do
  [Symbol.toStringTag]: 'Bad remotable proto',
});

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
const TO_STRING_NONFUNC = {
  message: /toString must be a function/,
};
const IFACE_ALLEGED = {
  message: /For now, iface "Bad remotable proto" must be "Remotable" or begin with "Alleged: "; unimplemented/,
};
const UNEXPECTED_PROPS = {
  message: /Unexpected properties on Remotable Proto .*/,
};
const EXPECTED_PRESENCE = {
  message: /Expected 'remotable', not "string"/,
};

// Parallels the getInterfaceOf validation cases, explaining why
// each failure failed.
test('passStyleOf validation of remotables', t => {
  t.throws(() => passStyleOf(goodRemotableProto), NON_METHOD);
  t.throws(() => passStyleOf(badRemotableProto1), NON_METHOD);
  t.throws(() => passStyleOf(badRemotableProto2), NON_METHOD);
  t.throws(() => passStyleOf(badRemotableProto3), NON_METHOD);
  t.throws(() => passStyleOf(badRemotableProto4), NON_METHOD);

  t.is(passStyleOf(sub(goodRemotableProto)), 'remotable');
  t.throws(() => passStyleOf(sub(badRemotableProto1)), UNEXPECTED_PROPS);
  t.throws(() => passStyleOf(sub(badRemotableProto2)), EXPECTED_PRESENCE);
  t.throws(() => passStyleOf(sub(badRemotableProto3)), TO_STRING_NONFUNC);
  t.throws(() => passStyleOf(sub(badRemotableProto4)), IFACE_ALLEGED);
});

test('transitional remotables', t => {
  function convertValToSlot(_val) {
    return 'slot';
  }
  const presence = Far('presence', {});
  function convertSlotToVal(_slot) {
    return presence;
  }
  const { serialize: ser } = makeMarshal(convertValToSlot, convertSlotToVal);

  const noIface = {
    body: JSON.stringify({ '@qclass': 'slot', index: 0 }),
    slots: ['slot'],
  };
  const yesIface = {
    body: JSON.stringify({
      '@qclass': 'slot',
      iface: 'Alleged: iface',
      index: 0,
    }),
    slots: ['slot'],
  };

  // For objects with Symbol-named properties
  const symEnumData = Symbol.for('symEnumData');
  const symEnumFunc = Symbol.for('symEnumFunc');
  const symNonenumData = Symbol.for('symNonenumData');
  const symNonenumFunc = Symbol.for('symNonenumFunc');
  const symNonenumGetFunc = Symbol.for('symNonenumGetFunc');

  function build(...opts) {
    const props = {};
    let mark;
    for (const opt of opts) {
      if (opt === 'enumStringData') {
        props.key1 = { enumerable: true, value: 'data' };
      } else if (opt === 'enumStringFunc') {
        props.enumStringFunc = { enumerable: true, value: () => 0 };
      } else if (opt === 'enumStringGetData') {
        props.enumStringGetData = { enumerable: true, get: () => 0 };
      } else if (opt === 'enumStringGetFunc') {
        props.enumStringGetFunc = { enumerable: true, get: () => () => 0 };
      } else if (opt === 'enumStringSet') {
        props.enumStringSet = { enumerable: true, set: () => undefined };
      } else if (opt === 'enumSymbolData') {
        props[symEnumData] = { enumerable: true, value: 2 };
      } else if (opt === 'enumSymbolFunc') {
        props[symEnumFunc] = { enumerable: true, value: () => 0 };
      } else if (opt === 'nonenumStringData') {
        props.nonEnumStringData = { enumerable: false, value: 3 };
      } else if (opt === 'nonenumStringFunc') {
        props.nonEnumStringFunc = { enumerable: false, value: () => 0 };
      } else if (opt === 'nonenumSymbolData') {
        props[symNonenumData] = { enumerable: false, value: 4 };
      } else if (opt === 'nonenumSymbolFunc') {
        props[symNonenumFunc] = { enumerable: false, value: () => 0 };
      } else if (opt === 'nonenumSymbolGetFunc') {
        props[symNonenumGetFunc] = { enumerable: false, get: () => () => 0 };
      } else if (opt === 'far') {
        mark = 'far';
      } else {
        throw Error(`unknown option ${opt}`);
      }
    }
    // @ts-ignore Don't yet understand typing, but want dynamic test anyway
    const o = create(objectPrototype, props);
    if (mark === 'far') {
      return Far('iface', o);
    }
    return harden(o);
  }

  function shouldThrow(opts, message = /XXX/) {
    t.throws(() => ser(build(...opts)), { message });
  }
  const FAR_NOACC = /cannot serialize Remotables with accessors/;
  const FAR_ONLYMETH = /cannot serialize Remotables with non-methods/;
  const FAR_EXPLICIT = /Remotables must now be explicitly declared/;

  // Far('iface', {})
  // all cases: pass-by-ref
  t.deepEqual(ser(build('far')), yesIface);

  // Far('iface', {key: func})
  // all cases: pass-by-ref
  t.deepEqual(ser(build('far', 'enumStringFunc')), yesIface);
  t.deepEqual(ser(build('far', 'enumSymbolFunc')), yesIface);
  t.deepEqual(ser(build('far', 'nonenumStringFunc')), yesIface);
  t.deepEqual(ser(build('far', 'nonenumSymbolFunc')), yesIface);

  // { key: func }
  // old: pass-by-ref without warning
  // interim1: pass-by-ref with warning
  // interim2: reject
  // final: reject
  if (ALLOW_IMPLICIT_REMOTABLES) {
    t.deepEqual(ser(build('enumStringFunc')), noIface);
    t.deepEqual(ser(build('enumSymbolFunc')), noIface);
    t.deepEqual(ser(build('nonenumStringFunc')), noIface);
    t.deepEqual(ser(build('nonenumSymbolFunc')), noIface);
  } else {
    shouldThrow(['enumStringFunc'], FAR_EXPLICIT);
    shouldThrow(['enumSymbolFunc'], FAR_EXPLICIT);
    shouldThrow(['nonenumStringFunc'], FAR_EXPLICIT);
    shouldThrow(['nonenumSymbolFunc'], FAR_EXPLICIT);
  }

  // Far('iface', { key: data, key: func }) : rejected
  // (some day this might add auxilliary data, but not now
  shouldThrow(['far', 'enumStringData', 'enumStringFunc'], FAR_ONLYMETH);

  // anything with getters is rejected
  shouldThrow(['enumStringGetData', 'enumStringFunc'], FAR_NOACC);
  shouldThrow(['enumStringGetFunc', 'enumStringFunc'], FAR_NOACC);
  shouldThrow(['enumStringSet', 'enumStringFunc'], FAR_NOACC);
  shouldThrow(['nonenumSymbolGetFunc'], FAR_NOACC);
  shouldThrow(['nonenumSymbolGetFunc', 'enumStringData'], FAR_ONLYMETH);
  shouldThrow(['nonenumSymbolGetFunc', 'enumStringFunc'], FAR_NOACC);

  // anything with symbols can only be a remotable
  shouldThrow(['enumSymbolData'], FAR_ONLYMETH);
  shouldThrow(['enumSymbolData', 'enumStringData'], FAR_ONLYMETH);
  shouldThrow(['enumSymbolData', 'enumStringFunc'], FAR_ONLYMETH);

  shouldThrow(['nonenumSymbolData'], FAR_ONLYMETH);
  shouldThrow(['nonenumSymbolData', 'enumStringData'], FAR_ONLYMETH);
  shouldThrow(['nonenumSymbolData', 'enumStringFunc'], FAR_ONLYMETH);

  // anything with non-enumerable properties is rejected
  shouldThrow(['nonenumStringData', 'enumStringFunc'], FAR_ONLYMETH);
});
