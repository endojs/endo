import tap from 'tap';
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalDateObject from '../src/tame-global-date-object.js';

const { test } = tap;

test('tameGlobalDateObject - constructor without argument', t => {
  t.plan(4);

  const restore = captureGlobals('Date');
  tameGlobalDateObject();

  t.equal(Date.name, 'Date');

  const date = new Date();

  t.ok(date instanceof Date);
  // eslint-disable-next-line no-proto
  t.equal(date.__proto__.constructor, Date);

  t.equal(date.toString(), 'Invalid Date');

  restore();
});

test('tameGlobalDateObject - now', t => {
  t.plan(2);

  const restore = captureGlobals('Date');
  tameGlobalDateObject();

  t.equal(Date.now.name, 'now');

  const date = Date.now();

  t.ok(Number.isNaN(date));

  restore();
});

test('tameGlobalObject - toLocaleString', t => {
  t.plan(4);

  const restore = captureGlobals('Error');
  tameGlobalDateObject();

  t.equal(Date.prototype.toLocaleString.name, 'toLocaleString');
  t.equal(Object.prototype.toLocaleString.name, 'toLocaleString');

  const date = new Date(Date.UTC(2012, 11, 20, 3, 0, 0));

  t.ok(Number.isNaN(date.toLocaleString()));
  t.throws(() => Object.prototype.toLocaleString.apply(date), TypeError);

  restore();
});
