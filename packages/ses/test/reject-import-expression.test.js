import tap from 'tap';
import sinon from 'sinon';
import '../lockdown.js';
import stubFunctionConstructors from './stub-function-constructors.js';

const { test } = tap;

test('reject import expressions in evaluate', t => {
  t.plan(9);

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
  const safe2 = `const a = notimport('evil')`;
  const safe3 = `const a = importnot('evil')`;

  const obvious = `const a = import('evil')`;
  const whitespace = `const a = import ('evil')`;
  const comment = `const a = import/*hah*/('evil')`;
  const doubleSlashComment = `const a = import // hah\n('evil')`;
  const newline = `const a = import\n('evil')`;
  const multiline = `\nimport('a')\nimport('b')`;

  t.doesNotThrow(() => c.evaluate(wrap(safe)), SyntaxError, 'safe');
  t.doesNotThrow(() => c.evaluate(wrap(safe2)), SyntaxError, 'safe2');
  t.doesNotThrow(() => c.evaluate(wrap(safe3)), SyntaxError, 'safe3');
  t.throws(() => c.evaluate(wrap(obvious)), SyntaxError, 'obvious');
  t.throws(() => c.evaluate(wrap(whitespace)), SyntaxError, 'whitespace');
  t.throws(() => c.evaluate(wrap(comment)), SyntaxError, 'comment');
  t.throws(
    () => c.evaluate(wrap(doubleSlashComment)),
    SyntaxError,
    'doubleSlashComment',
  );
  t.throws(() => c.evaluate(wrap(newline)), SyntaxError, 'newline');
  t.throws(() => c.evaluate(wrap(multiline)), SyntaxError, 'multiline');

  sinon.restore();
});

test('reject import expressions in Function', t => {
  t.plan(9);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();

  function wrap(s) {
    return `new Function("${s}; return a;")`;
  }

  const safe = `const a = 1`;
  const safe2 = `const a = notimport('evil')`;
  const safe3 = `const a = importnot('evil')`;

  const obvious = `const a = import('evil')`;
  const whitespace = `const a = import ('evil')`;
  const comment = `const a = import/*hah*/('evil')`;
  const doubleSlashComment = `const a = import // hah\n('evil')`;
  const newline = `const a = import\n('evil')`;
  const multiline = `\nimport('a')\nimport('b')`;

  t.doesNotThrow(() => c.evaluate(wrap(safe)), SyntaxError, 'safe');
  t.doesNotThrow(() => c.evaluate(wrap(safe2)), SyntaxError, 'safe2');
  t.doesNotThrow(() => c.evaluate(wrap(safe3)), SyntaxError, 'safe3');
  t.throws(() => c.evaluate(wrap(obvious)), SyntaxError, 'obvious');
  t.throws(() => c.evaluate(wrap(whitespace)), SyntaxError, 'whitespace');
  t.throws(() => c.evaluate(wrap(comment)), SyntaxError, 'comment');
  t.throws(
    () => c.evaluate(wrap(doubleSlashComment)),
    SyntaxError,
    'doubleSlashComment',
  );
  t.throws(() => c.evaluate(wrap(newline)), SyntaxError, 'newline');
  t.throws(() => c.evaluate(wrap(multiline)), SyntaxError, 'multiline');

  sinon.restore();
});

test('reject import expressions with error messages', t => {
  t.plan(2);

  const c = new Compartment();
  const code = 'import("attack?exfiltration")';
  t.throws(
    () => c.evaluate(code),
    {
      name: 'SyntaxError',
      message: 'SES2: Possible import expression rejected at <unknown>:1',
    },
    'without name',
  );

  t.throws(
    () => c.evaluate(`\n${code}//#sourceURL= never://land`),
    {
      name: 'SyntaxError',
      message: 'SES2: Possible import expression rejected at never://land:2',
    },
    'with name',
  );
});
