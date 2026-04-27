import test from '@endo/ses-ava/test.js';
import {
  MIN_TRANSFER_BUFFER_LENGTH,
  TRANSFER_OVERHEAD_LENGTH,
  MIN_DATA_BUFFER_LENGTH,
} from '../src/index.js';

test('trap framing constants are reused from captp', t => {
  t.is(MIN_TRANSFER_BUFFER_LENGTH, MIN_DATA_BUFFER_LENGTH + TRANSFER_OVERHEAD_LENGTH);
  t.true(MIN_DATA_BUFFER_LENGTH >= 1);
});

test('makeCapnpTrapHost / makeCapnpTrapGuest are exported', async t => {
  const m = await import('../src/index.js');
  t.is(typeof m.makeCapnpTrapHost, 'function');
  t.is(typeof m.makeCapnpTrapGuest, 'function');
});
