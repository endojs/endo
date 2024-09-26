import test from 'ava';
import { parseNumber } from '../src/number-parse.js';

test('returns the number when input is a valid numeric string', t => {
  t.is(parseNumber('42'), 42);
  t.is(parseNumber('-40.0'), -40.0);
  t.is(parseNumber('.5'), 0.5);
  t.is(parseNumber('1.337e3'), 1337);
  t.is(parseNumber(' +1 '), 1);
  t.is(parseNumber('0B111'), 7);
  t.is(parseNumber('0o040'), 32);
  t.is(parseNumber('0xf00'), 3840);
  t.is(parseNumber('0xF00'), 3840);
  t.is(parseNumber('   -40.0   '), -40.0);
  // Test for binary, octal and hexadecimal
  t.is(parseNumber('0B111'), 7);
  t.is(parseNumber('0o040'), 32);
  t.is(parseNumber('0xf00'), 3840);
});

test('throws an error when input is not a valid numeric string', t => {
  const badStrings = [
    'f00',
    'F00',
    'NaN',
    'Infinity',
    '-Infinity',
    '7up',
    ' ', // U+1680 OGHAM SPACE MARK (which is whitespace)
    '',
    '   ',
  ];
  for (const bad of badStrings) {
    t.throws(() => parseNumber(bad), { message: `Invalid number: ${bad}` });
  }
});
