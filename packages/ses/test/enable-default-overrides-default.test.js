import '../index.js';
import test from 'ava';

lockdown({
  overrideTaming: 'moderate',
  __hardenTaming__: 'safe',
});

// See https://github.com/endojs/endo/issues/616#issuecomment-800733101

test('enable default overrides of Uint8Array', t => {
  t.notThrows(() => {
    function Buffer(_arg, _encodingOrOffset, _length) {}
    Object.setPrototypeOf(Buffer.prototype, Uint8Array.prototype);
    Object.setPrototypeOf(Buffer, Uint8Array);
    Buffer.prototype.toLocaleString = Buffer.prototype.toString;
  });
});

test('enable default overrides of Uint8Array in evaluation', t => {
  const c = new Compartment();
  t.notThrows(() =>
    c.evaluate(
      `(${function foo() {
        function Buffer(_arg, _encodingOrOffset, _length) {}
        Object.setPrototypeOf(Buffer.prototype, Uint8Array.prototype);
        Object.setPrototypeOf(Buffer, Uint8Array);
        Buffer.prototype.toLocaleString = Buffer.prototype.toString;
      }})()`,
    ),
  );
});

if (typeof Iterator !== 'undefined') {
  test('enable default overrides of Iterator', t => {
    t.notThrows(() => {
      const somethingToOverrideWith = () => {};
      // someone's idea of a generator implementation, partially sourced from @rive-app/canvas npm package
      const g = Object.create(Iterator.prototype);
      g.next = somethingToOverrideWith;
      g.throw = somethingToOverrideWith;
      g.return = somethingToOverrideWith;
      g[Symbol.iterator] = somethingToOverrideWith;
    });
  });

  test('enable default overrides of Iterator in evaluation', t => {
    const c = new Compartment();
    t.notThrows(() =>
      c.evaluate(
        `(${function foo() {
          const somethingToOverrideWith = () => {};
          // someone's idea of a generator implementation, partially sourced from @rive-app/canvas npm package
          const g = Object.create(Iterator.prototype);
          g.next = somethingToOverrideWith;
          g.throw = somethingToOverrideWith;
          g.return = somethingToOverrideWith;
          g[Symbol.iterator] = somethingToOverrideWith;
        }})()`,
      ),
    );
  });
}
