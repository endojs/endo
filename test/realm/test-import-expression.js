import test from 'tape';
import Evaluator from '../../src/evaluator';
import { rejectImportExpressions } from '../../src/transforms';

function codepointIsSyntacticWhitespace(i) {
  const c = String.fromCodePoint(i);
  const f = `let a = 1; (a === ${c}a${c})`;
  try {
    return eval(f); // true means whitespace, false means non-whitespace
  } catch (e) {
    return false; // exception means non-whitespace
  }
}

function codepointIsRegExpWhitespace(i) {
  return /\s/m.test(String.fromCodePoint(i));
}

test('whitespace codepoints', t => {
  // this takes about 35s to run on my laptop, and only tells us about the
  // platform (not the shim code), so it's disabled
  return t.end();
  // eslint-disable-next-line no-unreachable
  const failures = [];
  const maxCodepoint = 0x10ffff + 1;
  for (let i = 0; i < maxCodepoint; i++) {
    if (i % 1024 === 0) {
      // eslint-disable-next-line no-console
      console.log(`U+${i.toString(16)}`);
    }
    const s = codepointIsSyntacticWhitespace(i);
    const r = codepointIsRegExpWhitespace(i);
    if (s !== r) {
      // eslint-disable-next-line no-console
      console.log(`codepoint 0x${i.toString(16)}: syntax ${s}, regexp ${r}`);
      failures.push(i);
    }
  }
  t.equal(failures.length, 0);
  t.end();
});

const safe = `const a = 1`;

const safe2 = `const a = notimport('evil')`;

const safe3 = `const a = importnot('evil')`;

const obvious = `const a = import('evil')`;

const whitespace = `const a = import ('evil')`;

const comment = `const a = import/*hah*/('evil')`;

const doubleSlashComment = `const a = import // hah
('evil')`;

// We break up the following literal strings so that an apparent html
// comment does not appear in this file. Thus, we avoid rejection by
// the overly eager rejectDangerousSources.

const newline = `const a = import
('evil')`;

const multiline = `
import('a')
import('b')`;

test('no-import-expression regexp', t => {
  // note: we cannot define these as regular functions (and then stringify)
  // because the 'esm' module loader that we use for running the tests (i.e.
  // 'tape -r esm ./shim/test/**/*.js') sees the 'import' statements and
  // rewrites them.

  t.equal(rejectImportExpressions(safe), safe, 'safe');
  t.equal(rejectImportExpressions(safe2), safe2, 'safe2');
  t.equal(rejectImportExpressions(safe3), safe3, 'safe3');
  t.throws(() => rejectImportExpressions(obvious), SyntaxError, 'obvious');
  t.throws(
    () => rejectImportExpressions(whitespace),
    SyntaxError,
    'whitespace'
  );
  t.throws(() => rejectImportExpressions(comment), SyntaxError, 'comment');
  t.throws(
    () => rejectImportExpressions(doubleSlashComment),
    SyntaxError,
    'doubleSlashComment'
  );
  t.throws(() => rejectImportExpressions(newline), SyntaxError, 'newline');
  t.throws(
    () => rejectImportExpressions(multiline),
    /SyntaxError: possible import expression rejected around line 2/,
    'multiline'
  );

  // mentioning import() in a comment *should* be safe, but requires a full
  // parser to check, and a cheap regexp test will conservatively reject it.
  // So we don't assert that behavior one way or the other

  t.end();
});

test('reject import expressions in evaluate', t => {
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

test('reject import expressions in Function', t => {
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
