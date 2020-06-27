import tap from 'tap';
import tameGlobalDateObject from '../src/tame-global-date-object.js';

const { test } = tap;

const {
  start: {
    Date: { value: tamedDate },
  },
  shared: {
    Date: { value: sharedDate },
  },
} = tameGlobalDateObject('safe');

test('tameGlobalDateObject - constructor without argument', t => {
  t.equal(tamedDate.name, 'Date');

  // eslint-disable-next-line new-cap
  const date = new tamedDate();

  t.ok(date instanceof tamedDate);
  // eslint-disable-next-line no-proto
  t.equal(date.__proto__.constructor, sharedDate);

  t.equal(date.toString(), 'Invalid Date');

  t.end();
});

test('tameGlobalDateObject - now', t => {
  t.equal(tamedDate.now.name, 'now');

  const date = tamedDate.now();

  t.ok(Number.isNaN(date));

  t.end();
});
