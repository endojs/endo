import test from '@endo/ses-ava/prepare-endo.js';
import { sanitizeSourceUrl } from '../src/sanitize-source-url.js';

const LINE_TERMINATOR = /[\n\r\u2028\u2029]/;

test('sanitizeSourceUrl returns the serialized href of a valid URL', t => {
  const url = 'file:///path/to/module.js';
  t.is(sanitizeSourceUrl(url), url);
});

test('sanitizeSourceUrl returns undefined for a non-URL value', t => {
  t.is(sanitizeSourceUrl('./not-a-url.js'), undefined);
});

test('sanitizeSourceUrl neutralizes comment-escaping line terminators', t => {
  // Each of these parses as a "valid" URL, but the raw input contains a line
  // terminator that would let its tail escape the `//# sourceURL=` comment and
  // become executable code. The serialized href must strip/encode it.
  for (const terminator of ['\n', '\r', '\u2028', '\u2029']) {
    const result = sanitizeSourceUrl(`http://x/${terminator}});evil()//`);
    t.true(
      typeof result === 'string' && !LINE_TERMINATOR.test(result),
      `expected line terminator ${JSON.stringify(terminator)} to be neutralized, got ${JSON.stringify(result)}`,
    );
  }
});
