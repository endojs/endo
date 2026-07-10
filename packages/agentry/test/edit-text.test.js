// @ts-check
/**
 * Unit tests for the pure edit-by-replacement algorithm
 * (`@endo/agentry/edit-text`), which backs the `edit` tool added to the Lal
 * and Fae agents per designs/endopi-edit-tool.md.
 */

import test from '@endo/ses-ava/prepare-endo.js';

import {
  applyEdits,
  normalizeEdits,
  computeUnifiedDiff,
} from '../src/edit-text.js';

test('single edit replaces the unique match', t => {
  const { content, applied } = applyEdits('hello world\n', [
    { oldText: 'world', newText: 'there' },
  ]);
  t.is(content, 'hello there\n');
  t.is(applied, 1);
});

test('multi-edit batching applies every edit', t => {
  const original = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
  const { content, applied } = applyEdits(original, [
    { oldText: 'a = 1', newText: 'a = 10' },
    { oldText: 'c = 3', newText: 'c = 30' },
  ]);
  t.is(content, 'const a = 10;\nconst b = 2;\nconst c = 30;\n');
  t.is(applied, 2);
});

test('order of edits in the batch does not matter', t => {
  const original = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
  const forward = applyEdits(original, [
    { oldText: 'a = 1', newText: 'a = 10' },
    { oldText: 'c = 3', newText: 'c = 30' },
  ]);
  const reverse = applyEdits(original, [
    { oldText: 'c = 3', newText: 'c = 30' },
    { oldText: 'a = 1', newText: 'a = 10' },
  ]);
  t.is(forward.content, reverse.content);
});

test('a not-found oldText is a structured error', t => {
  t.throws(() => applyEdits('hello\n', [{ oldText: 'nope', newText: 'x' }]), {
    message: /not found/,
  });
});

test('a non-unique oldText is a structured error', t => {
  t.throws(
    () => applyEdits('foo\nfoo\n', [{ oldText: 'foo', newText: 'bar' }]),
    { message: /matches 2 locations/ },
  );
});

test('disambiguating context makes a non-unique match unique', t => {
  const { content } = applyEdits('foo\nfoo bar\n', [
    { oldText: 'foo bar', newText: 'baz bar' },
  ]);
  t.is(content, 'foo\nbaz bar\n');
});

test('overlapping edits are rejected', t => {
  t.throws(
    () =>
      applyEdits('abcdef\n', [
        { oldText: 'abcd', newText: 'X' },
        { oldText: 'cdef', newText: 'Y' },
      ]),
    { message: /overlap/ },
  );
});

test('duplicate oldText across two edits overlaps and is rejected', t => {
  t.throws(
    () =>
      applyEdits('once\n', [
        { oldText: 'once', newText: 'a' },
        { oldText: 'once', newText: 'b' },
      ]),
    { message: /overlap/ },
  );
});

test('an empty oldText is rejected', t => {
  t.throws(() => applyEdits('x\n', [{ oldText: '', newText: 'y' }]), {
    message: /non-empty/,
  });
});

test('CRLF line endings are preserved', t => {
  const original = 'line one\r\nline two\r\n';
  const { content } = applyEdits(original, [
    { oldText: 'line two', newText: 'line 2' },
  ]);
  t.is(content, 'line one\r\nline 2\r\n');
});

test('newText with LF is expanded to the file CRLF ending', t => {
  const original = 'a\r\nb\r\n';
  const { content } = applyEdits(original, [{ oldText: 'a', newText: 'a\nx' }]);
  t.is(content, 'a\r\nx\r\nb\r\n');
});

test('a leading BOM is preserved', t => {
  const original = '\uFEFFhello\n';
  const { content } = applyEdits(original, [
    { oldText: 'hello', newText: 'bye' },
  ]);
  t.is(content, '\uFEFFbye\n');
});

test('oldText matching across a CRLF boundary works via LF normalization', t => {
  const original = 'a\r\nb\r\nc\r\n';
  const { content } = applyEdits(original, [
    { oldText: 'a\nb', newText: 'a\nB' },
  ]);
  t.is(content, 'a\r\nB\r\nc\r\n');
});

