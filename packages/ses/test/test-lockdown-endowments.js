import 'ses';
import test from 'ava';

lockdown();

const testSubjects = {
  BigInt: {
    Subject: BigInt,
    factory: () => BigInt(3),
  },
  // SubtleCrypto: {
  //     Subject: SubtleCrypto,
  //     factory: () => new SubtleCrypto(),
  // }, //not in Node, hard to test
  TextDecoder: {
    Subject: TextDecoder,
    factory: () => new TextDecoder(),
  },
  TextEncoder: {
    Subject: TextEncoder,
    factory: () => new TextEncoder(),
  },
  URL: {
    Subject: URL,
    factory: () => new URL('https://naugtur.pl'),
  },
  Int8Array: {
    Subject: Int8Array,
    factory: () => new Int8Array(),
  },
  Uint8Array: {
    Subject: Uint8Array,
    factory: () => new Uint8Array(),
  },
  Uint8ClampedArray: {
    Subject: Uint8ClampedArray,
    factory: () => new Uint8ClampedArray(),
  },
  Int16Array: {
    Subject: Int16Array,
    factory: () => new Int16Array(),
  },
  Uint16Array: {
    Subject: Uint16Array,
    factory: () => new Uint16Array(),
  },
  Int32Array: {
    Subject: Int32Array,
    factory: () => new Int32Array(),
  },
  Uint32Array: {
    Subject: Uint32Array,
    factory: () => new Uint32Array(),
  },
  Float32Array: {
    Subject: Float32Array,
    factory: () => new Float32Array(),
  },
  Float64Array: {
    Subject: Float64Array,
    factory: () => new Float64Array(),
  },
  BigInt64Array: {
    Subject: BigInt64Array,
    factory: () => new BigInt64Array(),
  },
  BigUint64Array: {
    Subject: BigUint64Array,
    factory: () => new BigUint64Array(),
  },
  DataView: {
    Subject: DataView,
    factory: () => new DataView(new ArrayBuffer()),
  },
  ArrayBuffer: {
    Subject: ArrayBuffer,
    factory: () => new ArrayBuffer(),
  },
  AbortController: {
    Subject: AbortController,
    factory: () => new AbortController(),
  },
  AbortSignal: {
    Subject: AbortSignal,
    factory: () => AbortSignal.abort(),
  },
};

function code(Subject, functor) {
  const log = [];
  const s = functor();
  try {
    Subject.__flag = '1337';
  } catch (e) {
    log.push(e.message);
  }
  try {
    s.__flag = '1337';
  } catch (e) {
    log.push(e.message);
  }
  try {
    Subject.prototype.__flag = '1337';
  } catch (e) {
    log.push(e.message);
  }
  try {
    s.__proto__.__flag = '1337';
  } catch (e) {
    log.push(e.message);
  }
  return log;
}

Object.entries(testSubjects).forEach(([name, { Subject, factory }]) => {
  test(`lockdown protects ${name}`, t => {
    const endowments = { [name]: Subject };
    const c1 = new Compartment(endowments, {}, {});
    const source = `;(${code})(${name},${factory})`;
    const errors = c1.evaluate(source);
    const s = factory();

    t.falsy(Subject.__flag, 'flag is leaking via endowed object');
    t.falsy(s.__flag, 'flag is leaking via prototype');
    t.assert(errors.length > 0);
  });
});
