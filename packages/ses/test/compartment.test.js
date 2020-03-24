/* global Compartment */
import test from 'tape';
import { lockdown } from '../src/lockdown-shim.js';

lockdown();

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
  t.equal(c.evaluate(`const c2 = new Compartment(); c2.evaluate('1+2')`), 3);
  t.end();
});

// test('SESRealm has SES.confine', t => {
//   const s = SES.makeSESRootRealm();
//   t.equal(1, 1);
//   t.equal(c.evaluate('1+1'), 2);
//   t.equal(c.evaluate(`SES.confine('1+2')`), 3);
//   // it evals in the current RootRealm. We might test this by adding
//   // something to the global, except that global has been frozen. todo:
//   // if/when we add endowments to makeSESRootRealm(), set one and then test
//   // that SES.confine can see it
//   // s = SES.makeSESRootRealm({ a: 2 });
//   // t.equal(c.evaluate(`SES.confine('a+2')`), 4);

//   // SES.confine accepts endowments, which are made available in the global
//   // lexical scope (*not* copied onto the global object, which is frozen
//   // anyways), so they'll be available for only the duration of the eval, and
//   // only as unbound names (so they could be found statically in the AST)
//   t.equal(c.evaluate(`SES.confine('b+2', { b: 3 })`), 5);
//   t.throws(() => c.evaluate(`SES.confine('b+2')`), ReferenceError);
//   t.end();
// });

test('SES compartment has harden', t => {
  const c = new Compartment();
  const obj = c.evaluate(`harden({a})`, { endowments: { a: 123 } });
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
//     c.evaluate(`${check}; check(failStr)`, { failStr }),
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
  const c = new Compartment();
  function power(a) {
    return a + 1;
  }
  function attenuate(arg) {
    if (arg <= 0) {
      throw new TypeError('only positive numbers');
    }
    return power(arg);
  }
  const attenuatedPower = c.evaluate(`(${attenuate})`, {
    endowments: { power },
  });
  function use(arg) {
    return power(arg);
  }
  const user = c.evaluate(`(${use})`, {
    endowments: { power: attenuatedPower },
  });
  t.equal(user(1), 2);
  t.throws(() => user(-1), c.global.TypeError);
  t.end();
});

function transform(rewriterState) {
  const { src, endowments } = rewriterState;
  return {
    src: src.replace('replaceme', 'substitution'),
    endowments: { added: 'by transform', ...endowments },
  };
}

test('transforms can add endowments', t => {
  const src = '(function f4(a) {  return `replaceme ${added} ${a}`; })';
  const transforms = [transform];
  const c = new Compartment({}, {}, { transforms });
  const f4 = c.evaluate(src);
  const out = f4('ok');
  t.equal(out, 'substitution by transform ok');
  t.end();
});
