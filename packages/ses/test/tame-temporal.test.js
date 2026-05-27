import test from 'ava';
import {
  Temporal, // may be undefined on older JS engines
} from '../src/commons.js';
import '../index.js';

// Explicitly setting `localeTaming` to the default `'safe'` setting to be
// insensitive to the `LOCKDOWN_LOCALE_TAMING` environment variable.
lockdown({ localeTaming: 'safe' });

test('lockdown start Temporal is powerful', t => {
  if (Temporal === undefined) {
    t.pass('This JS engine does not yet implement Temporal');
    t.log('This JS engine does not yet implement Temporal');
    return;
  }
  t.is(typeof Temporal.Now, 'object');
  const startTime = Temporal.Now.instant();
  for (let i = 0; i < 1000; i += 1);
  const endTime = Temporal.Now.instant();
  t.is(Temporal.Instant.compare(startTime, endTime), -1);

  // locale-sensitive methods delegate to locale-insensitive methods
  t.is(startTime.toLocaleString(), startTime.toString());
});

test('lockdown Temporal from Compartment is powerless', t => {
  if (Temporal === undefined) {
    t.pass('This JS engine does not yet implement Temporal');
    t.log('This JS engine does not yet implement Temporal');
    return;
  }
  const c = new Compartment();

  t.false('Now' in c.evaluate('Temporal'));
});
