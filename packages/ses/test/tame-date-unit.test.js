// @ts-nocheck
import test from 'ava';
import tameDateConstructor from '../src/tame-date-constructor.js';

const { '%InitialDate%': InitialDate, '%SharedDate%': SharedDate } =
  tameDateConstructor();

test('tameDateConstructor - initial constructor without argument', t => {
  t.is(InitialDate.name, 'Date');

  const date = new InitialDate();

  t.truthy(date instanceof InitialDate);
  t.truthy(date instanceof SharedDate);
  // eslint-disable-next-line no-proto
  t.is(date.__proto__.constructor, SharedDate);
  t.is(date.constructor, SharedDate);

  t.not(date.toString(), 'Invalid Date');
});

test('tameDateConstructor - shared constructor without argument', t => {
  t.is(SharedDate.name, 'Date');

  t.throws(() => new SharedDate(), {
    message: /^secure mode/,
  });
});

test('tameDateConstructor - initial constructor called as function', t => {
  const date = InitialDate(undefined);

  t.not(date.toString(), 'Invalid Date');
});

test('tameDateConstructor - shared constructor called as function', t => {
  t.is(SharedDate.name, 'Date');

  t.throws(() => SharedDate(undefined), {
    message: /^secure mode/,
  });
});

test('tameDateConstructor - initial constructor now', t => {
  t.is(InitialDate.now.name, 'now');

  const date = InitialDate.now();

  t.truthy(Number(date) > 1);
});

test('tameDateConstructor - shared constructor now', t => {
  t.is(SharedDate.now.name, 'now');

  t.throws(() => SharedDate.now(), {
    message: /^secure mode/,
  });
});
