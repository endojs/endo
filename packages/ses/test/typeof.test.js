import tap from 'tap';
import sinon from 'sinon';
import { Compartment } from '../src/compartment-shim.js';
import stubFunctionConstructors from './stub-function-constructors.js';

const { test } = tap;

test('typeof', t => {
  t.plan(8);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();

  t.throws(() => c.evaluate('DEFINITELY_NOT_DEFINED'), ReferenceError);
  t.equal(c.evaluate('typeof DEFINITELY_NOT_DEFINED'), 'undefined');

  t.equal(c.evaluate('typeof 4'), 'number');
  t.equal(c.evaluate('typeof undefined'), 'undefined');
  t.equal(c.evaluate('typeof "a string"'), 'string');

  // TODO: the Compartment currently censors objects from the unsafe global, but
  // they appear defined as 'undefined' and don't throw a ReferenceError.
  t.doesNotThrow(() => c.evaluate('global'), ReferenceError);
  t.equal(c.evaluate('global'), undefined);
  t.equal(c.evaluate('typeof global'), 'undefined');

  sinon.restore();
});
