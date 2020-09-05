import test from 'tape';
import '../ses.js';

lockdown({ localeTaming: 'unsafe' });

test('tame locale methods', t => {
  t.notEqual(Object.prototype.toString, Object.prototype.toLocaleString);
  t.notEqual(Number.prototype.toString, Number.prototype.toLocaleString);
  t.notEqual(BigInt.prototype.toString, BigInt.prototype.toLocaleString);
  t.notEqual(Date.prototype.toDateString, Date.prototype.toLocaleDateString);
  t.notEqual(Date.prototype.toString, Date.prototype.toLocaleString);
  t.notEqual(Date.prototype.toTimeString, Date.prototype.toLocaleTimeString);
  t.notEqual(String.prototype.toLowerCase, String.prototype.toLocaleLowerCase);
  t.notEqual(String.prototype.toUpperCase, String.prototype.toLocaleUpperCase);
  t.notEqual(Array.prototype.toString, Array.prototype.toLocaleString);

  const TypedArray = Reflect.getPrototypeOf(Uint8Array);
  t.notEqual(
    TypedArray.prototype.toString,
    TypedArray.prototype.toLocaleString,
  );

  t.equal(typeof String.prototype.localeCompare, 'function');
  t.ok(`${String.prototype.localeCompare}`.includes('[native code]'));

  t.end();
});
