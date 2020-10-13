import test from 'ava';
import sinon from 'sinon';
import '../lockdown.js';
import stubFunctionConstructors from './stub-function-constructors.js';

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

  t.notThrows(() => c.evaluate(wrap(safe)), 'safe');
  t.notThrows(() => c.evaluate(wrap(safe2)),'safe2');
  t.notThrows(() => c.evaluate(wrap(safe3)),'safe3');
  t.throws(() => c.evaluate(wrap(obvious)), { instanceOf: SyntaxError }, 'obvious');
  t.throws(() => c.evaluate(wrap(whitespace)), { instanceOf: SyntaxError }, 'whitespace');
  t.throws(() => c.evaluate(wrap(comment)), { instanceOf: SyntaxError }, 'comment');
  t.throws(
    () => c.evaluate(wrap(doubleSlashComment)),
    { instanceOf: SyntaxError },
    'doubleSlashComment',
  );
  t.throws(() => c.evaluate(wrap(newline)), { instanceOf: SyntaxError }, 'newline');
  t.throws(() => c.evaluate(wrap(multiline)), { instanceOf: SyntaxError }, 'multiline');

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

  t.notThrows(() => c.evaluate(wrap(safe)), 'safe');
  t.notThrows(() => c.evaluate(wrap(safe2)), 'safe2');
  t.notThrows(() => c.evaluate(wrap(safe3)), 'safe3');
  t.throws(() => c.evaluate(wrap(obvious)), { instanceOf: SyntaxError }, 'obvious');
  t.throws(() => c.evaluate(wrap(whitespace)), { instanceOf: SyntaxError }, 'whitespace');
  t.throws(() => c.evaluate(wrap(comment)), { instanceOf: SyntaxError }, 'comment');
  t.throws(
    () => c.evaluate(wrap(doubleSlashComment)),
    { instanceOf: SyntaxError },
    'doubleSlashComment',
  );
  t.throws(() => c.evaluate(wrap(newline)), { instanceOf: SyntaxError }, 'newline');
  t.throws(() => c.evaluate(wrap(multiline)), { instanceOf: SyntaxError }, 'multiline');

  sinon.restore();
});
