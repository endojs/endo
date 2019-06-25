import test from 'tape';
import Realm from '../../src/realm';
import { rejectDangerousSources } from '../../src/sourceParser';

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

const htmlOpenComment = `const a = eval ${'<'}!-- hah
('evil')`;

const htmlCloseComment = `const a = eval --${'>'} hah
('evil')`;

const newline = `const a = eval
('evil')`;

const multiline = `
eval('a')
eval('b')`;

test('no-eval-expression regexp', t => {
  t.equal(rejectDangerousSources(safe), undefined, 'safe');
  t.equal(rejectDangerousSources(safe2), undefined, 'safe2');
  t.equal(rejectDangerousSources(safe3), undefined, 'safe3');
  t.equal(rejectDangerousSources(bogus), undefined, 'bogus');
  t.throws(() => rejectDangerousSources(obvious), SyntaxError, 'obvious');
  t.throws(() => rejectDangerousSources(whitespace), SyntaxError, 'whitespace');
  t.throws(() => rejectDangerousSources(comment), SyntaxError, 'comment');
  t.throws(
    () => rejectDangerousSources(doubleSlashComment),
    SyntaxError,
    'doubleSlashComment'
  );
  t.throws(
    () => rejectDangerousSources(htmlOpenComment),
    SyntaxError,
    'htmlOpenComment'
  );
  t.throws(
    () => rejectDangerousSources(htmlCloseComment),
    SyntaxError,
    'htmlCloseComment'
  );
  t.throws(() => rejectDangerousSources(newline), SyntaxError, 'newline');
  t.throws(
    () => rejectDangerousSources(multiline),
    /SyntaxError: possible direct eval expression rejected around line 2/,
    'multiline'
  );

  // mentioning eval() in a comment *should* be safe, but requires a full
  // parser to check, and a cheap regexp test will conservatively reject it.
  // So we don't assert that behavior one way or the other

  t.end();
});

test('reject direct eval expressions in evaluate', t => {
  const r = Realm.makeRootRealm();

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
  t.throws(
    () => r.evaluate(wrap(htmlOpenComment)),
    SyntaxError,
    'htmlOpenComment'
  );
  t.throws(
    () => r.evaluate(wrap(htmlCloseComment)),
    SyntaxError,
    'htmlCloseComment'
  );
  t.throws(() => r.evaluate(wrap(newline)), SyntaxError, 'newline');

  t.end();
});

test('reject direct eval expressions in Function', t => {
  const r = Realm.makeRootRealm();

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
  t.throws(
    () => r.evaluate(wrap(htmlOpenComment)),
    SyntaxError,
    'htmlOpenComment'
  );
  t.throws(
    () => r.evaluate(wrap(htmlCloseComment)),
    SyntaxError,
    'htmlCloseComment'
  );
  t.throws(() => r.evaluate(wrap(newline)), SyntaxError, 'newline');

  t.end();
});
