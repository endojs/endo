import tap from 'tap';
import '../lockdown.js';

const { test } = tap;

lockdown();

test('evade html comment expressions in evaluate', t => {
  const c = new Compartment();

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
    () => c.evaluate(wrap(htmlOpenComment1)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => c.evaluate(wrap(htmlCloseComment1)),
    SyntaxError,
    'htmlCloseComment',
  );

  t.throws(
    () => c.evaluate(wrap(htmlOpenComment2)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => c.evaluate(wrap(htmlCloseComment2)),
    SyntaxError,
    'htmlCloseComment',
  );

  t.throws(
    () => c.evaluate(wrap(htmlOpenComment3)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => c.evaluate(wrap(htmlCloseComment3)),
    SyntaxError,
    'htmlCloseComment',
  );

  t.end();
});

test('evade html comment expressions in Function', t => {
  const c = new Compartment();

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
    () => c.evaluate(wrap(htmlOpenComment1)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => c.evaluate(wrap(htmlCloseComment1)),
    SyntaxError,
    'htmlCloseComment',
  );

  t.throws(
    () => c.evaluate(wrap(htmlOpenComment2)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => c.evaluate(wrap(htmlCloseComment2)),
    SyntaxError,
    'htmlCloseComment',
  );

  t.throws(
    () => c.evaluate(wrap(htmlOpenComment3)),
    SyntaxError,
    'htmlOpenComment',
  );
  t.throws(
    () => c.evaluate(wrap(htmlCloseComment3)),
    SyntaxError,
    'htmlCloseComment',
  );

  t.end();
});
