import test from 'tape';
import sinon from 'sinon';
import Evaluator from '../../src/evaluator';

test('typeof', t => {
  t.plan(8);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e = new Evaluator();

  t.throws(() => e.evaluateScript('DEFINITELY_NOT_DEFINED'), ReferenceError);
  t.equal(e.evaluateScript('typeof DEFINITELY_NOT_DEFINED'), 'undefined');

  t.equal(e.evaluateScript('typeof 4'), 'number');
  t.equal(e.evaluateScript('typeof undefined'), 'undefined');
  t.equal(e.evaluateScript('typeof "a string"'), 'string');

  // TODO: the Evaluator currently censors objects from the unsafe global, but
  // they appear defined as 'undefined' and don't throw a ReferenceError.
  t.doesNotThrow(() => e.evaluateScript('global'), ReferenceError);
  t.equal(e.evaluateScript('global'), undefined);
  t.equal(e.evaluateScript('typeof global'), 'undefined');

  sinon.restore();
});
