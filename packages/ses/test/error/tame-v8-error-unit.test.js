import tap from 'tap';
import tameErrorConstructor from '../../src/error/tame-error-constructor.js';

const { test } = tap;

const { '%InitialError%': InitialError } = tameErrorConstructor();

test('tameErrorConstructor', t => {
  try {
    t.equal(typeof InitialError.stackTraceLimit, 'number');
    InitialError.stackTraceLimit = 11;
    t.equal(InitialError.stackTraceLimit, 11);
    const error = new InitialError();
    t.equal(typeof error.stack, 'string');
    InitialError.captureStackTrace(error);
    t.equal(typeof error.stack, 'string');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
