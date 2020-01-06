import tap from 'tap';
import sinon from 'sinon';
import Evaluator from '../../src/main.js';
import stubFunctionConstructors from '../stubFunctionConstructors.js';

const { test } = tap;

test('reject html comment expressions in evaluate', t => {
  t.plan(6);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

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
    () => e.evaluate(wrap(htmlOpenComment1)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => e.evaluate(wrap(htmlCloseComment1)),
    SyntaxError,
    'htmlCloseComment',
  );

  t.throws(
    () => e.evaluate(wrap(htmlOpenComment2)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => e.evaluate(wrap(htmlCloseComment2)),
    SyntaxError,
    'htmlCloseComment',
  );

  t.throws(
    () => e.evaluate(wrap(htmlOpenComment3)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => e.evaluate(wrap(htmlCloseComment3)),
    SyntaxError,
    'htmlCloseComment',
  );

  sinon.restore();
});

test('reject html comment expressions in Function', t => {
  t.plan(6);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

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
    () => e.evaluate(wrap(htmlOpenComment1)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => e.evaluate(wrap(htmlCloseComment1)),
    SyntaxError,
    'htmlCloseComment',
  );

  t.throws(
    () => e.evaluate(wrap(htmlOpenComment2)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => e.evaluate(wrap(htmlCloseComment2)),
    SyntaxError,
    'htmlCloseComment',
  );

  t.throws(
    () => e.evaluate(wrap(htmlOpenComment3)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => e.evaluate(wrap(htmlCloseComment3)),
    SyntaxError,
    'htmlCloseComment',
  );

  sinon.restore();
});
