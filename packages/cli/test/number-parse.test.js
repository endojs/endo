import test from 'ava';
import { parseBigint } from '../src/number-parse.js';

test('returns a bigint when input is a valid integer string', t => {
  t.is(parseBigint('42'), 42n);
  t.is(parseBigint('0'), 0n);
  // eslint-disable-next-line unicorn/numeric-separators-style -- literal must visually match the string argument
  t.is(parseBigint('   9007199254740993   '), 9007199254740993n);
  t.is(
    parseBigint('123456789012345678901234567890'),
    // eslint-disable-next-line unicorn/numeric-separators-style -- literal must visually match the string argument
    123456789012345678901234567890n,
  );
});

test('throws an error when input is not a valid integer string', t => {
  const badStrings = [
    'f00',
    'F00',
    '+1',
    '-1',
    '1.0',
    '01',
    'NaN',
    'Infinity',
    '-Infinity',
    '7up',
    ' ', // U+1680 OGHAM SPACE MARK (which is whitespace)
    '',
    '   ',
  ];
  for (const bad of badStrings) {
    t.throws(() => parseBigint(bad), { message: `Invalid number: ${bad}` });
  }
});
