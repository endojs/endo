/* eslint-disable max-classes-per-file */
import { test } from '@endo/ses-ava/prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { q } from '@endo/errors';

import { passStyleOf } from '../src/passStyleOf.js';
import { Far } from '../src/make-far.js';
import { makeTagged } from '../src/makeTagged.js';
import { PASS_STYLE } from '../src/passStyle-helpers.js';

const { getPrototypeOf, defineProperty } = Object;
const { ownKeys } = Reflect;

test('passStyleOf basic success cases', t => {
  // Test in same order as `passStyleOf` for easier maintenance.
  // Remotables tested separately below.
  t.is(passStyleOf(undefined), 'undefined');
  t.is(passStyleOf('foo'), 'string');
  t.is(passStyleOf(true), 'boolean');
  t.is(passStyleOf(33), 'number');
  t.is(passStyleOf(33n), 'bigint');
  t.is(passStyleOf(Symbol.for('foo')), 'symbol');
  t.is(passStyleOf(Symbol.iterator), 'symbol');
  t.is(passStyleOf(null), 'null');
  t.is(passStyleOf(harden(Promise.resolve(null))), 'promise');
  t.is(passStyleOf(harden([3, 4])), 'copyArray');
  t.is(passStyleOf(harden({ foo: 3 })), 'copyRecord');
  t.is(passStyleOf(harden({ then: 'non-function then ok' })), 'copyRecord');
  t.is(passStyleOf(harden({})), 'copyRecord', 'empty plain object');
  t.is(passStyleOf(makeTagged('unknown', undefined)), 'tagged');
  t.is(passStyleOf(harden(Error('ok'))), 'error');
});

test('some passStyleOf rejections', t => {
  const hairlessError = Error('hairless');
  for (const k of ownKeys(hairlessError)) {
    delete hairlessError[k];
  }
  t.throws(() => passStyleOf(harden(hairlessError)), {
    message:
      'Passable Error must have an own "message" string property: "[Error: ]"',
  });

  t.throws(() => passStyleOf(Symbol('unique')), {
    message:
      /Only registered symbols or well-known symbols are passable: "\[Symbol\(unique\)\]"/,
  });
  if (harden.isFake) {
    t.is(passStyleOf({}), 'copyRecord');
  } else {
    t.throws(() => passStyleOf({}), {
      message: /Cannot pass non-frozen objects like {}. Use harden\(\)/,
    });
  }

  const copyRecordBadAccessor = Object.defineProperty({}, 'foo', {
    get: () => undefined,
    enumerable: true,
  });
  t.throws(() => passStyleOf(harden(copyRecordBadAccessor)), {
    message: /^"foo" must not be an accessor property/,
  });
  const copyRecordBadNonenumerable = Object.defineProperty({}, 'foo', {});
  t.throws(() => passStyleOf(harden(copyRecordBadNonenumerable)), {
    message: /^"foo" must be an enumerable property/,
  });

  const prbad1 = Promise.resolve();
  Object.setPrototypeOf(prbad1, harden({ __proto__: Promise.prototype }));
  harden(prbad1);
  t.throws(() => passStyleOf(prbad1), {
    message:
      /"\[Promise\]" - Must inherit from Promise.prototype: "\[Promise\]"/,
  });

  const prbad2 = Promise.resolve();
  // @ts-expect-error unknown property
  prbad2.extra = 'unexpected own property';
  harden(prbad2);
  t.throws(() => passStyleOf(prbad2), {
    message: /\[Promise\]" - Must not have any own properties: \["extra"\]/,
  });

  const prbad3 = Promise.resolve();
  Object.defineProperty(prbad3, 'then', { value: () => 'bad then' });
  harden(prbad3);
  t.throws(() => passStyleOf(prbad3), {
    message: /\[Promise\]" - Must not have any own properties: \["then"\]/,
  });

  const thenable1 = harden({ then: () => 'thenable' });
  t.throws(() => passStyleOf(thenable1), {
    message: /Cannot pass non-promise thenables/,
  });

  const thenable2 = Far('remote thenable', { then: () => 'thenable' });
  t.throws(() => passStyleOf(thenable2), {
    message: /Cannot pass non-promise thenables/,
  });
});

