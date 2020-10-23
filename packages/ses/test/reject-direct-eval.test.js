import tap from 'tap';
import '../lockdown.js';

const { test } = tap;

lockdown();

test('reject direct eval expressions in evaluate', t => {
  const c = new Compartment();

  function wrap(s) {
    return `
      function name() {
        ${s};
        return a;
      }`;
  }

  const safe = `const a = 1`;
  const safe2 = `const a = noteval('evil')`;
  const safe3 = `const a = evalnot('evil')`;

  // "bogus" is actually direct eval syntax which ideally we could
  // reject. However, it escapes our regexp, which we allow because
  // accepting it is a future compat issue, not a security issue.
  const bogus = `const a = (eval)('evil')`;

  const obvious = `const a = eval('evil')`;
  const whitespace = `const a = eval ('evil')`;
  const comment = `const a = eval/*hah*/('evil')`;
  const doubleSlashComment = `const a = eval // hah\n('evil')`;
  const newline = `const a = eval\n('evil')`;
  const multiline = `\neval('a')\neval('b')`;

  t.doesNotThrow(() => c.evaluate(wrap(safe)), 'safe');
  t.doesNotThrow(() => c.evaluate(wrap(safe2)), 'safe2');
  t.doesNotThrow(() => c.evaluate(wrap(safe3)), 'safe3');

  t.doesNotThrow(() => c.evaluate(wrap(bogus)), 'bogus');

  t.throws(() => c.evaluate(wrap(obvious)), SyntaxError, 'obvious');
  t.throws(() => c.evaluate(wrap(whitespace)), SyntaxError, 'whitespace');
  t.doesNotThrow(() => c.evaluate(wrap(comment)), 'comment');
  t.doesNotThrow(
    () => c.evaluate(wrap(doubleSlashComment)),
    'doubleSlashComment',
  );
  t.throws(() => c.evaluate(wrap(newline)), SyntaxError, 'newline');
  t.throws(() => c.evaluate(wrap(multiline)), SyntaxError, 'newline');

  t.end();
});

test('reject direct eval expressions in Function', t => {
  const c = new Compartment();

  function wrap(s) {
    return `new Function(${'`'}${s}; return a;${'`'})`;
  }

  const safe = `const a = 1`;
  const safe2 = `const a = noteval('evil')`;
  const safe3 = `const a = evalnot('evil')`;

  // "bogus" is actually direct eval syntax which ideally we could
  // reject. However, it escapes our regexp, which we allow because
  // accepting it is a future compat issue, not a security issue.
  const bogus = `const a = (eval)('evil')`;

  const obvious = `const a = eval('evil')`;
  const whitespace = `const a = eval ('evil')`;
  const comment = `const a = eval/*hah*/('evil')`;
  const doubleSlashComment = `const a = eval // hah\n('evil')`;
  const newline = `const a = eval\n('evil')`;
  const multiline = `\neval('a')\neval('b')`;

  t.doesNotThrow(() => c.evaluate(wrap(safe)), 'safe');
  t.doesNotThrow(() => c.evaluate(wrap(safe2)), 'safe2');
  t.doesNotThrow(() => c.evaluate(wrap(safe3)), 'safe3');

  t.doesNotThrow(() => c.evaluate(wrap(bogus)), 'bogus');

  t.throws(() => c.evaluate(wrap(obvious)), SyntaxError, 'obvious');
  t.throws(() => c.evaluate(wrap(whitespace)), SyntaxError, 'whitespace');
  t.doesNotThrow(() => c.evaluate(wrap(comment)), 'comment');
  t.doesNotThrow(
    () => c.evaluate(wrap(doubleSlashComment)),
    'doubleSlashComment',
  );
  t.throws(() => c.evaluate(wrap(newline)), SyntaxError, 'newline');
  t.throws(() => c.evaluate(wrap(multiline)), SyntaxError, 'newline');

  t.end();
});
