import test from 'tape';
import sinon from 'sinon';
import Evaluator from '../../src/evaluator';

test('reject import expressions in evaluate', t => {
  t.plan(9);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e = new Evaluator();

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

  t.doesNotThrow(() => e.evaluateScript(wrap(safe)), SyntaxError, 'safe');
  t.doesNotThrow(() => e.evaluateScript(wrap(safe2)), SyntaxError, 'safe2');
  t.doesNotThrow(() => e.evaluateScript(wrap(safe3)), SyntaxError, 'safe3');
  t.throws(() => e.evaluateScript(wrap(obvious)), SyntaxError, 'obvious');
  t.throws(() => e.evaluateScript(wrap(whitespace)), SyntaxError, 'whitespace');
  t.throws(() => e.evaluateScript(wrap(comment)), SyntaxError, 'comment');
  t.throws(
    () => e.evaluateScript(wrap(doubleSlashComment)),
    SyntaxError,
    'doubleSlashComment',
  );
  t.throws(() => e.evaluateScript(wrap(newline)), SyntaxError, 'newline');
  t.throws(() => e.evaluateScript(wrap(multiline)), SyntaxError, 'multiline');

  sinon.restore();
});

test('reject import expressions in Function', t => {
  t.plan(9);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const e = new Evaluator();

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

  t.doesNotThrow(() => e.evaluateScript(wrap(safe)), SyntaxError, 'safe');
  t.doesNotThrow(() => e.evaluateScript(wrap(safe2)), SyntaxError, 'safe2');
  t.doesNotThrow(() => e.evaluateScript(wrap(safe3)), SyntaxError, 'safe3');
  t.throws(() => e.evaluateScript(wrap(obvious)), SyntaxError, 'obvious');
  t.throws(() => e.evaluateScript(wrap(whitespace)), SyntaxError, 'whitespace');
  t.throws(() => e.evaluateScript(wrap(comment)), SyntaxError, 'comment');
  t.throws(
    () => e.evaluateScript(wrap(doubleSlashComment)),
    SyntaxError,
    'doubleSlashComment',
  );
  t.throws(() => e.evaluateScript(wrap(newline)), SyntaxError, 'newline');
  t.throws(() => e.evaluateScript(wrap(multiline)), SyntaxError, 'multiline');

  sinon.restore();
});
