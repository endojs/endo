import tap from 'tap';
import '../lockdown.js';

const { test } = tap;

lockdown();

const opt = harden({ __evadeDirectEvalTest__: true });

test('evade direct eval expressions in evaluate', t => {
  const c = new Compartment();

  function wrap(s) {
    return `
      function name() {
        ${s};
        return a;
      }`;
  }

  const obvious = `const a = eval('evil')`;
  const whitespace = `const a = eval ('evil')`;
  const newline = `const a = eval\n('evil')`;
  const multiline = `\neval('a')\neval('b')`;

  t.doesNotThrow(() => c.evaluate(wrap(obvious), opt), 'obvious');
  t.doesNotThrow(() => c.evaluate(wrap(whitespace), opt), 'whitespace');
  t.doesNotThrow(() => c.evaluate(wrap(newline), opt), 'newline');
  t.doesNotThrow(() => c.evaluate(wrap(multiline), opt), 'newline');

  t.end();
});

test('evade direct eval expressions in Function', t => {
  const c = new Compartment();

  function wrap(s) {
    return `new Function(${'`'}${s}; return a;${'`'})`;
  }

  const obvious = `const a = eval('evil')`;
  const whitespace = `const a = eval ('evil')`;
  const newline = `const a = eval\n('evil')`;
  const multiline = `\neval('a')\neval('b')`;

  t.doesNotThrow(() => c.evaluate(wrap(obvious), opt), 'obvious');
  t.doesNotThrow(() => c.evaluate(wrap(whitespace), opt), 'whitespace');
  t.doesNotThrow(() => c.evaluate(wrap(newline), opt), 'newline');
  t.doesNotThrow(() => c.evaluate(wrap(multiline), opt), 'newline');

  t.end();
});
