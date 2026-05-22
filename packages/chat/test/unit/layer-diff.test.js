// @ts-check

import '@endo/init/debug.js';

import test from 'ava';

import { diffLines, buildUnifiedDiffSection } from '../../layer-diff.js';

test('diffLines: two empty bodies → no ops', t => {
  t.deepEqual(diffLines('', ''), []);
});

test('diffLines: all-add when oldText is empty', t => {
  t.deepEqual(diffLines('', 'a\nb'), ['+a', '+b']);
});

test('diffLines: all-remove when newText is empty', t => {
  t.deepEqual(diffLines('a\nb', ''), ['-a', '-b']);
});

test('diffLines: identical bodies are pure context', t => {
  t.deepEqual(diffLines('a\nb\nc', 'a\nb\nc'), [' a', ' b', ' c']);
});

test('diffLines: middle-line edit shows context above and below', t => {
  t.deepEqual(diffLines('a\nb\nc', 'a\nB\nc'), [' a', '-b', '+B', ' c']);
});

test('diffLines: line insertion preserves surrounding context', t => {
  // Insert a new line between `a` and `b`. The LCS walk should
  // keep `a` and `b` as context and `+x` as the lone addition,
  // not `+a +x  b` (which a naive zip would produce).
  t.deepEqual(diffLines('a\nb', 'a\nx\nb'), [' a', '+x', ' b']);
});

test('diffLines: line deletion preserves surrounding context', t => {
  t.deepEqual(diffLines('a\nx\nb', 'a\nb'), [' a', '-x', ' b']);
});

test('buildUnifiedDiffSection: unchanged → comment, not a patch', t => {
  t.is(
    buildUnifiedDiffSection('docs/readme.md', 'same', 'same'),
    '# unchanged: docs/readme.md',
  );
});

test('buildUnifiedDiffSection: header + body for a real change', t => {
  const section = buildUnifiedDiffSection('docs/readme.md', 'old', 'new');
  t.is(section, '--- a/docs/readme.md\n+++ b/docs/readme.md\n-old\n+new');
});
