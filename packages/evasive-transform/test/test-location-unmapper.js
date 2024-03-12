import babelParser from '@babel/parser';
import { makeLocationUnmapper } from '../src/location-unmapper.js';
import { test } from './prepare-test-env-ava-fixture.js';

const { parse: parseBabel } = babelParser;

test('makeLocationUnmapper() - missing source map', async t => {
  // @ts-expect-error - wrong number of args
  await t.throwsAsync(() => makeLocationUnmapper(), {
    message: 'Invalid arguments; expected sourceMap',
  });
});

test('makeLocationUnmapper() - invalid source map', async t => {
  const { source } = t.context;
  const sourceMap = '26 sons and she named them all dave';
  const ast = parseBabel(source, { sourceType: 'module' });

  await t.throwsAsync(() => makeLocationUnmapper(sourceMap, ast), {
    message: /^Invalid source map:/,
  });
});

test('makeLocationUnmapper() - missing AST', async t => {
  const { sourceMap } = t.context;

  // @ts-expect-error - wrong number of args
  await t.throwsAsync(() => makeLocationUnmapper(sourceMap), {
    message: 'Invalid arguments; expected AST ast',
  });
});

test('makeLocationUnmapper() - invalid AST', async t => {
  const { sourceMap } = t.context;
  const ast = {
    loc: null,
  };

  // @ts-expect-error - the AST is invalid, as you may have guessed
  await t.throwsAsync(() => makeLocationUnmapper(sourceMap, ast), {
    message: 'No SourceLocation found in AST',
  });
});

test('makeLocationUnmapper() - success', async t => {
  const { source, sourceMap } = t.context;
  const ast = parseBabel(source, { sourceType: 'module' });
  const unmap = await makeLocationUnmapper(sourceMap, ast);

  t.true(typeof unmap === 'function');
});
