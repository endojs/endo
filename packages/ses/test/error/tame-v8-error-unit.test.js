import test from 'ava';
import tameErrorConstructor from '../../src/error/tame-error-constructor.js';

const { '%InitialError%': InitialError } = tameErrorConstructor();

test('tameErrorConstructor', t => {
  try {
    t.is(typeof InitialError.stackTraceLimit, 'number');
    InitialError.stackTraceLimit = 11;
    t.is(InitialError.stackTraceLimit, 11);
    const error = InitialError();
    t.is(typeof error.stack, 'string');
    InitialError.captureStackTrace(error);
    t.is(typeof error.stack, 'string');
  } catch (e) {
    t.not(e, e, 'unexpected exception');
  }
});
