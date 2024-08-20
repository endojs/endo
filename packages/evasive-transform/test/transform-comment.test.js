import { test } from './prepare-test-env-ava-fixture.js';
import { evadeComment } from '../src/transform-comment.js';

test('evadeComment() - Node type becomes CommentBlock', async t => {
  const comment = /** @type {import('@babel/types').Comment} */ ({
    value: 'hello world',
  });
  evadeComment(comment);
  t.is(comment.type, 'CommentBlock');
});

test('evadeComment() - strip extraneous leading whitespace', async t => {
  const comment = /** @type {import('@babel/types').Comment} */ ({
    type: 'CommentBlock',
    value: '  hello  world  ',
  });
  evadeComment(comment);
  t.is(comment.value, ' hello  world  ');
});

test('evadeComment() - defang HTML comment', async t => {
  const comment = /** @type {import('@babel/types').Comment} */ ({
    type: 'CommentBlock',
    value: '<!-- evil code -->',
  });
  evadeComment(comment);
  t.is(comment.value, '<!=- evil code -=>');
});

test('evadeComment() - rewrite suspicious import(...)', async t => {
  const comment = /** @type {import('@babel/types').Comment} */ ({
    type: 'CommentBlock',
    value: `/**
 * @type {import('c:\\My Documents\\user.js')}
 */`,
  });
  evadeComment(comment);
  t.regex(
    comment.value,
    new RegExp("\\* @type \\{IMPORT\\('c:\\\\My Documents\\\\user\\.js'\\)"),
  );
});

test('evadeComment() - rewrite end-of-comment marker', async t => {
  const comment = /** @type {import('@babel/types').Comment} */ ({
    type: 'CommentBlock',
    value: '/** I like turtles */',
  });
  evadeComment(comment);
  t.is(comment.value, '/** I like turtles *X/');
});
