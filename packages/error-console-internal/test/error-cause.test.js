import test from 'ava';
import '../../index.js';

const { getOwnPropertyDescriptor } = Object;

lockdown();

test('error cause', t => {
  const e1 = Error('e1');
  t.is(e1.message, 'e1');
  t.false('cause' in e1);
  const e2 = Error('e2', { cause: e1 });
  t.is(e2.message, 'e2');
  t.is(e2.cause, e1);
  t.deepEqual(getOwnPropertyDescriptor(e2, 'cause'), {
    value: e1,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  const u3 = URIError('u3', { cause: e1 });
  t.is(u3.message, 'u3');
  t.is(u3.cause, e1);
  t.deepEqual(getOwnPropertyDescriptor(u3, 'cause'), {
    value: e1,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  if (typeof AggregateError === 'undefined') {
    t.pass('skip rest of test on platforms prior to AggregateError');
    return;
  }
  const a4 = AggregateError([e2, u3], 'a4', { cause: e1 });
  t.is(a4.message, 'a4');
  t.is(a4.cause, e1);
  t.deepEqual(getOwnPropertyDescriptor(a4, 'cause'), {
    value: e1,
    writable: true,
    enumerable: false,
    configurable: true,
  });
});
