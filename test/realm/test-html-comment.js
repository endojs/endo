import test from 'tape';
import Evaluator from '../../src/evaluator';
import { rejectHtmlComments } from '../../src/transforms';

// We break up the following literal strings so that an apparent html
// comment does not appear in this file. Thus, we avoid rejection by
// the overly eager rejectDangerousSources.

const htmlOpenComment1 = `const a = foo ${'<'}!-- hah
('evil')`;

const htmlCloseComment1 = `const a = foo --${'>'} hah
('evil')`;

const htmlOpenComment2 = `const a = eval ${'<'}!-- hah
('evil')`;

const htmlCloseComment2 = `const a = eval --${'>'} hah
('evil')`;

const htmlOpenComment3 = `const a = import ${'<'}!-- hah
('evil')`;

const htmlCloseComment3 = `const a = import --${'>'} hah
('evil')`;

test('no-html-comment-expression regexp', t => {
  t.throws(
    () => rejectHtmlComments(htmlOpenComment1),
    SyntaxError,
    'htmlOpenComment'
  );

  t.throws(
    () => rejectHtmlComments(htmlCloseComment1),
    SyntaxError,
    'htmlCloseComment'
  );

  t.throws(
    () => rejectHtmlComments(htmlOpenComment2),
    SyntaxError,
    'htmlOpenComment'
  );

  t.throws(
    () => rejectHtmlComments(htmlCloseComment2),
    SyntaxError,
    'htmlCloseComment'
  );

  t.throws(
    () => rejectHtmlComments(htmlOpenComment3),
    SyntaxError,
    'htmlOpenComment'
  );

  t.throws(
    () => rejectHtmlComments(htmlCloseComment3),
    SyntaxError,
    'htmlCloseComment'
  );

  t.end();
});

test('reject html comment expressions in evaluate', t => {
  const r = new Evaluator();

  function wrap(s) {
    return `
      function name() {
        ${s};
        return a;
      }`;
  }

  t.throws(
    () => r.evaluate(wrap(htmlOpenComment1)),
    SyntaxError,
    'htmlOpenComment'
  );
  t.throws(
    () => r.evaluate(wrap(htmlCloseComment1)),
    SyntaxError,
    'htmlCloseComment'
  );

  t.throws(
    () => r.evaluate(wrap(htmlOpenComment2)),
    SyntaxError,
    'htmlOpenComment'
  );
  t.throws(
    () => r.evaluate(wrap(htmlCloseComment2)),
    SyntaxError,
    'htmlCloseComment'
  );

  t.throws(
    () => r.evaluate(wrap(htmlOpenComment3)),
    SyntaxError,
    'htmlOpenComment'
  );
  t.throws(
    () => r.evaluate(wrap(htmlCloseComment3)),
    SyntaxError,
    'htmlCloseComment'
  );

  t.end();
});

test('reject html comment expressions in Function', t => {
  const r = new Evaluator();

  function wrap(s) {
    return `new Function("${s}; return a;")`;
  }

  t.throws(
    () => r.evaluate(wrap(htmlOpenComment1)),
    SyntaxError,
    'htmlOpenComment'
  );
  t.throws(
    () => r.evaluate(wrap(htmlCloseComment1)),
    SyntaxError,
    'htmlCloseComment'
  );

  t.throws(
    () => r.evaluate(wrap(htmlOpenComment2)),
    SyntaxError,
    'htmlOpenComment'
  );
  t.throws(
    () => r.evaluate(wrap(htmlCloseComment2)),
    SyntaxError,
    'htmlCloseComment'
  );

  t.throws(
    () => r.evaluate(wrap(htmlOpenComment3)),
    SyntaxError,
    'htmlOpenComment'
  );
  t.throws(
    () => r.evaluate(wrap(htmlCloseComment3)),
    SyntaxError,
    'htmlCloseComment'
  );

  t.end();
});
