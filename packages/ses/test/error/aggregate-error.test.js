import test from 'ava';
import '../../index.js';

const { getOwnPropertyDescriptor } = Object;

lockdown();

test('aggregate error', t => {
  if (typeof AggregateError === 'undefined') {
    t.pass('skip test on platforms prior to AggregateError');
    return;
  }
  const e1 = Error('e1');
  const e2 = Error('e2', { cause: e1 });
  const u3 = URIError('u3', { cause: e1 });

  const a4 = AggregateError([e2, u3], 'a4', { cause: e1 });
  t.is(a4.message, 'a4');
  t.is(a4.cause, e1);
  t.deepEqual(getOwnPropertyDescriptor(a4, 'cause'), {
    value: e1,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  t.deepEqual(getOwnPropertyDescriptor(a4, 'errors'), {
    value: [e2, u3],
    writable: true,
    enumerable: false,
    configurable: true,
  });
});

test('Promise.any aggregate error', async t => {
  if (typeof AggregateError === 'undefined') {
    t.pass('skip test on platforms prior to AggregateError');
    return;
  }
  const e1 = Error('e1');
  const e2 = Error('e2', { cause: e1 });
  const u3 = URIError('u3', { cause: e1 });

  await null;
  try {
    await Promise.any([Promise.reject(e2), Promise.reject(u3)]);
  } catch (a4) {
    t.false('cause' in a4);
    t.deepEqual(getOwnPropertyDescriptor(a4, 'errors'), {
      value: [e2, u3],
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
});
