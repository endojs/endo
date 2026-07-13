// @ts-check
/**
 * Tests for the `editText` tool added to the Lal agent surface
 * (designs/endopi-edit-tool.md). `editText` reads a text file through a tree
 * capability's `readText`, applies exact-string-replacement edits (shared with
 * Fae via `@endo/agentry/edit-text`), and writes the result back through
 * `writeText`, returning `{ applied, diff }`.
 *
 * The pure replacement algorithm is exercised exhaustively in `@endo/agentry`;
 * here we pin the dispatch wiring: SmallCaps decode + `@endo/patterns`
 * validation of the `edits` array, the read-modify-write through a stub
 * capability, and error propagation on a bad match.
 */

import test from '@endo/ses-ava/prepare-endo.js';

import { makeExecuteTool } from '../tool-dispatch.js';

/**
 * Build a stub powers object whose `lookup` returns a single in-memory tree
 * capability with `readText`/`writeText` over a file map.
 *
 * @param {Record<string, string>} files
 */
const makeStub = files => {
  const store = new Map(Object.entries(files));
  const capability = {
    readText(fileName) {
      if (!store.has(fileName)) {
        return Promise.reject(new Error(`No such file: ${fileName}`));
      }
      return Promise.resolve(store.get(fileName));
    },
    writeText(fileName, content) {
      store.set(fileName, content);
      return Promise.resolve(`wrote ${content.length} chars`);
    },
  };
  const powers = {
    lookup(_petNameOrPath) {
      return Promise.resolve(capability);
    },
  };
  const executeTool = makeExecuteTool(powers);
  /**
   * Invoke a tool as the LLM would, sidestepping the strict `ToolCallArgs`
   * typing (the args arrive as decoded JSON in practice).
   *
   * @param {string} name
   * @param {any} args
   * @returns {Promise<any>}
   */
  const run = (name, args) => executeTool(name, args);
  return { run, read: fileName => store.get(fileName) };
};

test('editText applies a single edit through readText/writeText', async t => {
  const { run, read } = makeStub({ 'a.txt': 'hello world\n' });
  const result = await run('editText', {
    petNameOrPath: 'workspace',
    fileName: 'a.txt',
    edits: [{ oldText: 'world', newText: 'there' }],
  });
  t.is(read('a.txt'), 'hello there\n');
  t.is(result.applied, 1);
  t.regex(result.diff, /^-hello world$/m);
  t.regex(result.diff, /^\+hello there$/m);
});

test('editText applies a batch of edits in one call', async t => {
  const { run, read } = makeStub({
    'code.js': 'const a = 1;\nconst b = 2;\n',
  });
  const result = await run('editText', {
    petNameOrPath: ['dir', 'code.js'],
    fileName: 'code.js',
    edits: [
      { oldText: 'a = 1', newText: 'a = 10' },
      { oldText: 'b = 2', newText: 'b = 20' },
    ],
  });
  t.is(read('code.js'), 'const a = 10;\nconst b = 20;\n');
  t.is(result.applied, 2);
});

test('editText rejects a non-unique oldText without writing', async t => {
  const { run, read } = makeStub({ 'dup.txt': 'x\nx\n' });
  await t.throwsAsync(
    () =>
      run('editText', {
        petNameOrPath: 'workspace',
        fileName: 'dup.txt',
        edits: [{ oldText: 'x', newText: 'y' }],
      }),
    { message: /matches 2 locations/ },
  );
  t.is(read('dup.txt'), 'x\nx\n');
});

test('editText validates that edits is an array of oldText/newText records', async t => {
  const { run } = makeStub({ 'a.txt': 'hi\n' });
  await t.throwsAsync(
    () =>
      run('editText', {
        petNameOrPath: 'workspace',
        fileName: 'a.txt',
        edits: [{ oldText: 'hi' }],
      }),
    { message: /editText args/ },
  );
});
