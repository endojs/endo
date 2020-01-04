import test from 'tape';
// eslint-disable-next-line import/no-extraneous-dependencies
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalDateObject from '../src/main';

test('tameGlobalDateObject - constructor without argument', t => {
  t.plan(1);

  const restore = captureGlobals('Date');
  tameGlobalDateObject();

  const date = new Date();

  t.equal(date.toString(), 'Invalid Date');

  restore();
});

test('tameGlobalDateObject - now', t => {
  t.plan(1);

  const restore = captureGlobals('Date');
  tameGlobalDateObject();

  const date = Date.now();

  t.ok(Number.isNaN(date));

  restore();
});

test.skip('tameGlobalIntlObject - toLocaleString', t => {
  t.plan(1);

  const restore = captureGlobals('Error');
  tameGlobalDateObject();

  const date = new Date(Date.UTC(2012, 11, 20, 3, 0, 0));

  t.throws(() => date.toLocaleString(), 'suppressed');
  t.throws(() => Object.prototype.toLocaleString.apply(date), 'suppressed');

  restore();
});
