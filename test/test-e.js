import test from 'tape-promise/tape';
import { E } from '../src/index';

test('E method calls', async t => {
  try {
    const x = {
      double(n) {
        return 2 * n;
      },
    };
    const d = E(x).double(6);
    t.equal(typeof d.then, 'function', 'return is a thenable');
    t.equal(await d, 12, 'method call works');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

test('E.* shortcuts', async t => {
  try {
    const x = {
      name: 'buddy',
      val: 123,
      y: Object.freeze({
        val2: 456,
        name2: 'holly',
        fn: n => 2 * n,
      }),
      hello(greeting) {
        return `${greeting}, ${this.name}!`;
      },
    };
    t.equal(await E.M(x).hello('Hello'), 'Hello, buddy!', 'method call works');
    t.equal(
      await E.M(await E.G(await E.G(x).y).fn)(4),
      8,
      'anonymous method works',
    );
    t.equal(await E.G(x).val, 123, 'property get');
    t.equal(await E.S(x).val(999), 999, 'property set');
    t.equal(x.val, 999, 'property set works');
    t.equal(await E.D(x).val, true, 'property delete');
    t.equal(x.val, undefined, 'delete worked');
    await t.rejects(
      E.D(await E.G(x).y).val2,
      TypeError,
      'property delete fails',
    );
    t.equal(x.y.val2, 456, 'delete failed');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

test('E.C chains', async t => {
  try {
    const x = {
      name: 'buddy',
      val: 123,
      y: Object.freeze({
        val2: 456,
        name2: 'holly',
        fn: n => 2 * n,
      }),
      hello(greeting) {
        return `${greeting}, ${this.name}!`;
      },
    };
    const xC = E.C(x);
    t.equal(await xC.M.hello('Hello').P, 'Hello, buddy!', 'method call works');
    t.equal(await xC.G.y.G.fn.M(4).P, 8, 'anonymous method works');
    t.equal(await xC.G.val.P, 123, 'property get');
    t.equal(await xC.S.val(999).P, 999, 'property set');
    t.equal(await xC.H.val.P, true, 'property has');
    t.equal(await xC.H.notval.P, false, 'missing property has not');
    t.equal(x.val, 999, 'property set works');
    t.equal(await xC.D.val.P, true, 'property delete');
    t.equal(x.val, undefined, 'delete worked');
    await t.rejects(xC.G.y.D.val2.P, TypeError, 'property delete fails');
    t.equal(x.y.val2, 456, 'delete failed');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
