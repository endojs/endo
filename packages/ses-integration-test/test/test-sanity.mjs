/* global setTimeout */
import './lockdown.mjs';
import test from 'tape';

test('sanity', t => {
  const c = new Compartment({ abc: 456 });
  t.equal(c.evaluate('123'), 123, 'simple evaluate succeeds');
  t.equal(c.evaluate('abc'), 456, 'endowment succeeds');
  t.end();
});

test('promise rejection logs', async t => {
  t.plan(3);

  // Test the promise rejection logging system.
  // We expect this to log a message to the console when GC runs.
  Promise.reject(
    Error(
      'this unhandled rejection should be logged with SES_UNHANDLED_REJECTION',
    ),
  );

  await Promise.reject(
    Error('this handled rejection should NOT be logged'),
  ).catch(e =>
    t.equal(e.message, 'this handled rejection should NOT be logged'),
  );
  t.ok(true, 'delaying for 1000ms');
  {
    // Reject a promise, then handle it much later (a whole 1000ms).
    const r = Promise.reject(
      Error('this async-handled rejection should NOT be logged'),
    );
    setTimeout(async () => {
      await r.catch(e =>
        t.equal(
          e.message,
          'this async-handled rejection should NOT be logged',
          'async-handled rejection',
        ),
      );
      t.end();
    }, 1000);
  }
});
