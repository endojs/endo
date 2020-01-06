import tap from 'tap';
import sinon from 'sinon';
import Evaluator from '../../src/main.js';
import stubFunctionConstructors from '../stubFunctionConstructors.js';

const { test } = tap;

test('typeof', t => {
  t.plan(8);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const e = new Evaluator();

  t.throws(() => e.evaluate('DEFINITELY_NOT_DEFINED'), ReferenceError);
  t.equal(e.evaluate('typeof DEFINITELY_NOT_DEFINED'), 'undefined');

  t.equal(e.evaluate('typeof 4'), 'number');
  t.equal(e.evaluate('typeof undefined'), 'undefined');
  t.equal(e.evaluate('typeof "a string"'), 'string');

  // TODO: the Evaluator currently censors objects from the unsafe global, but
  // they appear defined as 'undefined' and don't throw a ReferenceError.
  t.doesNotThrow(() => e.evaluate('global'), ReferenceError);
  t.equal(e.evaluate('global'), undefined);
  t.equal(e.evaluate('typeof global'), 'undefined');

  sinon.restore();
});