/**
 * For testing purposes, makes a TagRecord-like object with
 * non-enumerable PASS_STYLE and Symbol.toStringTag properties.
 * A valid Remotable must inherit from a valid TagRecord.
 *
 * @param {string} [tag]
 * @param {object|null} [proto]
 */
const makeTagishRecord = (tag = 'Remotable', proto = undefined) => {
  return Object.create(proto === undefined ? Object.prototype : proto, {
    [PASS_STYLE]: { value: 'remotable' },
    [Symbol.toStringTag]: { value: tag },
  });
};

test('passStyleOf testing tagged records', t => {
  const makeTagRecordVariant = (payload, proto) => {
    const record = Object.create(
      proto === undefined ? Object.prototype : proto,
      {
        [PASS_STYLE]: { value: 'tagged' },
        [Symbol.toStringTag]: { value: 'tagged' },
      },
    );
    record.payload = payload;
    return record;
  };
  t.is(passStyleOf(harden(makeTagRecordVariant())), 'tagged');
  t.is(passStyleOf(harden(makeTagRecordVariant({ passable: true }))), 'tagged');

  for (const proto of [null, harden({})]) {
    const tagRecordBadProto = makeTagRecordVariant(undefined, proto);
    t.throws(
      () => passStyleOf(harden(tagRecordBadProto)),
      { message: /A tagRecord must inherit from Object.prototype/ },
      `quasi-tagRecord with ${proto} prototype`,
    );
  }

  const tagRecordExtra = makeTagRecordVariant();
  Object.defineProperty(tagRecordExtra, 'extra', {
    value: 'unexpected own property',
  });
  t.throws(() => passStyleOf(harden(tagRecordExtra)), {
    message: 'Unexpected properties on tagged record ["extra"]',
  });

  const tagRecordBadPayloads = [
    { label: 'absent', message: '"payload" property expected: "[tagged]"' },
    {
      label: 'non-enumerable',
      value: 0,
      enumerable: false,
      message: '"payload" must be an enumerable property: "[tagged]"',
    },
    {
      label: 'non-passable',
      value: { [PASS_STYLE]: 0 },
      message: '0 must be a string',
    },
  ];
  for (const testCase of tagRecordBadPayloads) {
    const { label, message, ...desc } = testCase;
    const tagRecordBadPayload = makeTagRecordVariant();
    if (ownKeys(desc).length === 0) {
      delete tagRecordBadPayload.payload;
    } else {
      Object.defineProperty(tagRecordBadPayload, 'payload', desc);
    }
    t.throws(
      () => passStyleOf(harden(tagRecordBadPayload)),
      { message },
      `tagged record with payload ${label} must be rejected`,
    );
  }
});

