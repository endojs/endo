// @ts-check
/**
 * Unit tests for the Fae `edit` tool maker (`makeEditTool`), the node-fs side
 * of the endopi-edit-tool design. The exact-string-replacement algorithm is
 * exercised exhaustively in `@endo/agentry`'s edit-text tests; here we verify
 * the tool wiring: schema shape, single and batched edits against a real file,
 * the returned diff, and error propagation.
 */

import '@endo/init/debug.js';

import test from 'ava';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { makeEditTool } from '../src/tool-makers.js';

/** Create a fresh temp dir with a file, returning { cwd, name, write, read }. */
const makeFixture = (name, contents) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fae-edit-'));
  fs.writeFileSync(path.join(cwd, name), contents, 'utf-8');
  return {
    cwd,
    read: () => fs.readFileSync(path.join(cwd, name), 'utf-8'),
  };
};

test('schema advertises the edit tool with oldText/newText and batching', t => {
  const tool = makeEditTool('/tmp');
  const schema = tool.schema();
  t.is(schema.function.name, 'edit');
  const { properties, required } = schema.function.parameters;
  t.deepEqual(required, ['filePath']);
  t.truthy(properties.oldText);
  t.truthy(properties.newText);
  t.is(properties.edits.type, 'array');
});

test('single edit rewrites the file and returns a diff', async t => {
  const { cwd, read } = makeFixture('a.txt', 'hello world\n');
  const tool = makeEditTool(cwd);
  const result = await tool.execute({
    filePath: 'a.txt',
    oldText: 'world',
    newText: 'there',
  });
  t.is(read(), 'hello there\n');
  t.regex(result, /Applied 1 edit to a\.txt/);
  t.regex(result, /^-hello world$/m);
  t.regex(result, /^\+hello there$/m);
});

test('batched edits apply in one call', async t => {
  const { cwd, read } = makeFixture('code.js', 'const a = 1;\nconst b = 2;\n');
  const tool = makeEditTool(cwd);
  const result = await tool.execute({
    filePath: 'code.js',
    edits: [
      { oldText: 'a = 1', newText: 'a = 10' },
      { oldText: 'b = 2', newText: 'b = 20' },
    ],
  });
  t.is(read(), 'const a = 10;\nconst b = 20;\n');
  t.regex(result, /Applied 2 edits to code\.js/);
});

test('a non-unique oldText fails without mutating the file', async t => {
  const { cwd, read } = makeFixture('dup.txt', 'x\nx\n');
  const tool = makeEditTool(cwd);
  await t.throwsAsync(
    () => tool.execute({ filePath: 'dup.txt', oldText: 'x', newText: 'y' }),
    { message: /matches 2 locations/ },
  );
  t.is(read(), 'x\nx\n');
});

test('missing filePath is rejected', async t => {
  const tool = makeEditTool('/tmp');
  await t.throwsAsync(() => tool.execute({ oldText: 'a', newText: 'b' }), {
    message: /filePath is required/,
  });
});

test('neither edits nor oldText/newText is rejected', async t => {
  const { cwd } = makeFixture('a.txt', 'hi\n');
  const tool = makeEditTool(cwd);
  await t.throwsAsync(() => tool.execute({ filePath: 'a.txt' }), {
    message: /either an .edits. array/,
  });
});
