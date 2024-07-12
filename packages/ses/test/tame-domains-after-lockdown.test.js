import '../index.js';
import test from 'ava';

lockdown({ domainTaming: 'safe' });

test('import domains after lockdown', async t => {
  await null;
  try {
    await import('domain');
    t.fail('importing domain should throw');
  } catch (error) {
    // This assertion omitted to avoid coupling to a specific engine.
    // t.is(error.message, 'Cannot redefine property: domain');
    t.log(error);
    t.pass();
  }
});
