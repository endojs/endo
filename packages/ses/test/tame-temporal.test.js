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
  // in start compartment with powerful Temporal
  t.is(typeof Temporal.Now, 'object');
  const startTime = Temporal.Now.instant();
  for (let i = 0; i < 1000; i += 1);
  const endTime = Temporal.Now.instant();
  t.is(Temporal.Instant.compare(startTime, endTime), -1);

  // locale-sensitive methods delegate to locale-insensitive methods
  t.is(startTime.toLocaleString(), startTime.toString());
});

test('tast Date.prototype.toTemporalInstant', t => {
  if (Temporal === undefined) {
    t.false('toTemporalInstant' in Date.prototype);
    t.pass('This JS engine does not yet implement Temporal');
    t.log('This JS engine does not yet implement Temporal');
    return;
  }
  // in start compartment with powerful Date
  const d = new Date();
  t.is(d.toISOString(), d.toTemporalInstant().toString());
});

test('lockdown Temporal from Compartment is powerless', t => {
  if (Temporal === undefined) {
    t.pass('This JS engine does not yet implement Temporal');
    t.log('This JS engine does not yet implement Temporal');
    return;
  }
  const c = new Compartment();

  // in constructed compartments, `Temporal.Now` is omitted,
  // whereas `Date.now` is present but throws. This is because `Date.now`
  // precedes Hardened JavaScript so no one thinks to feature test on it.
  // `Temporal.Now` explicitly quarantines I/O so it can be omitted
  // and feature tested.
  t.false('Now' in c.evaluate('Temporal'));
  t.throws(() => c.evaluate('Date.now()'), {
    message: 'secure mode Calling %SharedDate%.now() throws',
  });
  t.throws(() => c.evaluate('new Date()'), {
    message: 'secure mode Calling new %SharedDate%() with no arguments throws',
  });
  t.throws(() => c.evaluate('Date()'), {
    message:
      'secure mode Calling %SharedDate% constructor as a function throws',
  });
});