test('the result carries a unified diff of the change', t => {
  const { diff } = applyEdits('one\ntwo\nthree\n', [
    { oldText: 'two', newText: 'TWO' },
  ]);
  t.regex(diff, /^--- a\/file/m);
  t.regex(diff, /^\+\+\+ b\/file/m);
  t.regex(diff, /^-two$/m);
  t.regex(diff, /^\+TWO$/m);
  t.regex(diff, /^ one$/m);
});

test('computeUnifiedDiff returns empty string for identical text', t => {
  t.is(computeUnifiedDiff('same\n', 'same\n'), '');
});

test('normalizeEdits accepts a single pair', t => {
  t.deepEqual(normalizeEdits({ oldText: 'a', newText: 'b' }), [
    { oldText: 'a', newText: 'b' },
  ]);
});

test('normalizeEdits prefers the edits array when present', t => {
  const edits = [{ oldText: 'a', newText: 'b' }];
  t.is(normalizeEdits({ edits }), edits);
});

test('normalizeEdits throws when nothing is provided', t => {
  t.throws(() => normalizeEdits({}), { message: /either an .edits. array/ });
});

test('normalizeEdits returns a hardened result', t => {
  t.is(Object.isFrozen(normalizeEdits({ oldText: 'a', newText: 'b' })), true);
  const edits = [{ oldText: 'a', newText: 'b' }];
  normalizeEdits({ edits });
  t.is(Object.isFrozen(edits), true);
});

test('a single pair with an omitted newText is rejected (no silent delete)', t => {
  // normalizeEdits requires both halves of the single-pair shape, so an omitted
  // newText is rejected up front rather than silently deleting oldText.
  t.throws(() => normalizeEdits({ oldText: 'foo' }), {
    message: /to be strings/,
  });
});

test('an explicit empty newText deletes the matched text', t => {
  const { content } = applyEdits(
    'foobar\n',
    normalizeEdits({
      oldText: 'foo',
      newText: '',
    }),
  );
  t.is(content, 'bar\n');
});

test('computeUnifiedDiff renders a pure insertion hunk', t => {
  const diff = computeUnifiedDiff('a\nb\n', 'a\nX\nb\n');
  t.regex(diff, /^@@ -1,2 \+1,3 @@$/m);
  t.regex(diff, /^\+X$/m);
});

test('computeUnifiedDiff renders a pure deletion hunk', t => {
  const diff = computeUnifiedDiff('a\nX\nb\n', 'a\nb\n');
  t.regex(diff, /^@@ -1,3 \+1,2 @@$/m);
  t.regex(diff, /^-X$/m);
});

test('computeUnifiedDiff handles a change at the first line', t => {
  const diff = computeUnifiedDiff('a\nb\nc\n', 'A\nb\nc\n');
  t.regex(diff, /^@@ -1,3 \+1,3 @@$/m);
  t.regex(diff, /^-a$/m);
  t.regex(diff, /^\+A$/m);
});

test('computeUnifiedDiff handles a change at the last line', t => {
  const diff = computeUnifiedDiff('a\nb\nc\n', 'a\nb\nC\n');
  t.regex(diff, /^@@ -1,3 \+1,3 @@$/m);
  t.regex(diff, /^-c$/m);
  t.regex(diff, /^\+C$/m);
});

test('computeUnifiedDiff handles a file with no trailing newline', t => {
  const diff = computeUnifiedDiff('a\nb\nc', 'a\nB\nc');
  t.regex(diff, /^@@ -1,3 \+1,3 @@$/m);
  t.regex(diff, /^-b$/m);
  t.regex(diff, /^\+B$/m);
});

test('computeUnifiedDiff emits two hunks when changes are far apart', t => {
  const before = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no\n';
  const after = 'a\nB\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nN\no\n';
  const diff = computeUnifiedDiff(before, after);
  t.is((diff.match(/^@@ /gm) || []).length, 2);
  t.regex(diff, /^-b$/m);
  t.regex(diff, /^\+B$/m);
  t.regex(diff, /^-n$/m);
  t.regex(diff, /^\+N$/m);
});
