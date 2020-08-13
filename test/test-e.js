import '@agoric/install-ses';
import test from 'tape-promise/tape';
import { E, HandledPromise } from './get-hp';

test('E reexports', async t => {
  try {
    t.equals(E.resolve, HandledPromise.resolve, 'E reexports resolve');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

test('E.when', async t => {
  try {
    let stash;
    await E.when(123, val => (stash = val));
    t.equals(stash, 123, `onfulfilled handler fires`);
    let raised;
    // eslint-disable-next-line prefer-promise-reject-errors
    await E.when(Promise.reject('foo'), undefined, val => (raised = val));
    t.assert(raised, 'foo', 'onrejected handler fires');

    let ret;
    let exc;
    await E.when(
      Promise.resolve('foo'),
      val => (ret = val),
      val => (exc = val),
    );
    t.equals(ret, 'foo', 'onfulfilled option fires');
    t.equals(exc, undefined, 'onrejected option does not fire');

    let ret2;
    let exc2;
    await E.when(
      // eslint-disable-next-line prefer-promise-reject-errors
      Promise.reject('foo'),
      val => (ret2 = val),
      val => (exc2 = val),
    );
    t.equals(ret2, undefined, 'onfulfilled option does not fire');
    t.equals(exc2, 'foo', 'onrejected option fires');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

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

test('E shortcuts', async t => {
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
    t.equal(await E(x).hello('Hello'), 'Hello, buddy!', 'method call works');
    t.equal(
      await E(await E.G(await E.G(x).y).fn)(4),
      8,
      'anonymous method works',
    );
    t.equal(await E.G(x).val, 123, 'property get');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
