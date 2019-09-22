import test from 'tape';
import sinon from 'sinon';
import Evaluator from '../../src/evaluator';

test('HostException in eval revokes unsafeEval', t => {
  t.plan(2);

  // Prevent output
  sinon.stub(console, 'error').callsFake();

  const r = new Evaluator();

  const endowments = { __capture__: {} };
  try {
    r.evaluate(
      `
      function loop(){
        (0, eval)('1');
        loop();
      }

      try {      
        loop();
      } catch(e) {}

      __capture__.evalToString = eval.toString();
    `,
      endowments
    );
    // eslint-disable-next-line no-empty
  } catch (e) {}

  const {
    __capture__: { evalToString }
  } = endowments;

  t.notOk(evalToString.includes('native code'), 'should not be unsafe eval');
  t.ok(evalToString.includes('shim code'), "should be realm's eval");

  // eslint-disable-next-line no-console
  console.error.restore();
});

test('HostException in Function revokes unsafeEval', t => {
  t.plan(2);

  // Prevent output
  sinon.stub(console, 'error').callsFake();

  const r = new Evaluator();

  const endowments = { __capture__: {} };
  try {
    r.evaluate(
      `
      function loop(){
        Function('1');
        loop();
      }

      try {      
        loop();
      } catch(e) {}

      __capture__.evalToString = eval.toString();
    `,
      endowments
    );
    // eslint-disable-next-line no-empty
  } catch (e) {}

  const {
    __capture__: { evalToString }
  } = endowments;

  t.notOk(evalToString.includes('native code'), 'should not be unsafe eval');
  t.ok(evalToString.includes('shim code'), "should be realm's eval");

  // eslint-disable-next-line no-console
  console.error.restore();
});
