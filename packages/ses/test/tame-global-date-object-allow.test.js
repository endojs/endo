import tap from 'tap';
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalDateObject from '../src/tame-global-date-object.js';

const { test } = tap;

test('tameGlobalDateObject - constructor without argument', t => {
  const restore = captureGlobals('Date');
  tameGlobalDateObject(true);

  t.equal(Date.name, 'Date');

  const date = new Date();

  t.ok(date instanceof Date);
  // eslint-disable-next-line no-proto
  t.equal(date.__proto__.constructor, Date);

  t.isNot(date.toString(), 'Invalid Date');

  restore();
  t.end();
});

test('tameGlobalDateObject - now', t => {
  const restore = captureGlobals('Date');
  tameGlobalDateObject(true);

  t.equal(Date.now.name, 'now');

  const date = Date.now();

  t.ok(date > 1);

  restore();
  t.end();
});

test('tameGlobalObject - toLocaleString', t => {
  const restore = captureGlobals('Date');
  tameGlobalDateObject(true);

  t.equal(Date.prototype.toLocaleString.name, 'toLocaleString');
  t.equal(Object.prototype.toLocaleString.name, 'toLocaleString');

  const date = new Date(Date.UTC(2012, 11, 20, 3, 0, 0));

  t.equal(typeof date.toLocaleString(), 'string');
  t.equal(typeof Object.prototype.toLocaleString.apply(date), 'string');

  restore();
  t.end();
});
