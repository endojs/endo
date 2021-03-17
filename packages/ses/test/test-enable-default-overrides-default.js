import '../lockdown.js';
import test from 'ava';

lockdown({
  // errorTaming: 'unsafe',
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

test('enable default overrides of function', t => {
  t.notThrows(() => {
    function Buffer(_arg, _encodingOrOffset, _length) {}
    Buffer.prototype.toLocaleString = Buffer.prototype.toString;
  });
});

test('enable default overrides of function in evaluation', t => {
  const c = new Compartment();
  t.notThrows(() =>
    c.evaluate(
      `(${function bar() {
        function Buffer(_arg, _encodingOrOffset, _length) {}
        Buffer.prototype.toLocaleString = Buffer.prototype.toString;
      }})()`,
    ),
  );
});
