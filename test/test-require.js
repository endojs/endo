import test from 'tape';
import OrigNat from '@agoric/nat';
import SES from '../src/index';

test('SES environment lacks require by default', t => {
  const s = SES.makeSESRootRealm();
  t.equal(typeof s.global.require, 'undefined');
  t.end();
});

test('SES environment does not have def/harden/Nat as a global', t => {
  const s = SES.makeSESRootRealm();
  t.equal(typeof s.global.def, 'undefined');
  t.equal(typeof s.global.harden, 'undefined');
  t.equal(typeof s.global.Nat, 'undefined');
  t.end();
});

test('require(unknown) throws an error', t => {
  const s = SES.makeSESRootRealm({
    consoleMode: 'allow',
    errorStackMode: 'allow',
  });
  const req = s.makeRequire({ known: OrigNat });
  function check() {
    console.log('about to require the unknown');
    const require2 = require;
    require2('unknown');
    console.log('wait we required the unknown and lived to tell');
  }
  t.throws(() => s.evaluate(`(${check})()`, { require: req }), Error);
  t.end();
});

test('SES environment can have require(nat)', t => {
  const s = SES.makeSESRootRealm();
  t.equal(typeof s.global.require, 'undefined');
  const req = s.makeRequire({ '@agoric/nat': OrigNat });
  function check() {
    // eslint-disable-next-line global-require
    const Nat = require('@agoric/nat');
    const n = x => Nat(x);
    return { n, Nat };
  }
  // console.log(`REQ src is ${check}`);
  const { n, Nat: n2 } = s.evaluate(`(${check})()`, { require: req });
  // console.log(`Nat is ${typeof n2}`);
  t.ok(Object.isFrozen(n2));
  t.equal(typeof n2, 'function');
  t.equal(n(0), 0);
  t.equal(n(1), 1);
  t.equal(n(999), 999);
  t.equal(n(2 ** 53 - 1), 2 ** 53 - 1);
  t.throws(() => n('not a number'), s.global.RangeError);
  t.throws(() => n(-1), s.global.RangeError);
  t.throws(() => n(0.5), s.global.RangeError);
  t.throws(() => n(2 ** 53), s.global.RangeError);
  t.throws(() => n(2 ** 60), s.global.RangeError);
  t.throws(() => n(NaN), s.global.RangeError);
  t.end();
});

test('SES environment can have require(harden)', t => {
  const s = SES.makeSESRootRealm();
  const req = s.makeRequire({ '@agoric/harden': true });
  function check() {
    // eslint-disable-next-line global-require,import/no-unresolved
    const harden = require('@agoric/harden');
    const defMe1 = function me() {};
    defMe1.other = {};
    const defMe2 = harden(defMe1);
    return { defMe1, defMe2 };
  }
  const { defMe1, defMe2 } = s.evaluate(`${check}; check()`, { require: req });
  t.equal(defMe1, defMe2);
  t.ok(Object.isFrozen(defMe1));
  t.ok(Object.isFrozen(defMe2));
  t.ok(Object.isFrozen(defMe2.other));
  t.end();
});

test('require is available to multiply-confined code', t => {
  const s = SES.makeSESRootRealm();
  const req = s.makeRequire({ '@agoric/nat': OrigNat });
  function t3() {
    // eslint-disable-next-line global-require
    const Nat = require('@agoric/nat');
    Nat(0);
  }
  function t2(t3src) {
    SES.confine(t3src, { require })();
  }
  function t1(t2src, t3src) {
    SES.confine(t2src, { require })(t3src);
  }
  const t1Src = `(${t1})`;
  const t2Src = `(${t2})`;
  const t3Src = `(${t3})`;
  const t1func = s.evaluate(t1Src, { require: req });
  t1func(t2Src, t3Src);
  t.end();
});

test('require can use attenuators', t => {
  const s = SES.makeSESRootRealm({ errorStackMode: 'allow' });
  const output = [];
  function power(x) {
    output.push(`power: ${x}`);
  }
  function makeAttenuator(endowments) {
    endowments.output.push('made');
    function lesserPower(x) {
      endowments.power(x * 2);
      // not really attenuating much, is it. kinda the opposite.
      return 3;
    }
    lesserPower.childProp = {};
    return lesserPower;
  }
  const req = s.makeRequire({
    foo: { attenuatorSource: `(${makeAttenuator})`, power, output },
  });

  // makeRequire should be lazy
  t.equal(output.length, 0);

  function check() {
    const require2 = require;
    const foo = require2('foo');
    return foo;
  }

  // makeAttenuator() should be invoked by the require()
  const foo = s.evaluate(`${check}; check()`, { require: req });
  t.ok(Object.isFrozen(foo));
  t.ok(Object.isFrozen(foo.childProp));
  t.notOk(Object.isFrozen(power), 'power is closed over, harden ignores it');
  t.equal(output.shift(), 'made');
  t.equal(output.length, 0);

  // require() should cache its value (at least for resource modules), so
  // makeAttenuator() should not be invoked a second time
  s.evaluate(`${check}; check()`, { require: req });
  t.equal(output.length, 0);

  // actually calling foo() goes through the attenuator
  t.equal(foo(1), 3);
  t.equal(output.shift(), 'power: 2');
  t.equal(output.length, 0);
  t.end();
});

test('attenuators that leak properties flunk harden()', t => {
  const s = SES.makeSESRootRealm({ errorStackMode: 'allow' });
  function power() {}
  function makeAttenuator(endowments) {
    function lesserPower(x) {
      endowments.power(x * 2);
      // not really attenuating much, is it. kinda the opposite.
      return 3;
    }
    lesserPower.childProp = endowments.power;
    return lesserPower;
  }
  const req = s.makeRequire({
    foo: { attenuatorSource: `(${makeAttenuator})`, power },
  });

  function check() {
    const require2 = require;
    const foo = require2('foo');
    return foo;
  }

  // invoking require() should throw when it tries to harden the attenuator,
  // because .childProp points at a primal-realm object which has a prototype
  // that is not in the fringe. This won't be case if we run in a
  // RealmCompartment where there's only one Realm and everything is already
  // frozen.
  t.throws(() => s.evaluate(`(${check})()`, { require: req }), Error);
  t.end();
});
