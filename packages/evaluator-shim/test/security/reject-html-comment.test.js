import test from 'tape';
import sinon from 'sinon';
import Evaluator from '../../src/evaluator';

test('reject html comment expressions in evaluate', t => {
  t.plan(6);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e = new Evaluator();

  function wrap(s) {
    return `
      function name() {
        ${s};
        return a;
      }`;
  }

  const htmlOpenComment1 = `const a = foo <!-- hah\n('evil')`;
  const htmlCloseComment1 = `const a = foo --> hah\n('evil')`;
  const htmlOpenComment2 = `const a = eval <!-- hah\n('evil')`;
  const htmlCloseComment2 = `const a = eval --> hah\n('evil')`;
  const htmlOpenComment3 = `const a = import <!-- hah\n('evil')`;
  const htmlCloseComment3 = `const a = import --> hah\n('evil')`;

  t.throws(
    () => e.evaluateScript(wrap(htmlOpenComment1)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => e.evaluateScript(wrap(htmlCloseComment1)),
    SyntaxError,
    'htmlCloseComment',
  );

  t.throws(
    () => e.evaluateScript(wrap(htmlOpenComment2)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => e.evaluateScript(wrap(htmlCloseComment2)),
    SyntaxError,
    'htmlCloseComment',
  );

  t.throws(
    () => e.evaluateScript(wrap(htmlOpenComment3)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => e.evaluateScript(wrap(htmlCloseComment3)),
    SyntaxError,
    'htmlCloseComment',
  );

  sinon.restore();
});

test('reject html comment expressions in Function', t => {
  t.plan(6);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e = new Evaluator();

  function wrap(s) {
    return `new Function("${s}; return a;")`;
  }

  const htmlOpenComment1 = `const a = foo <!-- hah\n('evil')`;
  const htmlCloseComment1 = `const a = foo --> hah\n('evil')`;
  const htmlOpenComment2 = `const a = eval <!-- hah\n('evil')`;
  const htmlCloseComment2 = `const a = eval --> hah\n('evil')`;
  const htmlOpenComment3 = `const a = import <!-- hah\n('evil')`;
  const htmlCloseComment3 = `const a = import --> hah\n('evil')`;

  t.throws(
    () => e.evaluateScript(wrap(htmlOpenComment1)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => e.evaluateScript(wrap(htmlCloseComment1)),
    SyntaxError,
    'htmlCloseComment',
  );

  t.throws(
    () => e.evaluateScript(wrap(htmlOpenComment2)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => e.evaluateScript(wrap(htmlCloseComment2)),
    SyntaxError,
    'htmlCloseComment',
  );

  t.throws(
    () => e.evaluateScript(wrap(htmlOpenComment3)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => e.evaluateScript(wrap(htmlCloseComment3)),
    SyntaxError,
    'htmlCloseComment',
  );

  sinon.restore();
});
