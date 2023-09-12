/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file */
import { test } from './prepare-test-env-ava.js';

// TODO enable import of getMethodNames without deep import
// eslint-disable-next-line import/order
import { getMethodNames } from '@endo/eventual-send/src/local.js';
import { passStyleOf } from '../src/passStyleOf.js';
import { FarBaseClass } from '../src/far-class-instances.js';

class FarSubclass1 extends FarBaseClass {
  double(x) {
    return x + x;
  }
}

class FarSubclass2 extends FarSubclass1 {
  #y = 0;

  constructor(y) {
    super();
    this.#y = y;
  }

  doubleAdd(x) {
    return this.double(x) + this.#y;
  }
}

test('far class instances', t => {
  const fb = new FarBaseClass();
  t.is(passStyleOf(fb), 'remotable');
  t.deepEqual(getMethodNames(fb), ['constructor']);

  t.assert(new fb.constructor() instanceof FarBaseClass);
  t.throws(() => fb.constructor(), {
    // TODO message depends on JS engine, and so is a fragile golden test
    message: "Class constructor FarBaseClass cannot be invoked without 'new'",
  });

  const fs1 = new FarSubclass1();
  t.is(passStyleOf(fs1), 'remotable');
  t.is(fs1.double(4), 8);
  t.assert(new fs1.constructor() instanceof FarSubclass1);
  t.deepEqual(getMethodNames(fs1), ['constructor', 'double']);

  const fs2 = new FarSubclass2(3);
  t.is(passStyleOf(fs2), 'remotable');
  t.is(fs2.double(4), 8);
  t.is(fs2.doubleAdd(4), 11);
  t.deepEqual(getMethodNames(fs2), ['constructor', 'double', 'doubleAdd']);

  const yField = new WeakMap();
  class FarSubclass3 extends FarSubclass1 {
    constructor(y) {
      super();
      yField.set(this, y);
    }

    doubleAdd(x) {
      return this.double(x) + yField.get(this);
    }
  }

  const fs3 = new FarSubclass3(3);
  t.is(passStyleOf(fs3), 'remotable');
  t.is(fs3.double(4), 8);
  t.is(fs3.doubleAdd(4), 11);
  t.deepEqual(getMethodNames(fs3), ['constructor', 'double', 'doubleAdd']);
});

test('far class instance hardened empty', t => {
  class FarClass4 extends FarBaseClass {
    z = 0;
  }
  t.throws(() => new FarClass4(), {
    // TODO message depends on JS engine, and so is a fragile golden test
    message: 'Cannot define property z, object is not extensible',
  });
});
