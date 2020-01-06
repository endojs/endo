import tap from 'tap';
import sinon from 'sinon';
import Evaluator from '../../src/main.js';
import stubFunctionConstructors from '../stubFunctionConstructors.js';

const { test } = tap;

test('reject direct eval expressions in evaluate', t => {
  t.plan(10);

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

  t.doesNotThrow(() => e.evaluate(wrap(safe)), SyntaxError, 'safe');
  t.doesNotThrow(() => e.evaluate(wrap(safe2)), SyntaxError, 'safe2');
  t.doesNotThrow(() => e.evaluate(wrap(safe3)), SyntaxError, 'safe3');

  t.doesNotThrow(() => e.evaluate(wrap(bogus)), SyntaxError, 'bogus');

  t.throws(() => e.evaluate(wrap(obvious)), SyntaxError, 'obvious');
  t.throws(() => e.evaluate(wrap(whitespace)), SyntaxError, 'whitespace');
  t.throws(() => e.evaluate(wrap(comment)), SyntaxError, 'comment');
  t.throws(
    () => e.evaluate(wrap(doubleSlashComment)),
    SyntaxError,
    'doubleSlashComment',
  );
  t.throws(() => e.evaluate(wrap(newline)), SyntaxError, 'newline');
  t.throws(() => e.evaluate(wrap(multiline)), SyntaxError, 'newline');

  sinon.restore();
});

test('reject direct eval expressions in Function', t => {
  t.plan(10);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const e = new Evaluator();

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

  t.doesNotThrow(() => e.evaluate(wrap(safe)), SyntaxError, 'safe');
  t.doesNotThrow(() => e.evaluate(wrap(safe2)), SyntaxError, 'safe2');
  t.doesNotThrow(() => e.evaluate(wrap(safe3)), SyntaxError, 'safe3');

  t.doesNotThrow(() => e.evaluate(wrap(bogus)), SyntaxError, 'bogus');

  t.throws(() => e.evaluate(wrap(obvious)), SyntaxError, 'obvious');
  t.throws(() => e.evaluate(wrap(whitespace)), SyntaxError, 'whitespace');
  t.throws(() => e.evaluate(wrap(comment)), SyntaxError, 'comment');
  t.throws(
    () => e.evaluate(wrap(doubleSlashComment)),
    SyntaxError,
    'doubleSlashComment',
  );
  t.throws(() => e.evaluate(wrap(newline)), SyntaxError, 'newline');
  t.throws(() => e.evaluate(wrap(multiline)), SyntaxError, 'newline');

  sinon.restore();
});
