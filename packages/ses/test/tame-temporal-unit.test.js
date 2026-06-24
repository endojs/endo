import test from 'ava';
import {
  Temporal, // may be undefined on older JS engines
} from '../src/commons.js';
import tameTemporalObject from '../src/tame-temporal-object.js';

test('tameTemporalObject unit test', t => {
  if (Temporal === undefined) {
    t.deepEqual(tameTemporalObject(), {});
    t.pass('This JS engine does not yet implement Temporal');
    t.log('This JS engine does not yet implement Temporal');
    return;
  }

  const {
    '%Temporal.Now%': now,
    '%InitialTemporal%': initialTemporal,
    '%SharedTemporal%': sharedTemporal,
  } = tameTemporalObject();

  // initial Temporal is powerful
  t.is(Temporal, initialTemporal);
  t.is(Temporal.Now, now);
  t.is(typeof now, 'object');
  const startTime = now.instant();
  for (let i = 0; i < 1000; i += 1);
  const endTime = initialTemporal.Now.instant();
  t.is(initialTemporal.Instant.compare(startTime, endTime), -1);

  // shared Temporal is powerless
  t.false('Now' in sharedTemporal);

  // since this is just a non-lockdown unit test, the locale-sensitive
  // methods do not delegate to the locale-insensitive ones.
  t.not(startTime.toLocaleString(), startTime.toString());
});
