/* eslint-disable max-classes-per-file */
/* eslint-disable class-methods-use-this */
// eslint-disable-next-line import/order
import test from '@endo/ses-ava';

import { passStyleOf } from '@endo/pass-style';
import { M, getInterfaceGuardPayload } from '@endo/patterns';
import { makeExo, defineExoClass } from '../src/exo-makers.js';

// Based on FarSubclass1 in test-far-class-instances.js
class DoublerBehaviorClass {
  double(x) {
    return x + x;
  }
}

const DoublerI = M.interface('Doubler', {
  double: M.call(M.lte(10)).returns(M.number()),
});

const doubler = makeExo('doubler', DoublerI, DoublerBehaviorClass.prototype);

test('exo doubler using js classes', t => {
  t.is(passStyleOf(doubler), 'remotable');
  t.is(doubler.double(3), 6);
  t.throws(() => doubler.double('x'), {
    message: 'In "double" method of (doubler): arg 0: "x" - Must be <= 10',
  });
  t.throws(() => doubler.double(), {
    message:
      'In "double" method of (doubler): Expected at least 1 arguments: []',
  });
  t.throws(() => doubler.double(12), {
    message: 'In "double" method of (doubler): arg 0: 12 - Must be <= 10',
  });
});

// Based on FarSubclass2 in test-far-class-instances.js
class DoubleAdderBehaviorClass extends DoublerBehaviorClass {
  doubleAddSelfCall(x) {
    const {
      state: { y },
      self,
    } = this;
    return self.double(x) + y;
  }

  doubleAddSuperCall(x) {
    const {
      state: { y },
    } = this;
    return super.double(x) + y;
  }
}

const DoubleAdderI = M.interface('DoubleAdder', {
  ...getInterfaceGuardPayload(DoublerI).methodGuards,
  doubleAddSelfCall: M.call(M.number()).returns(M.number()),
  doubleAddSuperCall: M.call(M.number()).returns(M.number()),
});

const makeDoubleAdder = defineExoClass(
  'doubleAdderClass',
  DoubleAdderI,
  y => ({ y }),
  DoubleAdderBehaviorClass.prototype,
);

test('exo inheritance self vs super call', t => {
  const da = makeDoubleAdder(5);
  t.is(da.doubleAddSelfCall(3), 11);
  t.throws(() => da.doubleAddSelfCall(12), {
    message:
      'In "double" method of (doubleAdderClass): arg 0: 12 - Must be <= 10',
  });
  t.is(da.doubleAddSuperCall(12), 29);
});
