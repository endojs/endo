import test from 'ava';
import {
  rejectImportExpressions,
  rejectHtmlComments,
  rejectSomeDirectEvalExpressions,
} from '../src/transforms.js';

test('no-import-expression regexp', t => {
  t.plan(14);

  // Note: we cannot define these as regular functions (and then stringify)
  // because the 'esm' module loader that we use for running the tests (i.e.
  // 'tape -r esm ./shim/test/**/*.js') sees the 'import' statements and
  // rewrites them.

  // Mentioning import() in a comment *should* be safe, but requires a full
  // parser to check, and a cheap regexp test will conservatively reject it.
  // So we don't assert that behavior one way or the other

  const safe = 'const a = 1';
  const safe2 = "const a = notimport('evil')";
  const safe3 = "const a = importnot('evil')";
  const safe4 = "const a = compartment.import('name')";

  const obvious = "const a = import('evil')";
  const whitespace = "const a = import ('evil')";
  const comment = "const a = import/*hah*/('evil')";
  const doubleSlashComment = "const a = import // hah\n('evil')";
  const newline = "const a = import\n('evil')";
  const multiline = "\nimport('a')\nimport('b')";
  const spread = "{...import('exfil')}";
  const spread2 = "{... import('exfil')}";
  const spread3 = "{\n...\nimport\n('exfil')}";
  const spread4 = "{\n...\nimport/**/\n('exfil')}";

  t.is(rejectImportExpressions(safe), safe, 'safe');
  t.is(rejectImportExpressions(safe2), safe2, 'safe2');
  t.is(rejectImportExpressions(safe3), safe3, 'safe3');
  t.is(rejectImportExpressions(safe4), safe4, 'safe4');
  t.throws(
    () => rejectImportExpressions(obvious),
    { instanceOf: SyntaxError },
    'obvious',
  );
  t.throws(
    () => rejectImportExpressions(whitespace),
    { instanceOf: SyntaxError },
    'whitespace',
  );
  t.throws(
    () => rejectImportExpressions(comment),
    { instanceOf: SyntaxError },
    'comment',
  );
  t.throws(
    () => rejectImportExpressions(doubleSlashComment),
    { instanceOf: SyntaxError },
    'doubleSlashComment',
  );
  t.throws(
    () => rejectImportExpressions(newline),
    { instanceOf: SyntaxError },
    'newline',
  );
  t.throws(
    () => rejectImportExpressions(multiline),
    { instanceOf: SyntaxError },
    'possible import expression rejected around line 2',
    'multiline',
  );
  t.throws(
    () => rejectImportExpressions(spread),
    { instanceOf: SyntaxError },
    'spread',
  );
  t.throws(
    () => rejectImportExpressions(spread2),
    { instanceOf: SyntaxError },
    'spread2',
  );
  t.throws(
    () => rejectImportExpressions(spread3),
    { instanceOf: SyntaxError },
    'spread3',
  );
  t.throws(
    () => rejectImportExpressions(spread4),
    { instanceOf: SyntaxError },
    'spread4',
  );
});

test('no-html-comment-expression regexp', t => {
  t.plan(6);

  const htmlOpenComment1 = "const a = foo <!-- hah\n('evil')";
  const htmlCloseComment1 = "const a = foo --> hah\n('evil')";
  const htmlOpenComment2 = "const a = eval <!-- hah\n('evil')";
  const htmlCloseComment2 = "const a = eval --> hah\n('evil')";
  const htmlOpenComment3 = "const a = import <!-- hah\n('evil')";
  const htmlCloseComment3 = "const a = import --> hah\n('evil')";

  t.throws(
    () => rejectHtmlComments(htmlOpenComment1),
    { instanceOf: SyntaxError },
    'htmlOpenComment',
  );

  t.throws(
    () => rejectHtmlComments(htmlCloseComment1),
    { instanceOf: SyntaxError },
    'htmlCloseComment',
  );

  t.throws(
    () => rejectHtmlComments(htmlOpenComment2),
    { instanceOf: SyntaxError },
    'htmlOpenComment',
  );

  t.throws(
    () => rejectHtmlComments(htmlCloseComment2),
    { instanceOf: SyntaxError },
    'htmlCloseComment',
  );

  t.throws(
    () => rejectHtmlComments(htmlOpenComment3),
    { instanceOf: SyntaxError },
    'htmlOpenComment',
  );

  t.throws(
    () => rejectHtmlComments(htmlCloseComment3),
    { instanceOf: SyntaxError },
    'htmlCloseComment',
  );
});

test('no-eval-expression regexp', t => {
  t.plan(10);

  const safe = 'const a = 1';
  const safe2 = "const a = noteval('evil')";
  const safe3 = "const a = evalnot('evil')";

  // "bogus" is actually direct eval syntax which ideally we could
  // reject. However, it escapes our regexp, which we allow because
  // accepting it is a future compat issue, not a security issue.
  const bogus = "const a = (eval)('evil')";

  const obvious = "const a = eval('evil')";
  const whitespace = "const a = eval ('evil')";
  const comment = "const a = eval/*hah*/('evil')";
  const doubleSlashComment = "const a = eval // hah\n('evil')";
  const newline = "const a = eval\n('evil')";
  const multiline = "\neval('a')\neval('b')";

  t.is(rejectSomeDirectEvalExpressions(safe), safe, 'safe');
  t.is(rejectSomeDirectEvalExpressions(safe2), safe2, 'safe2');
  t.is(rejectSomeDirectEvalExpressions(safe3), safe3, 'safe3');

  t.is(rejectSomeDirectEvalExpressions(bogus), bogus, 'bogus');

  t.throws(
    () => rejectSomeDirectEvalExpressions(obvious),
    { instanceOf: SyntaxError },
    'obvious',
  );
  t.throws(
    () => rejectSomeDirectEvalExpressions(whitespace),
    { instanceOf: SyntaxError },
    'whitespace',
  );
  t.notThrows(() => rejectSomeDirectEvalExpressions(comment), 'comment');
  t.notThrows(
    () => rejectSomeDirectEvalExpressions(doubleSlashComment),
    'doubleSlashComment',
  );
  // t.throws(
  //   () => rejectSomeDirectEvalExpressions(htmlOpenComment),
  //   { instanceOf: SyntaxError },
  //   'htmlOpenComment'
  // );
  // t.throws(
  //   () => rejectSomeDirectEvalExpressions(htmlCloseComment),
  //   { instanceOf: SyntaxError },
  //   'htmlCloseComment'
  // );
  t.throws(
    () => rejectSomeDirectEvalExpressions(newline),
    { instanceOf: SyntaxError },
    'newline',
  );
  t.throws(
    () => rejectSomeDirectEvalExpressions(multiline),
    { instanceOf: SyntaxError },
    'possible direct eval expression rejected around line 2',
    'multiline',
  );

  // mentioning eval() in a comment *should* be safe, but requires a full
  // parser to check, and a cheap regexp test will conservatively reject it.
  // So we don't assert that behavior one way or the other
});
