import test from 'ava';
import sinon from 'sinon';
import '../lockdown.js';
import stubFunctionConstructors from './stub-function-constructors.js';

test('typeof', t => {
  t.plan(8);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();

  t.throws(() => c.evaluate('DEFINITELY_NOT_DEFINED'), {
    instanceOf: ReferenceError,
  });
  t.is(c.evaluate('typeof DEFINITELY_NOT_DEFINED'), 'undefined');

  t.is(c.evaluate('typeof 4'), 'number');
  t.is(c.evaluate('typeof undefined'), 'undefined');
  t.is(c.evaluate('typeof "a string"'), 'string');

  // TODO: the Compartment currently censors objects from the unsafe global, but
  // they appear defined as 'undefined' and don't throw a ReferenceError.
  // https://github.com/Agoric/SES-shim/issues/309
  t.notThrows(() => c.evaluate('global'));
  t.is(c.evaluate('global'), undefined);
  t.is(c.evaluate('typeof global'), 'undefined');

  sinon.restore();
});
