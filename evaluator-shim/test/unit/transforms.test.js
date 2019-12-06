import test from 'tape';
import {
  rejectImportExpressions,
  rejectHtmlComments,
  rejectSomeDirectEvalExpressions,
} from '../../src/transforms';

test('no-import-expression regexp', t => {
  t.plan(9);

  // Note: we cannot define these as regular functions (and then stringify)
  // because the 'esm' module loader that we use for running the tests (i.e.
  // 'tape -r esm ./shim/test/**/*.js') sees the 'import' statements and
  // rewrites them.

  // Mentioning import() in a comment *should* be safe, but requires a full
  // parser to check, and a cheap regexp test will conservatively reject it.
  // So we don't assert that behavior one way or the other

  const safe = `const a = 1`;
  const safe2 = `const a = notimport('evil')`;
  const safe3 = `const a = importnot('evil')`;

  const obvious = `const a = import('evil')`;
  const whitespace = `const a = import ('evil')`;
  const comment = `const a = import/*hah*/('evil')`;
  const doubleSlashComment = `const a = import // hah\n('evil')`;
  const newline = `const a = import\n('evil')`;
  const multiline = `\nimport('a')\nimport('b')`;

  t.equal(rejectImportExpressions(safe), safe, 'safe');
  t.equal(rejectImportExpressions(safe2), safe2, 'safe2');
  t.equal(rejectImportExpressions(safe3), safe3, 'safe3');
  t.throws(() => rejectImportExpressions(obvious), SyntaxError, 'obvious');
  t.throws(
    () => rejectImportExpressions(whitespace),
    SyntaxError,
    'whitespace',
  );
  t.throws(() => rejectImportExpressions(comment), SyntaxError, 'comment');
  t.throws(
    () => rejectImportExpressions(doubleSlashComment),
    SyntaxError,
    'doubleSlashComment',
  );
  t.throws(() => rejectImportExpressions(newline), SyntaxError, 'newline');
  t.throws(
    () => rejectImportExpressions(multiline),
    /SyntaxError: possible import expression rejected around line 2/,
    'multiline',
  );
});

test('no-html-comment-expression regexp', t => {
  t.plan(6);

  const htmlOpenComment1 = `const a = foo <!-- hah\n('evil')`;
  const htmlCloseComment1 = `const a = foo --> hah\n('evil')`;
  const htmlOpenComment2 = `const a = eval <!-- hah\n('evil')`;
  const htmlCloseComment2 = `const a = eval --> hah\n('evil')`;
  const htmlOpenComment3 = `const a = import <!-- hah\n('evil')`;
  const htmlCloseComment3 = `const a = import --> hah\n('evil')`;

  t.throws(
    () => rejectHtmlComments(htmlOpenComment1),
    SyntaxError,
    'htmlOpenComment',
  );

  t.throws(
    () => rejectHtmlComments(htmlCloseComment1),
    SyntaxError,
    'htmlCloseComment',
  );

  t.throws(
    () => rejectHtmlComments(htmlOpenComment2),
    SyntaxError,
    'htmlOpenComment',
  );

  t.throws(
    () => rejectHtmlComments(htmlCloseComment2),
    SyntaxError,
    'htmlCloseComment',
  );

  t.throws(
    () => rejectHtmlComments(htmlOpenComment3),
    SyntaxError,
    'htmlOpenComment',
  );

  t.throws(
    () => rejectHtmlComments(htmlCloseComment3),
    SyntaxError,
    'htmlCloseComment',
  );
});

test('no-eval-expression regexp', t => {
  t.plan(10);

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

  t.equal(rejectSomeDirectEvalExpressions(safe), safe, 'safe');
  t.equal(rejectSomeDirectEvalExpressions(safe2), safe2, 'safe2');
  t.equal(rejectSomeDirectEvalExpressions(safe3), safe3, 'safe3');

  t.equal(rejectSomeDirectEvalExpressions(bogus), bogus, 'bogus');

  t.throws(
    () => rejectSomeDirectEvalExpressions(obvious),
    SyntaxError,
    'obvious',
  );
  t.throws(
    () => rejectSomeDirectEvalExpressions(whitespace),
    SyntaxError,
    'whitespace',
  );
  t.throws(
    () => rejectSomeDirectEvalExpressions(comment),
    SyntaxError,
    'comment',
  );
  t.throws(
    () => rejectSomeDirectEvalExpressions(doubleSlashComment),
    SyntaxError,
    'doubleSlashComment',
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
    'newline',
  );
  t.throws(
    () => rejectSomeDirectEvalExpressions(multiline),
    /SyntaxError: possible direct eval expression rejected around line 2/,
    'multiline',
  );

  // mentioning eval() in a comment *should* be safe, but requires a full
  // parser to check, and a cheap regexp test will conservatively reject it.
  // So we don't assert that behavior one way or the other

  t.end();
});
