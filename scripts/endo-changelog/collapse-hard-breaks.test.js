import test from 'ava';
import { collapseHardBreaks } from './collapse-hard-breaks.js';

// The exact body of .changeset/hardened-text-codecs.md (after front matter).
// Three paragraphs, the second and third containing hard-wrapped lines.
const EXAMPLE_SUMMARY = `\
Permit \`TextEncoder\` and \`TextDecoder\` as universal intrinsics.

\`TextEncoder\` and \`TextDecoder\` are pure transformations between \`string\` and
\`Uint8Array\` with no static side channels, so they are now permitted on every
compartment (start compartment and every compartment created after lockdown,
identity-equal). Their prototypes are frozen alongside the other tamed
primordials. On hosts that do not provide them (XS), lockdown proceeds without
them and compartments observe their absence as before.

Code that monkey-patches \`TextEncoder.prototype\` or \`TextDecoder.prototype\`
after \`lockdown()\` will now throw, because the prototypes are frozen. Such
mutations must happen before lockdown, the same rule that already applies to
every other intrinsic.`;

// Three flowing paragraphs joined by a single blank line each (5 lines total).
const EXAMPLE_EXPECTED = [
  'Permit `TextEncoder` and `TextDecoder` as universal intrinsics.',
  '',
  '`TextEncoder` and `TextDecoder` are pure transformations between `string` and `Uint8Array` with no static side channels, so they are now permitted on every compartment (start compartment and every compartment created after lockdown, identity-equal). Their prototypes are frozen alongside the other tamed primordials. On hosts that do not provide them (XS), lockdown proceeds without them and compartments observe their absence as before.',
  '',
  'Code that monkey-patches `TextEncoder.prototype` or `TextDecoder.prototype` after `lockdown()` will now throw, because the prototypes are frozen. Such mutations must happen before lockdown, the same rule that already applies to every other intrinsic.',
].join('\n');

test('example changeset body: hard-wrapped paragraphs collapse to flowing lines', t => {
  t.is(collapseHardBreaks(EXAMPLE_SUMMARY), EXAMPLE_EXPECTED);
});

test('single hard linebreak becomes a space', t => {
  t.is(collapseHardBreaks('foo\nbar'), 'foo bar');
});

test('double newline (paragraph break) is preserved', t => {
  t.is(collapseHardBreaks('foo\n\nbar'), 'foo\n\nbar');
});

test('three or more consecutive newlines collapse to one blank line', t => {
  t.is(collapseHardBreaks('foo\n\n\nbar'), 'foo\n\nbar');
  t.is(collapseHardBreaks('foo\n\n\n\n\nbar'), 'foo\n\nbar');
});

test('leading and trailing whitespace is trimmed from the result', t => {
  t.is(collapseHardBreaks('  hello world  '), 'hello world');
  t.is(collapseHardBreaks('\nhello world\n'), 'hello world');
});

test('single paragraph with no linebreaks is returned unchanged', t => {
  t.is(collapseHardBreaks('just one line'), 'just one line');
});

test('CRLF line endings are treated the same as LF', t => {
  t.is(collapseHardBreaks('foo\r\nbar'), 'foo bar');
  t.is(collapseHardBreaks('foo\r\n\r\nbar'), 'foo\n\nbar');
});

test('soft-wrapped lines with surrounding whitespace collapse to a single space', t => {
  t.is(collapseHardBreaks(' foo \n bar '), 'foo bar');
});

// --- Structural preservation (the reason we parse markdown instead of
// line-scanning). These use property assertions rather than exact strings so
// they are robust to cosmetic serializer differences (bullet char, padding),
// which the downstream prettier pass normalizes anyway.

test('fenced code blocks are left completely intact', t => {
  const summary = 'Example:\n\n```js\nconst a = 1;\n\nconst b = 2;\n```';
  const result = collapseHardBreaks(summary);
  // The code fence and both statements survive, and the blank line *inside*
  // the block is preserved rather than being treated as a paragraph break.
  t.true(result.includes('```js\nconst a = 1;\n\nconst b = 2;\n```'));
  // The naive implementation welded the fence onto the code; ensure it didn't.
  t.false(result.includes('```js const a = 1;'));
});

test('list items stay separate; a hard-wrapped item is reflowed', t => {
  const summary =
    'Changes:\n\n- first item\n- second wrapped\n  onto two lines\n- third item';
  const result = collapseHardBreaks(summary);
  // Items are not merged into a single line (the naive failure mode).
  t.false(result.includes('- first item - second'));
  // The wrapped item is reflowed onto one line.
  t.true(result.includes('second wrapped onto two lines'));
  // Three distinct bullet lines remain.
  const bulletLines = result.split('\n').filter(line => /^- /.test(line));
  t.is(bulletLines.length, 3);
});

test('blockquotes keep their marker; soft breaks within a quote become spaces', t => {
  const summary = '> quoted line one\n> quoted line two';
  const result = collapseHardBreaks(summary);
  t.regex(result, /^>/m);
  t.true(result.includes('quoted line one quoted line two'));
});

test('GFM tables survive with rows intact', t => {
  const summary = 'Results:\n\n| col a | col b |\n| ----- | ----- |\n| 1 | 2 |';
  const result = collapseHardBreaks(summary);
  const rowLines = result
    .split('\n')
    .filter(line => line.trim().startsWith('|'));
  // header, delimiter, and one data row => three pipe-delimited lines.
  t.is(rowLines.length, 3);
  t.true(result.includes('col a'));
  t.true(result.includes('col b'));
});

test('inline code spans are not altered', t => {
  t.is(
    collapseHardBreaks('Use `Object.freeze()`\nto tame it.'),
    'Use `Object.freeze()` to tame it.',
  );
});
