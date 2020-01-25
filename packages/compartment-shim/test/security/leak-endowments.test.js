import tap from 'tap';
import sinon from 'sinon';
import Compartment from '../../src/main.js';
import stubFunctionConstructors from '../stubFunctionConstructors.js';

const { test } = tap;

test('endowments are not shared between calls to c.evaluate', t => {
  t.plan(3);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();
  unsafeGlobal.bar = {};

  const c = new Compartment();
  t.equal(c.evaluate(`4`, { endow1: 1 }), 4);
  t.throws(() => c.evaluate(`endow1`), ReferenceError);
  t.throws(() => c.evaluate(`endow2`), ReferenceError);

  sinon.restore();
});

test('endowments are mutable but not shared between calls to c.evaluate', t => {
  t.plan(9);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();
  unsafeGlobal.bar = {};

  const c = new Compartment();

  // assignment to endowments works
  t.equal(c.evaluate(`endow1 = 4; endow1`, { endow1: 1 }), 4);
  t.equal(c.evaluate(`endow1 += 4; endow1`, { endow1: 1 }), 5);

  // the global is not modified when an endowment shadows it
  t.throws(() => c.evaluate(`endow1`), ReferenceError);
  t.equal(c.global.endow1, undefined);

  // assignment to global works even when an endowment shadows it
  t.equal(c.evaluate(`this.endow1 = 4; this.endow1`, { endow1: 1 }), 4);
  t.equal(c.evaluate(`this.endow1 = 4; endow1`, { endow1: 1 }), 1);

  // the modified global is now visible when there is no endowment to shadow it
  t.equal(c.global.endow1, 4);
  t.equal(c.evaluate(`endow1`), 4);

  // endowments shadow globals
  t.equal(c.evaluate(`endow1`, { endow1: 44 }), 44);

  sinon.restore();
});