test('passStyleOf testing remotables', t => {
  t.is(passStyleOf(Far('foo', {})), 'remotable');
  t.is(passStyleOf(Far('foo', () => 'far function')), 'remotable');

  const tagRecord1 = harden(makeTagishRecord('Alleged: manually constructed'));
  const farObj1 = harden({
    __proto__: tagRecord1,
  });
  t.is(passStyleOf(farObj1), 'remotable');

  const tagRecord2 = makeTagishRecord('Alleged: tagRecord not hardened');
  const farObj2 = Object.freeze({
    __proto__: tagRecord2,
  });
  if (harden.isFake) {
    t.is(passStyleOf(farObj2), 'remotable');
  } else {
    t.throws(() => passStyleOf(farObj2), {
      message:
        /A tagRecord must be frozen: "\[Alleged: tagRecord not hardened\]"/,
    });
  }

  const tagRecord3 = Object.freeze(
    makeTagishRecord('Alleged: both manually frozen'),
  );
  const farObj3 = Object.freeze({
    __proto__: tagRecord3,
  });
  t.is(passStyleOf(farObj3), 'remotable');

  const tagRecord4 = harden(makeTagishRecord('Remotable'));
  const farObj4 = harden({
    __proto__: tagRecord4,
  });
  t.is(passStyleOf(farObj4), 'remotable');

  const tagRecord5 = harden(makeTagishRecord('Not alleging'));
  const farObj5 = harden({
    __proto__: tagRecord5,
  });
  t.throws(() => passStyleOf(farObj5), {
    message:
      /For now, iface "Not alleging" must be "Remotable" or begin with "Alleged: " or "DebugName: "; unimplemented/,
  });

  const tagRecord6 = harden(makeTagishRecord('Alleged: manually constructed'));
  const farObjProto6 = harden({
    __proto__: tagRecord6,
  });
  const farObj6 = harden({
    __proto__: farObjProto6,
  });
  t.is(passStyleOf(farObj6), 'remotable', 'tagRecord grandproto is accepted');

  // Our current agoric-sdk plans for far classes are to create a class-like
  // abstraction, but not to actually use the JavaScript class syntax.
  // Nevertheless, the representation passStyleOf recognizes is flexible
  // enough to allow certain stylized use of syntactic classes.
  class FarBaseClass7 {
    #x;

    constructor(x) {
      this.#x = x;
      harden(this);
    }

    add(y) {
      return this.#x + y;
    }
  }
  const farBaseProto7 = FarBaseClass7.prototype;
  t.is(getPrototypeOf(farBaseProto7), Object.prototype);
  Far('FarType7', farBaseProto7);
  const farTagRecord7 = getPrototypeOf(farBaseProto7);
  t.is(farTagRecord7[PASS_STYLE], 'remotable');
  t.is(getPrototypeOf(farTagRecord7), Object.prototype);
  const farObj7 = new FarBaseClass7(3);
  t.is(passStyleOf(farObj7), 'remotable');
  t.is(farObj7.add(7), 10);
  t.is(`${farObj7}`, '[object Alleged: FarType7]');

  class FarSubclass8 extends FarBaseClass7 {
    twice() {
      return this.add(4) + this.add(4);
    }
  }
  harden(FarSubclass8);
  const farObj8 = new FarSubclass8(3);
  t.is(passStyleOf(farObj8), 'remotable');
  t.is(farObj8.twice(), 14);

  class NonFarBaseClass9 {}
  class Subclass9 extends NonFarBaseClass9 {}
  t.throws(() => Far('FarType9', Subclass9.prototype), {
    message: 'For now, remotables cannot inherit from anything unusual, in {}',
  });

  const unusualTagRecordProtoMessage =
    /A tagRecord must inherit from Object.prototype/;

  const tagRecordA1 = harden(
    makeTagishRecord('Alleged: null-proto tagRecord proto', null),
  );
  const farObjA1 = harden({ __proto__: tagRecordA1 });
  t.throws(
    () => passStyleOf(farObjA1),
    { message: unusualTagRecordProtoMessage },
    'null-proto-tagRecord proto is rejected',
  );

  const tagRecordA2 = harden(
    makeTagishRecord('Alleged: null-proto tagRecord grandproto', null),
  );
  const farObjProtoA2 = harden({ __proto__: tagRecordA2 });
  const farObjA2 = harden({ __proto__: farObjProtoA2 });
  t.throws(
    () => passStyleOf(farObjA2),
    { message: unusualTagRecordProtoMessage },
    'null-proto-tagRecord grandproto is rejected',
  );

  t.throws(() => passStyleOf(Object.prototype), {
    message: 'cannot serialize Remotables with accessors like "toString" in {}',
  });

  const fauxTagRecordB = harden(
    makeTagishRecord('Alleged: manually constructed', harden({})),
  );
  const farObjProtoB = harden({
    __proto__: fauxTagRecordB,
  });
  const farObjB = harden({
    __proto__: farObjProtoB,
  });
  t.throws(() => passStyleOf(farObjB), {
    message:
      'cannot serialize Remotables with non-methods like "Symbol(passStyle)" in "[Alleged: manually constructed]"',
  });

  const farObjProtoWithExtra = makeTagishRecord(
    'Alleged: manually constructed',
  );
  Object.defineProperty(farObjProtoWithExtra, 'extra', { value: () => {} });
  harden(farObjProtoWithExtra);
  const badFarObjExtraProtoProp = harden({ __proto__: farObjProtoWithExtra });
  t.throws(() => passStyleOf(badFarObjExtraProtoProp), {
    message: 'Unexpected properties on Remotable Proto ["extra"]',
  });

  t.is(passStyleOf(harden({ __proto__: Object.prototype })), 'copyRecord');

  const farObjC = harden({
    __proto__: Object.prototype,
    method() {
      return 'foo';
    },
  });
  t.throws(() => passStyleOf(farObjC), {
    message:
      'Remotables must be explicitly declared: {"method":"[Function method]"}',
  });
});

