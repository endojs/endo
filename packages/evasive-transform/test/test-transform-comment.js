import { test } from './prepare-test-env-ava.js';
import { transformComment } from '../src/transform-comment.js';

test('transformComment() - Node type becomes CommentBlock', async t => {
  const comment = /** @type {import('@babel/types').Comment} */ ({
    value: 'hello world',
  });
  transformComment(comment);
  t.is(comment.type, 'CommentBlock');
});

test('transformComment() - strip extraneous leading whitespace', async t => {
  const comment = /** @type {import('@babel/types').Comment} */ ({
    type: 'CommentBlock',
    value: '  hello  world  ',
  });
  transformComment(comment);
  t.is(comment.value, ' hello  world  ');
});

test('transformComment() - defang HTML comment', async t => {
  const comment = /** @type {import('@babel/types').Comment} */ ({
    type: 'CommentBlock',
    value: '<!-- evil code -->',
  });
  transformComment(comment);
  t.is(comment.value, '<!=- evil code -=>');
});

test('transformComment() - rewrite suspicious import(...)', async t => {
  const comment = /** @type {import('@babel/types').Comment} */ ({
    type: 'CommentBlock',
    value: `/**
 * @type {import('c:\\My Documents\\user.js')} 
 */`,
  });
  transformComment(comment);
  t.regex(
    comment.value,
    new RegExp("\\* @type \\{IMPORT\\('c:\\\\My Documents\\\\user\\.js'\\)"),
  );
});

test('transformComment() - rewrite end-of-comment marker', async t => {
  const comment = /** @type {import('@babel/types').Comment} */ ({
    type: 'CommentBlock',
    value: '/** I like turtles */',
  });
  transformComment(comment);
  t.is(comment.value, '/** I like turtles *X/');
});
