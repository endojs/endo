import tap from 'tap';
import sinon from 'sinon';
import '../lockdown.js';
import stubFunctionConstructors from './stub-function-constructors.js';

const { test } = tap;

test('reject direct eval expressions in evaluate', t => {
  t.plan(10);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

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

  t.doesNotThrow(() => c.evaluate(wrap(safe)), SyntaxError, 'safe');
  t.doesNotThrow(() => c.evaluate(wrap(safe2)), SyntaxError, 'safe2');
  t.doesNotThrow(() => c.evaluate(wrap(safe3)), SyntaxError, 'safe3');

  t.doesNotThrow(() => c.evaluate(wrap(bogus)), SyntaxError, 'bogus');

  t.throws(() => c.evaluate(wrap(obvious)), SyntaxError, 'obvious');
  t.throws(() => c.evaluate(wrap(whitespace)), SyntaxError, 'whitespace');
  t.throws(() => c.evaluate(wrap(comment)), SyntaxError, 'comment');
  t.throws(
    () => c.evaluate(wrap(doubleSlashComment)),
    SyntaxError,
    'doubleSlashComment',
  );
  t.throws(() => c.evaluate(wrap(newline)), SyntaxError, 'newline');
  t.throws(() => c.evaluate(wrap(multiline)), SyntaxError, 'newline');

  sinon.restore();
});

test('reject direct eval expressions in Function', t => {
  t.plan(10);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();

  function wrap(s) {
    return `new Function("${s}; return a;")`;
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

  t.doesNotThrow(() => c.evaluate(wrap(safe)), SyntaxError, 'safe');
  t.doesNotThrow(() => c.evaluate(wrap(safe2)), SyntaxError, 'safe2');
  t.doesNotThrow(() => c.evaluate(wrap(safe3)), SyntaxError, 'safe3');

  t.doesNotThrow(() => c.evaluate(wrap(bogus)), SyntaxError, 'bogus');

  t.throws(() => c.evaluate(wrap(obvious)), SyntaxError, 'obvious');
  t.throws(() => c.evaluate(wrap(whitespace)), SyntaxError, 'whitespace');
  t.throws(() => c.evaluate(wrap(comment)), SyntaxError, 'comment');
  t.throws(
    () => c.evaluate(wrap(doubleSlashComment)),
    SyntaxError,
    'doubleSlashComment',
  );
  t.throws(() => c.evaluate(wrap(newline)), SyntaxError, 'newline');
  t.throws(() => c.evaluate(wrap(multiline)), SyntaxError, 'newline');

  sinon.restore();
});

test('reject direct eval expressions with name', t => {
  t.plan(2);

  const c = new Compartment();
  const code = 'eval("evil")';

  t.throws(
    () => c.evaluate(code),
    {
      name: 'SyntaxError',
      message:
        'possible direct eval expression rejected around line 1 of <unknown>',
    },
    'newline with name',
  );

  t.throws(
    () =>
      c.evaluate(code, {
        name: 'contrived://example',
      }),
    {
      name: 'SyntaxError',
      message:
        'possible direct eval expression rejected around line 1 of contrived://example',
    },
    'newline with name',
  );
});
