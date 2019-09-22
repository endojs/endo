import test from 'tape';
import Evaluator from '../../src/evaluator';
import { rejectSomeDirectEvalExpressions } from '../../src/transforms';

const safe = `const a = 1`;

const safe2 = `const a = noteval('evil')`;

const safe3 = `const a = evalnot('evil')`;

// This is actually direct eval syntax which ideally we would
// reject. However, it escapes our regexp, which we allow because
// accepting it is a future compat issue, not a security issue.
const bogus = `const a = (eval)('evil')`;

const obvious = `const a = eval('evil')`;

const whitespace = `const a = eval ('evil')`;

const comment = `const a = eval/*hah*/('evil')`;

const doubleSlashComment = `const a = eval // hah
('evil')`;

// We break up the following literal strings so that an apparent html
// comment does not appear in this file. Thus, we avoid rejection by
// the overly eager rejectDangerousSources.

const newline = `const a = eval
('evil')`;

const multiline = `
eval('a')
eval('b')`;

test('no-eval-expression regexp', t => {
  t.equal(rejectSomeDirectEvalExpressions(safe), safe, 'safe');
  t.equal(rejectSomeDirectEvalExpressions(safe2), safe2, 'safe2');
  t.equal(rejectSomeDirectEvalExpressions(safe3), safe3, 'safe3');
  t.equal(rejectSomeDirectEvalExpressions(bogus), bogus, 'bogus');
  t.throws(
    () => rejectSomeDirectEvalExpressions(obvious),
    SyntaxError,
    'obvious'
  );
  t.throws(
    () => rejectSomeDirectEvalExpressions(whitespace),
    SyntaxError,
    'whitespace'
  );
  t.throws(
    () => rejectSomeDirectEvalExpressions(comment),
    SyntaxError,
    'comment'
  );
  t.throws(
    () => rejectSomeDirectEvalExpressions(doubleSlashComment),
    SyntaxError,
    'doubleSlashComment'
  );
  // t.throws(
  //   () => rejectSomeDirectEvalExpressions(htmlOpenComment),
  //   SyntaxError,
  //   'htmlOpenComment'
  // );
  // t.throws(
  //   () => rejectSomeDirectEvalExpressions(htmlCloseComment),
  //   SyntaxError,
  //   'htmlCloseComment'
  // );
  t.throws(
    () => rejectSomeDirectEvalExpressions(newline),
    SyntaxError,
    'newline'
  );
  t.throws(
    () => rejectSomeDirectEvalExpressions(multiline),
    /SyntaxError: possible direct eval expression rejected around line 2/,
    'multiline'
  );

  // mentioning eval() in a comment *should* be safe, but requires a full
  // parser to check, and a cheap regexp test will conservatively reject it.
  // So we don't assert that behavior one way or the other

  t.end();
});

test('reject direct eval expressions in evaluate', t => {
  const r = new Evaluator();

  function wrap(s) {
    return `
      function name() {
        ${s};
        return a;
      }`;
  }

  t.equal(r.evaluate(wrap(safe)), undefined, 'safe');
  t.equal(r.evaluate(wrap(safe2)), undefined, 'safe2');
  t.equal(r.evaluate(wrap(safe3)), undefined, 'safe3');
  t.throws(() => r.evaluate(wrap(obvious)), SyntaxError, 'obvious');
  t.throws(() => r.evaluate(wrap(whitespace)), SyntaxError, 'whitespace');
  t.throws(() => r.evaluate(wrap(comment)), SyntaxError, 'comment');
  t.throws(
    () => r.evaluate(wrap(doubleSlashComment)),
    SyntaxError,
    'doubleSlashComment'
  );
  t.throws(() => r.evaluate(wrap(newline)), SyntaxError, 'newline');

  t.end();
});

test('reject direct eval expressions in Function', t => {
  const r = new Evaluator();

  function wrap(s) {
    return `new Function("${s}; return a;")`;
  }

  r.evaluate(wrap(safe));
  r.evaluate(wrap(safe2));
  r.evaluate(wrap(safe3));
  t.throws(() => r.evaluate(wrap(obvious)), SyntaxError, 'obvious');
  t.throws(() => r.evaluate(wrap(whitespace)), SyntaxError, 'whitespace');
  t.throws(() => r.evaluate(wrap(comment)), SyntaxError, 'comment');
  t.throws(
    () => r.evaluate(wrap(doubleSlashComment)),
    SyntaxError,
    'doubleSlashComment'
  );
  t.throws(() => r.evaluate(wrap(newline)), SyntaxError, 'newline');

  t.end();
});
