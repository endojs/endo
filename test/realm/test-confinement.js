import test from 'tape';
import Realm from '../../src/realm';

test('confinement evaluation strict mode', t => {
  t.plan(2);

  const r = Realm.makeRootRealm();

  t.equal(r.evaluate('(function() { return this })()'), undefined);
  t.equal(r.evaluate('(new Function("return this"))()'), undefined);
});

test('constructor this binding', t => {
  const r = Realm.makeRootRealm();
  const F = r.evaluate('(new Function("return this"))');

  t.equal(F(), undefined);
  t.equal(F.call(8), 8);
  t.equal(F.call(undefined), undefined);
  t.equal(Reflect.apply(F, 8, []), 8);

  const x = { F };
  t.equal(x.F(), x);

  t.end();
});

test('confinement evaluation constructor', t => {
  t.plan(2);

  const r = Realm.makeRootRealm();

  t.throws(() => {
    r.evaluate('({}).constructor.constructor("return this")()');
  }, Error);

  // Error is a function, so Error.__proto__ is Function.prototype . The
  // unpatched Function.prototype.constructor used to point at the unsafe
  // 'Function' object, which would provide access to the primal realm's
  // globals, so it must be kept out of the hands of any child realm. We
  // replace that '.constructor' with a safe replacement (which always
  // throws). Here we test that this constructor has been replaced.
  t.throws(() => {
    r.evaluate('Error.__proto__.constructor("return this")()');
  }, Error);
});

test('confinement evaluation eval', t => {
  t.plan(2);

  const r = Realm.makeRootRealm();

  // Strict mode
  t.equal(r.evaluate('(0, eval)("this")'), r.global);
  t.equal(r.evaluate('var evil = eval; evil("this")'), r.global);
});
