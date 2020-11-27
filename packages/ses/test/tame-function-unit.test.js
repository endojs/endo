import test from 'ava';
import sinon from 'sinon';
import tameFunctionConstructors from '../src/tame-function-constructors.js';
import stubFunctionConstructors from './stub-function-constructors.js';

test('Function.prototype.constructor', t => {
  t.plan(4);

  stubFunctionConstructors(sinon);
  tameFunctionConstructors();

  // eslint-disable-next-line no-new-func
  t.notThrows(() => Function(''));

  // eslint-disable-next-line no-proto
  t.throws(() => Error.__proto__.constructor(''), { instanceOf: TypeError });
  t.throws(() => Function.prototype.constructor(''), { instanceOf: TypeError });

  // eslint-disable-next-line no-eval
  const proto = Object.getPrototypeOf((0, eval)('(function() {})'));
  t.throws(() => proto.constructor(''), { instanceOf: TypeError });

  sinon.restore();
});

test('AsyncFunction.constructor', t => {
  t.plan(1);

  stubFunctionConstructors(sinon);
  tameFunctionConstructors();

  try {
    // eslint-disable-next-line no-eval
    const proto = Object.getPrototypeOf((0, eval)('(async function() {})'));
    t.throws(() => proto.constructor(''), { instanceOf: TypeError });
  } catch (e) {
    if (e instanceof SyntaxError && e.message.startsWith('Unexpected token')) {
      t.pass('not supported');
    } else {
      throw e;
    }
  }

  sinon.restore();
});

test('GeneratorFunction.constructor', t => {
  t.plan(1);

  stubFunctionConstructors(sinon);
  tameFunctionConstructors();

  try {
    // eslint-disable-next-line no-eval
    const proto = Object.getPrototypeOf((0, eval)('(function* () {})'));
    t.throws(() => proto.constructor(''), { instanceOf: TypeError });
  } catch (e) {
    if (e instanceof SyntaxError && e.message.startsWith('Unexpected token')) {
      t.pass('not supported');
    } else {
      throw e;
    }
  }

  sinon.restore();
});

test('AsyncGeneratorFunction.constructor', t => {
  t.plan(1);

  stubFunctionConstructors(sinon);
  tameFunctionConstructors();

  try {
    // eslint-disable-next-line no-eval
    const proto = Object.getPrototypeOf((0, eval)('(async function* () {})'));
    t.throws(() => proto.constructor(''), { instanceOf: TypeError });
  } catch (e) {
    if (e instanceof SyntaxError && e.message.startsWith('Unexpected token')) {
      t.pass('not supported');
    } else {
      throw e;
    }
  }

  sinon.restore();
});
