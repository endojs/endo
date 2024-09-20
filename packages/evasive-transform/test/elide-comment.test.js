import { test } from './_prepare-test-env-ava-fixture.js';
import { elideComment } from '../src/transform-comment.js';
import { evadeCensorSync } from '../src/index.js';

test('elideComment preserves the column width of the last and only line of a block comment', t => {
  const comment = /** @type {import('@babel/types').Comment} */ ({
    type: 'CommentBlock',
    value: '  hello  world  ',
  });
  elideComment(comment);
  t.is(comment.value, '                ');
});

test('elideComment erases non-final lines but preserves all newlines in a block comment', t => {
  const comment = /** @type {import('@babel/types').Comment} */ ({
    type: 'CommentBlock',
    value: ' * some\n * unnecessary information \n * the end',
  });
  elideComment(comment);
  t.is(comment.value, '\n\n          ');
});

test('elideComment unconditionally elides line comments', t => {
  const comment = /** @type {import('@babel/types').Comment} */ ({
    type: 'CommentLine',
    value: ' hello',
  });
  elideComment(comment);
  t.is(comment.value, '');
});

test('evadeCensor with elideComments erases the interior of block comments', t => {
  const object = evadeCensorSync(
    `/**
      * Comment
      * @param {type} name
      */`,
    { elideComments: true },
  );
  t.is(
    object.code,
    `/*


      */`,
  );
});

test('evadeCensor with elideComments elides line comments', t => {
  const object = evadeCensorSync(`// hello`, { elideComments: true });
  t.is(object.code, `//`);
});

test('evadeCensor with elideComments preserves bang comments', t => {
  const object = evadeCensorSync(`/*! kris wuz here */`, {
    elideComments: true,
  });
  t.is(object.code, `/*! kris wuz here */`);
});

test('evadeCensor with elideComments preserves jsdoc @preserve comments', t => {
  const comment = `/**
   * @preserve
   */`;
  const object = evadeCensorSync(comment, {
    elideComments: true,
  });
  t.is(object.code, comment);
});

test('evadeCensor with elideComments preserves initial jsdoc @preserve comments', t => {
  const comment = `/** @preserve
   */`;
  const object = evadeCensorSync(comment, {
    elideComments: true,
  });
  t.is(object.code, comment);
});

test('evadeCensor with elideComments preserves artless-but-valid jsdoc @preserve comments', t => {
  const comment = `/**
   @preserve
  */`;
  const object = evadeCensorSync(comment, {
    elideComments: true,
  });
  t.is(object.code, comment);
});

test('evadeCensor with elideComments preserves jsdoc @copyright comments', t => {
  const comment = `/**
   * @copyright
   */`;
  const object = evadeCensorSync(comment, {
    elideComments: true,
  });
  t.is(object.code, comment);
});

test('evadeCensor with elideComments preserves jsdoc @license comments', t => {
  const comment = `/**
   * @license
   */`;
  const object = evadeCensorSync(comment, {
    elideComments: true,
  });
  t.is(object.code, comment);
});

test('evadeCensor with elideComments preserves jsdoc @cc_on comments', t => {
  const comment = `/**
   * @cc_on
   */`;
  const object = evadeCensorSync(comment, {
    elideComments: true,
  });
  t.is(object.code, comment);
});

test('evadeCensor with elideComments does not preserve jsdoc @copyrighteous comments', t => {
  const comment = `/**
   * @copyrighteous
   */`;
  const object = evadeCensorSync(comment, {
    elideComments: true,
  });
  t.is(
    object.code,
    `/*

   */`,
  );
});

/* eslint-disable no-eval */

test('evadeCensor with elideComments preserves automatically-inserted-semicolon (ASI)', t => {
  const comment = `
    (() => {
      return /*
      */ 42;
    })();
  `;
  const object = evadeCensorSync(comment, {
    elideComments: true,
  });
  t.is((0, eval)(comment), undefined);
  t.is((0, eval)(object.code), undefined);
});

test('evadeCensor with stripComments preserves automatically-inserted-semicolon (ASI)', t => {
  t.log(
    'There is no stripComments option. This is a trip-fall in case this is attempted.',
  );
  const comment = `
    (() => {
      return /*
      */ 42;
    })();
  `;
  const object = evadeCensorSync(comment, {
    stripComments: true,
  });
  t.is((0, eval)(comment), undefined);
  t.is((0, eval)(object.code), undefined);
});

/* eslint-enable no-eval */
