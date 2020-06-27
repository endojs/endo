import tap from 'tap';
import tameGlobalErrorObject from '../src/tame-global-error-object.js';

const { test } = tap;

const {
  start: {
    Error: { value: tamedError },
  },
} = tameGlobalErrorObject('safe');

test('tameGlobalErrorObject', t => {
  try {
    t.equal(typeof tamedError.stackTraceLimit, 'number');
    t.equal(tamedError.stackTraceLimit, 0);
    tamedError.stackTraceLimit = 11;
    t.equal(tamedError.stackTraceLimit, 0);
    // eslint-disable-next-line new-cap
    const error = new tamedError();
    t.equal(typeof error.stack, 'string');
    tamedError.captureStackTrace(error);
    t.equal(error.stack, '');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
