import tap from 'tap';
import sinon from 'sinon';
import Compartment from '../../src/main.js';
import stubFunctionConstructors from '../stubFunctionConstructors.js';

const { test } = tap;

test('function-no-body', t => {
  t.plan(2);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();
  const f1 = new c.global.Function();
  const src = f1.toString();

  t.notOk(src.includes('undefined'));
  t.equal(f1(), undefined);

  sinon.restore();
});

test('function-injection', t => {
  t.plan(3);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const goodFunc = 'return a+1';
  const c = new Compartment();
  const f1 = new c.global.Function('a', goodFunc);
  t.equal(f1(5), 6);

  // the naive expansion is: '(function(a) {'  +  evilFunc  +  '})'
  // c.g. `(function(a) { ${evilFunc} })`

  // we want to trick that into defining one function and evaluating
  // something else (which is evil)
  // like: '(function(a) {'  +  '}, this.haha = 666, {'  +  '})'
  // which becomes: (function(a) {}, this.haha = 666, {})

  const evilFunc = '}, this.haha = 666, {';
  t.throws(() => new c.global.Function('a', evilFunc), c.global.SyntaxError);
  t.equal(c.global.haha, undefined);

  sinon.restore();
});

test('function-injection-2', t => {
  t.plan(20);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();
  let flag = false;
  // eslint-disable-next-line func-names
  c.global.target = function() {
    flag = true;
  };
  function check(...args) {
    t.throws(() => c.global.Function(...args), c.global.SyntaxError, args);
    t.equal(flag, false);
  }

  // test cases from https://code.google.com/archive/p/google-caja/issues/1616
  check(`}), target(), (function(){`);
  check(`})); }); target(); (function(){ ((function(){ `);

  // and from https://bugs.chromium.org/p/v8/issues/detail?id=2470
  check('/*', '*/){');
  check('', '});(function(){');
  check('', `});print('1+1=' + (1+1));(function(){`);

  // and from https://bugs.webkit.org/show_bug.cgi?id=106160
  check('){});(function(', '');
  check('', '});(function(){');
  check('/*', '*/){');
  check('}}; 1 * {a:{');

  // bug from Matt Austin: this is surprising but doesn't allow new access
  check('arg=`', '/*body`){});({x: this/**/');
  // a naive evaluation might do this:
  //     (function(arg=`){
  //      /*body`){});({x: this/**/
  //     })

  // TODO: review the limitations previously described below.
  // In which the backtick in arg= eats both the )} that we add and the /*
  // that the body adds, allowing the body to terminate the function
  // definition. Then the body defines a new expression, which creates an
  // object with a property named "x" which captures the same 'this' you
  // could have gotten with plain safe eval().

  // markm tried to protect against this by injecting an extra trailing
  // block comment to the end of the arguments, creating a body like this

  //     (function(arg=`
  //     /*``*/){
  //      /*body`){});({x: this/**/
  //     })

  // In this version, the backtick from arg= eats the first part of the
  // injected block comment, and the backtick from the body matches the
  // second part of the injected block comment. That yields a
  // syntactically-valid but semantically-invalid default argument with a
  // value of `\n/*``*/){\n/*body` , in which the first template literal
  // (`\n/*`) evaluates to a string ("\n/*") which is then used as the
  // template-literal-tag for the second template literal. This is
  // semantically invalid because strings cannot be called as functions, but
  // the syntax is still valid. The constructed function is bypassed, so its
  // default argument is never evaluated, so this invalidity doesn't matter.

  // To protect against this, we'll just forbid everything except simple
  // identifiers in Function constructor calls: no default arguments ("=")
  // and no pattern matching expressions ("[a,b]"). You can still use complex
  // arguments in function definitions, just not in calls to the Function
  // constructor.

  sinon.restore();
});

test('function-paren-default', t => {
  t.plan(1);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();
  t.equal(c.global.Function('foo, a = new Date(0)', 'return foo')(99), 99);

  sinon.restore();
});

test('function-default-parameters', t => {
  t.plan(1);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();
  t.equal(c.global.Function('a=1', 'return a+1')(), 2);

  sinon.restore();
});

test('function-rest-parameter', t => {
  t.plan(1);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();
  t.equal(c.global.Function('...rest', 'return rest[1]')(1, 2, 3), 2);

  sinon.restore();
});

test('function-destructuring-parameters', t => {
  t.plan(1);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();
  t.equal(c.global.Function('{foo, bar}, baz', 'return bar')({ bar: 99 }), 99);

  sinon.restore();
});

test('function-legitimate-but-weird-parameters', t => {
  t.plan(2);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();
  const f1 = c.global.Function('foo, bar', 'baz', 'return foo + bar + baz');
  t.equal(f1(1, 2, 3), 6);

  const f2 = c.global.Function(
    'foo, bar = [1',
    '2]',
    'return foo + bar[0] + bar[1]',
  );
  t.equal(f2(1), 4);

  sinon.restore();
});

test('degenerate-pattern-match-argument', t => {
  t.plan(1);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();
  // This syntax is also rejected by the normal JS parser.
  t.throws(
    () => new c.global.Function('3', 'return foo + bar + baz'),
    c.global.SyntaxError,
  );

  sinon.restore();
});

test('frozen-eval', t => {
  t.plan(1);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const c = new Compartment();

  Object.defineProperty(c.global, 'eval', {
    value: c.global.eval,
    writable: false,
    configurable: false,
  });

  c.global.foo = 77;
  globalThis.foo = 88;

  t.equal(c.evaluate('(0,eval)("foo")'), 77);

  delete globalThis.foo;
  sinon.restore();
});
