/* eslint-disable max-classes-per-file */
/* eslint-disable class-methods-use-this */
// eslint-disable-next-line import/order
import { test } from './prepare-test-env-ava.js';

import { FarBaseClass, passStyleOf } from '@endo/pass-style';
// import { M, getInterfaceGuardPayload } from '@endo/patterns';
// import { defineExoClass, makeExo } from '../src/exo-makers.js';
import { M } from '@endo/patterns';
import { makeExo } from '../src/exo-makers.js';

// Based on FarSubclass1 in test-far-class-instances.js
class DoublerBehaviorClass extends FarBaseClass {
  double(x) {
    return x + x;
  }
}

const DoublerI = M.interface('Doubler', {
  double: M.call(M.number()).returns(M.number()),
});

const doubler = makeExo('doubler', DoublerI, DoublerBehaviorClass.prototype);

test('exo doubler using js classes', t => {
  t.is(passStyleOf(doubler), 'remotable');
  t.is(doubler.double(3), 6);
  t.throws(() => doubler.double('x'), {
    message:
      'In "double" method of (doubler): arg 0: string "x" - Must be a number',
  });
  t.throws(() => doubler.double(), {
    message:
      'In "double" method of (doubler): Expected at least 1 arguments: []',
  });
});

// // Based on FarSubclass2 in test-far-class-instances.js
// class DoubleAdderBehaviorClass extends DoublerBehaviorClass {
//   doubleAdd(x) {
//     const {
//       state: { y },
//       self,
//     } = this;
//     return self.double(x) + y;
//   }
// }

// const DoubleAdderI = M.interface('DoubleAdder', {
//   ...getInterfaceGuardPayload(DoublerI).methodGuards,
//   doubleAdd: M.call(M.number()).returns(M.number()),
// });

// const makeDoubleAdder = defineExoClass(
//   'doubleAdderClass',
//   DoubleAdderI,
//   y => ({ y }),
//   DoubleAdderBehaviorClass.prototype,
// );
