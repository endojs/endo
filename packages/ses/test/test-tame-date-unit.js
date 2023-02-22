import test from 'ava';
import tameDateConstructor from '../src/tame-date-constructor.js';

const { '%InitialDate%': InitialDate, '%SharedDate%': SharedDate } =
  tameDateConstructor();

test('tameDateConstructor - initial constructor without argument', t => {
  t.is(InitialDate.name, 'Date');

  const date = new InitialDate();

  t.truthy(date instanceof InitialDate);
  // eslint-disable-next-line no-proto
  t.is(date.__proto__.constructor, SharedDate);

  t.not(date.toString(), 'Invalid Date');
});

test('tameDateConstructor - shared constructor without argument', t => {
  t.is(SharedDate.name, 'Date');

  const date = new SharedDate();

  t.truthy(date instanceof SharedDate);
  // eslint-disable-next-line no-proto
  t.is(date.__proto__.constructor, SharedDate);

  t.is(date.toString(), 'Invalid Date');
});

test('tameDateConstructor - shared constructor now', t => {
  t.is(SharedDate.now.name, 'now');

  const date = SharedDate.now();

  t.truthy(Number.isNaN(date));
});

test('tameDateConstructor - initial constructor now', t => {
  t.is(InitialDate.now.name, 'now');

  const date = InitialDate.now();

  t.truthy(Number(date) > 1);
});
