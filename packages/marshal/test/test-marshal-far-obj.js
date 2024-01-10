import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { passStyleOf, Remotable, Far, getInterfaceOf } from '@endo/pass-style';

import { makeMarshal } from '../src/marshal.js';

const { quote: q } = assert;
const { create, getPrototypeOf, prototype: objectPrototype } = Object;

// this only includes the tests that do not use liveSlots

test('Remotable/getInterfaceOf', t => {
  t.throws(
    // @ts-expect-error invalid argument
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

  // Remotables and Fars can be serialized, of course
  /** @type {import('../src/types.js').ConvertValToSlot<string>} */
  const convertValToSlot = _val => {
    return 'slot';
  };
  const m = makeMarshal(convertValToSlot, undefined, {
    serializeBodyFormat: 'smallcaps',
  });
  t.deepEqual(m.serialize(p2), {
    body: '#"$0.Alleged: Thing"',
    slots: ['slot'],
  });
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

// @ts-expect-error We're testing bad things anyway
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
    /For now, iface "Bad remotable proto" must be "Remotable" or begin with "Alleged: " or "DebugName: "; unimplemented/,
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

test('transitional remotables', t => {
  function convertValToSlot(_val) {
    return 'slot';
  }
  const presence = Far('presence', {});
  function convertSlotToVal(_slot) {
    return presence;
  }
  const { serialize: ser } = makeMarshal(convertValToSlot, convertSlotToVal, {
    serializeBodyFormat: 'smallcaps',
  });

  const yesIface = {
    body: '#"$0.Alleged: iface"',
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
    // @ts-expect-error Don't yet understand typing, but want dynamic test anyway
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
  const FAR_EXPLICIT = /Remotables must be explicitly declared/;

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
  shouldThrow(['enumStringFunc'], FAR_EXPLICIT);
  shouldThrow(['enumSymbolFunc'], FAR_EXPLICIT);
  shouldThrow(['nonenumStringFunc'], FAR_EXPLICIT);
  shouldThrow(['nonenumSymbolFunc'], FAR_EXPLICIT);

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

test('object without prototype', t => {
  const base = Far('base', { __proto__: null });
  t.is(getPrototypeOf(getPrototypeOf(base)), Object.prototype);
});
