import tap from 'tap';
import '../lockdown.js';

const { test } = tap;

lockdown();

const opt = harden({ __evadeHtmlCommentTest__: true });

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

  t.doesNotThrow(
    () => c.evaluate(wrap(htmlOpenComment1), opt),
    'htmlOpenComment',
  );
  t.doesNotThrow(
    () => c.evaluate(wrap(htmlCloseComment1), opt),
    'htmlCloseComment',
  );

  t.doesNotThrow(
    () => c.evaluate(wrap(htmlOpenComment2), opt),
    'htmlOpenComment',
  );
  t.end();
});

test('evade html comment expressions in Function', t => {
  const c = new Compartment();

  function wrap(s) {
    return `new Function(${'`'}${s}; return a;${'`'})`;
  }

  const htmlOpenComment1 = `const a = foo <!-- hah\n('evil')`;
  const htmlCloseComment1 = `const a = foo --> hah\n('evil')`;
  const htmlOpenComment2 = `const a = eval <!-- hah\n('evil')`;

  t.doesNotThrow(
    () => c.evaluate(wrap(htmlOpenComment1), opt),
    'htmlOpenComment',
  );
  t.doesNotThrow(
    () => c.evaluate(wrap(htmlCloseComment1), opt),
    'htmlCloseComment',
  );

  t.doesNotThrow(
    () => c.evaluate(wrap(htmlOpenComment2), opt),
    'htmlOpenComment',
  );

  t.end();
});
