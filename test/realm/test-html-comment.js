import test from 'tape';
import Realm from '../../src/realm';
import { rejectDangerousSources } from '../../src/sourceParser';

// We break up the following literal strings so that an apparent html
// comment does not appear in this file. Thus, we avoid rejection by
// the overly eager rejectDangerousSources.

const htmlOpenComment = `const a = foo ${'<'}!-- hah
('evil')`;

const htmlCloseComment = `const a = foo --${'>'} hah
('evil')`;

test('no-html-comment-expression regexp', t => {
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

  t.end();
});

test('reject html comment expressions in evaluate', t => {
  const r = Realm.makeRootRealm();

  function wrap(s) {
    return `
      function name() {
        ${s};
        return a;
      }`;
  }

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

  t.end();
});

test('reject html comment expressions in Function', t => {
  const r = Realm.makeRootRealm();

  function wrap(s) {
    return `new Function("${s}; return a;")`;
  }

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

  t.end();
});
