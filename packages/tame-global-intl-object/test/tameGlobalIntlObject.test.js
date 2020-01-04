import test from 'tape';
// eslint-disable-next-line import/no-extraneous-dependencies
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalIntlObject from '../src/main';

test('tameGlobalIntlObject - tamed properties', t => {
  t.plan(3);

  const restore = captureGlobals('Error');
  tameGlobalIntlObject();

  t.throws(() => Intl.DateTimeFormat(), 'disabled');
  t.throws(() => Intl.NumberFormat(), 'disabled');
  t.throws(() => Intl.getCanonicalLocales(), 'disabled');

  restore();
});
