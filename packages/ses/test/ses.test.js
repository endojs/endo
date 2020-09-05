import test from 'tape';
import '../ses.js';

const originalConsole = console;

lockdown();

/* eslint-disable no-proto, no-empty-function */

test('console', t => {
  t.plan(3);

  t.equal(console, originalConsole);

  harden(console.__proto__);
  harden(console);
  const c1 = new Compartment({ console });
  t.equal(console, c1.evaluate('(console)'));

  const fakeConsole = { log: console.log };
  harden(fakeConsole);
  const c2 = new Compartment({ console: fakeConsole });
  t.equal(console.log, c2.evaluate('(console.log)'));
});

test('tamed constructors', t => {
  t.plan(12);

  function F() {}
  t.throws(() => F.__proto__.constructor(''), TypeError);

  async function AF() {}
  t.throws(() => AF.__proto__.constructor(''), TypeError);

  function* G() {}
  t.throws(() => G.__proto__.constructor(''), TypeError);

  async function* AG() {}
  t.throws(() => AG.__proto__.constructor(''), TypeError);

  t.throws(() => Error.__proto__.constructor(''), TypeError);
  t.throws(() => Function.prototype.constructor(''), TypeError);

  const c = new Compartment({ console });

  t.throws(() => c.evaluate(`Error.__proto__.constructor('')`), TypeError);
  t.throws(() => c.evaluate(`Function.prototype.constructor('')`), TypeError);

  t.throws(
    () => c.evaluate(`function F() {}; F.__proto__.constructor('')`),
    TypeError,
  );
  t.throws(
    () => c.evaluate(`async function AF() {}; AF.__proto__.constructor('')`),
    TypeError,
  );
  t.throws(
    () => c.evaluate(`function* G() {}; G.__proto__.constructor('')`),
    TypeError,
  );
  t.throws(
    () => c.evaluate(`async function* AG() {}; AG.__proto__.constructor('')`),
    TypeError,
  );
});

test('frozen', t => {
  t.plan(4);

  t.ok(Object.isFrozen(Object));
  t.ok(Object.isFrozen(Object.prototype));

  const c = new Compartment();
  t.ok(c.evaluate('Object.isFrozen(Object)'));
  t.ok(c.evaluate('Object.isFrozen(Object.prototype)'));
});

test('create', t => {
  const c = new Compartment();
  t.equal(1, 1);
  t.equal(c.evaluate('1+1'), 2);
  t.end();
});

test('SES compartment does not see primal realm names', t => {
  const hidden = 1; // eslint-disable-line no-unused-vars
  const c = new Compartment();
  t.throws(() => c.evaluate('hidden+1'), ReferenceError);
  t.end();
});

test('SES compartment also has compartments', t => {
  const c = new Compartment();
  t.equal(1, 1);
  t.equal(c.evaluate('1+1'), 2);
  t.equal(c.evaluate(`const s2 = new Compartment(); s2.evaluate('1+2')`), 3);
  t.end();
});

// test('SESRealm has SES.confine', t => {
//   const s = SES.makeSESRootRealm();
//   t.equal(1, 1);
//   t.equal(s.evaluate('1+1'), 2);
//   t.equal(s.evaluate(`SES.confine('1+2')`), 3);
//   // it evals in the current RootRealm. We might test this by adding
//   // something to the global, except that global has been frozen. todo:
//   // if/when we add endowments to makeSESRootRealm(), set one and then test
//   // that SES.confine can see it
//   // s = SES.makeSESRootRealm({ a: 2 });
//   // t.equal(s.evaluate(`SES.confine('a+2')`), 4);

//   // SES.confine accepts endowments, which are made available in the global
//   // lexical scope (*not* copied onto the global object, which is frozen
//   // anyways), so they'll be available for only the duration of the eval, and
//   // only as unbound names (so they could be found statically in the AST)
//   t.equal(s.evaluate(`SES.confine('b+2', { b: 3 })`), 5);
//   t.throws(() => s.evaluate(`SES.confine('b+2')`), ReferenceError);
//   t.end();
// });

test('SES compartment has harden', t => {
  const c = new Compartment({ a: 123 });
  const obj = c.evaluate(`harden({a})`);
  t.equal(obj.a, 123, `expected object`);
  t.throws(() => (obj.a = 'ignored'));
  t.equal(obj.a, 123, `hardened object retains value`);
  t.end();
});

// test('SESRealm.SES wraps exceptions', t => {
//   const s = SES.makeSESRootRealm();
//   function fail() {
//     missing; // eslint-disable-line no-unused-expressions,no-undef
//   }
//   function check(failStr) {
//     try {
//       SES.confine(failStr);
//     } catch (e) {
//       if (e instanceof ReferenceError) {
//         return 'inner ReferenceError';
//       }
//       return 'wrong exception type';
//     }
//     return 'did not throw';
//   }
//   const failStr = `${fail}; fail()`;
//   t.equal(
//     s.evaluate(`${check}; check(failStr)`, { failStr }),
//     'inner ReferenceError',
//   );
//   t.end();
// });

// test('primal realm SES does not have confine', t => {
//   // we actually want to see if 'Object.SES' is present or not
//   // eslint-disable-next-line no-prototype-builtins
//   t.equal(Object.hasOwnProperty('SES'), false);
//   t.end();
// });

test('main use case', t => {
  function power(a) {
    return a + 1;
  }
  function attenuate(arg) {
    if (arg <= 0) {
      throw new TypeError('only positive numbers');
    }
    return power(arg);
  }
  const attenuatedPower = new Compartment({ power }).evaluate(`(${attenuate})`);
  function use(arg) {
    return power(arg);
  }
  const c = new Compartment({ power: attenuatedPower });
  const user = c.evaluate(`(${use})`);
  t.equal(user(1), 2);
  t.throws(() => user(-1), c.globalThis.TypeError);
  t.end();
});

/* eslint-enable no-proto, no-empty-function */
