/* eslint-disable max-classes-per-file */
import { test } from './prepare-test-env-ava.js';
import { passStyleOf } from '../src/passStyleOf.js';
import { Far } from '../src/make-far.js';
import { makeTagged } from '../src/makeTagged.js';
import { PASS_STYLE } from '../src/helpers/passStyle-helpers.js';

const { getPrototypeOf } = Object;

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
  t.is(passStyleOf(makeTagged('unknown', undefined)), 'tagged');
  t.is(passStyleOf(harden(Error('ok'))), 'error');
});

test('some passStyleOf rejections', t => {
  t.throws(() => passStyleOf(Symbol('unique')), {
    message: /Only registered symbols or well-known symbols are passable: "\[Symbol\(unique\)\]"/,
  });
  t.throws(() => passStyleOf({}), {
    message: /Cannot pass non-frozen objects like {}. Use harden\(\)/,
  });

  const prbad1 = Promise.resolve();
  Object.setPrototypeOf(prbad1, { __proto__: Promise.prototype });
  harden(prbad1);
  t.throws(() => passStyleOf(prbad1), {
    message: /"\[Promise\]" - Must inherit from Promise.prototype: "\[Promise\]"/,
  });

  const prbad2 = Promise.resolve();
  prbad2.extra = 'unexpected own property';
  harden(prbad2);
  t.throws(() => passStyleOf(prbad2), {
    message: /{pr} - Must not have any own properties: \["extra"\]/,
  });

  const prbad3 = Promise.resolve();
  Object.defineProperty(prbad3, 'then', { value: () => 'bad then' });
  harden(prbad3);
  t.throws(() => passStyleOf(prbad3), {
    message: /{pr} - Must not have any own properties: \["then"\]/,
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

test('passStyleOf testing remotables', t => {
  t.is(passStyleOf(Far('foo', {})), 'remotable');
  t.is(passStyleOf(Far('foo', () => 'far function')), 'remotable');

  const tagRecord1 = Object.create(Object.prototype, {
    [PASS_STYLE]: { value: 'remotable' },
    [Symbol.toStringTag]: { value: 'Alleged: manually constructed' },
  });
  const farObj1 = harden({
    __proto__: tagRecord1,
  });
  t.is(passStyleOf(farObj1), 'remotable');

  const tagRecord2 = Object.create(Object.prototype, {
    [PASS_STYLE]: { value: 'remotable' },
    [Symbol.toStringTag]: { value: 'Alleged: tagRecord not hardened' },
  });
  const farObj2 = Object.freeze({
    __proto__: tagRecord2,
  });
  t.throws(() => passStyleOf(farObj2), {
    message: /A tagRecord must be frozen: "\[Alleged: tagRecord not hardened\]"/,
  });

  const tagRecord3 = Object.freeze(
    Object.create(Object.prototype, {
      [PASS_STYLE]: { value: 'remotable' },
      [Symbol.toStringTag]: { value: 'Alleged: both manually frozen' },
    }),
  );
  const farObj3 = Object.freeze({
    __proto__: tagRecord3,
  });
  t.is(passStyleOf(farObj3), 'remotable');

  const tagRecord4 = Object.create(Object.prototype, {
    [PASS_STYLE]: { value: 'remotable' },
    [Symbol.toStringTag]: { value: 'Remotable' },
  });
  const farObj4 = harden({
    __proto__: tagRecord4,
  });
  t.is(passStyleOf(farObj4), 'remotable');

  const tagRecord5 = Object.create(Object.prototype, {
    [PASS_STYLE]: { value: 'remotable' },
    [Symbol.toStringTag]: { value: 'Not alleging' },
  });
  const farObj5 = harden({
    __proto__: tagRecord5,
  });
  t.throws(() => passStyleOf(farObj5), {
    message: /For now, iface "Not alleging" must be "Remotable" or begin with "Alleged: "; unimplemented/,
  });

  const tagRecord6 = Object.create(Object.prototype, {
    [PASS_STYLE]: { value: 'remotable' },
    [Symbol.toStringTag]: { value: 'Alleged: manually constructed' },
  });
  const farObjProto6 = harden({
    __proto__: tagRecord6,
  });
  const farObj6 = harden({
    __proto__: farObjProto6,
  });
  t.is(passStyleOf(farObj6), 'remotable');

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
  const farObj8 = new FarSubclass8(3);
  t.is(passStyleOf(farObj8), 'remotable');
  t.is(farObj8.twice(), 14);

  class NonFarBaseClass9 {}
  class Subclass9 extends NonFarBaseClass9 {}
  t.throws(() => Far('FarType9', Subclass9.prototype), {
    message: 'For now, remotables cannot inherit from anything unusual, in {}',
  });

  const tagRecordA = Object.create(Object.prototype, {
    __proto__: null,
    [PASS_STYLE]: { value: 'remotable' },
    [Symbol.toStringTag]: { value: 'Alleged: null grandproto is fine' },
  });
  const farObjProtoA = harden({
    __proto__: tagRecordA,
  });
  const farObjA = harden({
    __proto__: farObjProtoA,
  });
  t.is(passStyleOf(farObjA), 'remotable');

  t.throws(() => passStyleOf(Object.prototype), {
    message: 'cannot serialize Remotables with accessors like "toString" in {}',
  });

  const fauxTagRecordB = Object.create(
    {},
    {
      [PASS_STYLE]: { value: 'remotable' },
      [Symbol.toStringTag]: { value: 'Alleged: manually constructed' },
    },
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

  passStyleOf(harden({ __proto__: Object.prototype }), 'copyRecord');

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

  // Further original attack text in comments. The attacks depends on
  // `passStyleOf` succeeding on `input1`. Since `passStyleOf` now throws,
  // that seems to stop the attack:
  // console.log('# passStyleOf(input1)');
  // console.log(passStyleOf(input1)); // => "remotable"
  t.throws(() => passStyleOf(input1), {
    message: 'A tagRecord must be frozen: "[undefined: undefined]"',
  });

  // same because of passStyleMemo WeakMap
  // console.log(`# passStyleOf(input1) again (cached "Purely for performance")`);
  // console.log(passStyleOf(input1)); // => "remotable"
  t.throws(() => passStyleOf(input1), {
    message:
      'Errors must inherit from an error class .prototype "[undefined: undefined]"',
  });

  // different because of changes in the prototype
  // Error (Errors must inherit from an error class .prototype)
  // console.log('# passStyleOf(input2)');
  // console.log(passStyleOf(input2)); // => Error (Errors must inherit from an error class .prototype)
  t.throws(() => passStyleOf(input2), {
    message:
      'Errors must inherit from an error class .prototype "[undefined: undefined]"',
  });
});