test('remotables - safety from the gibson042 attack', t => {
  // Tests the attack explained at
  // https://github.com/endojs/endo/pull/1251#pullrequestreview-1077936894
  const nonEnumerable = {
    configurable: true,
    writable: true,
    enumerable: false,
  };
  const mercurialProto = new Proxy(
    Object.defineProperties(
      {},
      {
        [PASS_STYLE]: { ...nonEnumerable, value: 'remotable' },
        [Symbol.toStringTag]: { ...nonEnumerable, value: 'Remotable' },
      },
    ),
    {
      getPrototypeOf(obj) {
        // Self-mutate after returning the original prototype one time
        // (to checkRemotableProtoOf).
        if (obj[PASS_STYLE] !== 'error') {
          obj[PASS_STYLE] = 'error';
          return Object.prototype;
        }
        return Error.prototype;
      },
    },
  );

  const makeInput = () => Object.freeze({ __proto__: mercurialProto });
  const input1 = makeInput();
  const input2 = makeInput();

  if (harden.isFake) {
    t.throws(() => passStyleOf(input1), {
      message: /^Expected "remotable", not "error"/,
    });
  } else {
    // Further original attack text in comments. The attacks depends on
    // `passStyleOf` succeeding on `input1`. Since `passStyleOf` now throws,
    // that seems to stop the attack:
    // console.log('# passStyleOf(input1)');
    // console.log(passStyleOf(input1)); // => "remotable"
    t.throws(() => passStyleOf(input1), {
      message: 'A tagRecord must be frozen: "[undefined: undefined]"',
    });
  }

  // same because of passStyleMemo WeakMap
  // console.log(`# passStyleOf(input1) again (cached "Purely for performance")`);
  // console.log(passStyleOf(input1)); // => "remotable"
  t.throws(() => passStyleOf(input1), {
    message:
      'Passable Error must inherit from an error class .prototype: "[undefined: undefined]"',
  });

  // different because of changes in the prototype
  // Error (Errors must inherit from an error class .prototype)
  // console.log('# passStyleOf(input2)');
  // console.log(passStyleOf(input2)); // => Error (Errors must inherit from an error class .prototype)
  t.throws(() => passStyleOf(input2), {
    message:
      'Passable Error must inherit from an error class .prototype: "[undefined: undefined]"',
  });
});

test('Unexpected stack on errors', t => {
  let err;
  try {
    null.error;
  } catch (e) {
    err = e;
  }

  const carrierStack = {};
  err.stack = carrierStack;
  Object.freeze(err);

  t.throws(() => passStyleOf(err), {
    message: 'Passable Error "stack" own property must be a string: {}',
  });
  err.stack.foo = 42;
});

test('Allow toStringTag overrides', t => {
  const alice = Far('Alice', { [Symbol.toStringTag]: 'DebugName: Allison' });
  t.is(passStyleOf(alice), 'remotable');
  t.is(`${alice}`, '[object DebugName: Allison]');
  t.is(`${q(alice)}`, '"[DebugName: Allison]"');

  const carol = harden({ __proto__: alice });
  t.is(passStyleOf(carol), 'remotable');
  t.is(`${carol}`, '[object DebugName: Allison]');
  t.is(`${q(carol)}`, '"[DebugName: Allison]"');

  const bob = harden({
    __proto__: carol,
    [Symbol.toStringTag]: 'DebugName: Robert',
  });
  t.is(passStyleOf(bob), 'remotable');
  t.is(`${bob}`, '[object DebugName: Robert]');
  t.is(`${q(bob)}`, '"[DebugName: Robert]"');

  const fred = () => {};
  t.is(fred.name, 'fred');
  defineProperty(fred, Symbol.toStringTag, { value: 'DebugName: Friedrich' });
  const f = Far('Fred', fred);
  t.is(f, fred);
  t.is(passStyleOf(fred), 'remotable');
  t.is(`${fred}`, '() => {}');
  t.is(Object.prototype.toString.call(fred), '[object DebugName: Friedrich]');
  t.is(fred.name, 'fred');
  t.is(`${q(fred)}`, '"[Function fred]"');
});
