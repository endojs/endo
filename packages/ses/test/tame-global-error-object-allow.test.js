import tap from 'tap';
import { captureGlobals } from '@agoric/test262-runner';
import tameGlobalErrorObject from '../src/tame-global-error-object.js';

const { test } = tap;

test('tameGlobalErrorObject', t => {
  const restore = captureGlobals('Error');

  try {
    tameGlobalErrorObject(true);

    t.equal(typeof Error.stackTraceLimit, 'number');
    Error.stackTraceLimit = 11;
    t.equal(Error.stackTraceLimit, 11);
    const error = new Error();
    t.equal(typeof error.stack, 'string');
    Error.captureStackTrace(error);
    t.equal(typeof error.stack, 'string');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    restore();
    t.end();
  }
});
