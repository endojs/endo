import tap from 'tap';
import '../lockdown.js';

const { test } = tap;

lockdown();

const opt = harden({ __evadeImportExpressionTest__: true });

test('evade import expressions in evaluate', t => {
  const c = new Compartment();

  function wrap(s) {
    return `
      function name() {
        ${s};
        return a;
      }`;
  }

  const obvious = `const a = import('evil')`;
  const whitespace = `const a = import ('evil')`;
  const comment = `const a = import/*hah*/('evil')`;
  const doubleSlashComment = `const a = import // hah\n('evil')`;
  const newline = `const a = import\n('evil')`;
  const multiline = `\nimport('a')\nimport('b')`;

  t.doesNotThrow(() => c.evaluate(wrap(obvious), opt), 'obvious');
  t.doesNotThrow(() => c.evaluate(wrap(whitespace), opt), 'whitespace');
  t.doesNotThrow(() => c.evaluate(wrap(comment), opt), 'comment');
  t.doesNotThrow(
    () => c.evaluate(wrap(doubleSlashComment), opt),
    'doubleSlashComment',
  );
  t.doesNotThrow(() => c.evaluate(wrap(newline), opt), 'newline');
  t.doesNotThrow(() => c.evaluate(wrap(multiline), opt), 'multiline');

  t.end();
});

test('evade import expressions in Function', t => {
  const c = new Compartment();

  function wrap(s) {
    return `new Function(${'`'}${s}; return a;${'`'})`;
  }

  const obvious = `const a = import('evil')`;
  const whitespace = `const a = import ('evil')`;
  const comment = `const a = import/*hah*/('evil')`;
  const doubleSlashComment = `const a = import // hah\n('evil')`;
  const newline = `const a = import\n('evil')`;
  const multiline = `\nimport('a')\nimport('b')`;

  t.doesNotThrow(() => c.evaluate(wrap(obvious), opt), 'obvious');
  t.doesNotThrow(() => c.evaluate(wrap(whitespace), opt), 'whitespace');
  t.doesNotThrow(() => c.evaluate(wrap(comment), opt), 'comment');
  t.doesNotThrow(
    () => c.evaluate(wrap(doubleSlashComment), opt),
    'doubleSlashComment',
  );
  t.doesNotThrow(() => c.evaluate(wrap(newline), opt), 'newline');
  t.doesNotThrow(() => c.evaluate(wrap(multiline), opt), 'multiline');

  t.end();
});
