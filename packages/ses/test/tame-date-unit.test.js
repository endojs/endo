import tap from 'tap';
import tameDateConstructor from '../src/tame-date-constructor.js';

const { test } = tap;

const {
  '%InitialDate%': InitialDate,
  '%SharedDate%': SharedDate,
} = tameDateConstructor();

test('tameDateConstructor - initial constructor without argument', t => {
  t.equal(InitialDate.name, 'Date');

  const date = new InitialDate();

  t.ok(date instanceof InitialDate);
  // eslint-disable-next-line no-proto
  t.equal(date.__proto__.constructor, SharedDate);

  t.isNot(date.toString(), 'Invalid Date');

  t.end();
});

test('tameDateConstructor - shared constructor without argument', t => {
  t.equal(SharedDate.name, 'Date');

  const date = new SharedDate();

  t.ok(date instanceof SharedDate);
  // eslint-disable-next-line no-proto
  t.equal(date.__proto__.constructor, SharedDate);

  t.equal(date.toString(), 'Invalid Date');

  t.end();
});

test('tameDateConstructor - shared constructor now', t => {
  t.equal(SharedDate.now.name, 'now');

  const date = SharedDate.now();

  t.ok(Number.isNaN(date));

  t.end();
});

test('tameDateConstructor - initial constructor now', t => {
  t.equal(InitialDate.now.name, 'now');

  const date = InitialDate.now();

  t.ok(date > 1);

  t.end();
});
