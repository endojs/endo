import test from 'tape';
import sinon from 'sinon';
import Evaluator from '../../src/evaluator';

test('HostException in eval revokes unsafeEval', t => {
  t.plan(2);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  // Prevent output
  sinon.stub(console, 'error').callsFake();

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this')();
  const e = new Evaluator();

  const endowments = { $$eval$$: null };
  try {
    e.evaluateScript(
      `
      function loop(){
        (0, eval)('1');
        loop();
      }

      try {      
        loop();
      } catch(e) {}

      $$eval$$ = eval;
    `,
      endowments,
    );
    // eslint-disable-next-line no-empty
  } catch (err) {}

  t.equal(endowments.$$eval$$, e.global.eval, "should be realm's eval");
  t.notEqual(
    endowments.$$eval$$,
    unsafeGlobal.eval,
    'should not be unsafe eval',
  );

  sinon.restore();
});

test('HostException in Function revokes unsafeEval', t => {
  t.plan(2);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  // Prevent output
  sinon.stub(console, 'error').callsFake();

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this')();
  const e = new Evaluator();

  const endowments = { $$eval$$: null };
  try {
    e.evaluateScript(
      `
      function loop(){
        Function('1');
        loop();
      }

      try {      
        loop();
      } catch(e) {}

      $$eval$$ = eval;
    `,
      endowments,
    );
    // eslint-disable-next-line no-empty
  } catch (err) {}

  t.equal(endowments.$$eval$$, e.global.eval, "should be realm's eval");
  t.notEqual(
    endowments.$$eval$$,
    unsafeGlobal.eval,
    'should not be unsafe eval',
  );

  sinon.restore();
});
