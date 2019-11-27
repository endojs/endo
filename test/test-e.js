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
