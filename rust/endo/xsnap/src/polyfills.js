// Minimal polyfills for XS that @endo/* packages need.
// Evaluated BEFORE any makeBundle IIFEs so that module-level
// destructuring of `assert` and references to `harden` succeed.

// -- TextEncoder / TextDecoder (XS lacks Web APIs) --
//
// Implemented in pure JavaScript rather than via XS extensions
// (`ArrayBuffer.fromString` / `String.fromArrayBuffer`) because SES
// lockdown removes those non-standard bindings and also replaces
// `globalThis`, which would invalidate any closure we used to
// smuggle them past lockdown. UTF-8 is computed byte-by-byte here.
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = class TextEncoder {
    encode(str) {
      const s = String(str);
      // Upper-bound: 3 bytes per BMP unit; surrogate pairs → 4
      // bytes total = 2 BMP units so 3/unit still covers the pair.
      // Allocate conservatively, truncate at the end.
      const out = new Uint8Array(s.length * 3);
      let j = 0;
      for (let i = 0; i < s.length; i += 1) {
        let code = s.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
          const next = s.charCodeAt(i + 1);
          if (next >= 0xdc00 && next <= 0xdfff) {
            code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
            i += 1;
          }
        }
        if (code < 0x80) {
          out[j] = code;
          j += 1;
        } else if (code < 0x800) {
          out[j] = 0xc0 | (code >> 6);
          out[j + 1] = 0x80 | (code & 0x3f);
          j += 2;
        } else if (code < 0x10000) {
          out[j] = 0xe0 | (code >> 12);
          out[j + 1] = 0x80 | ((code >> 6) & 0x3f);
          out[j + 2] = 0x80 | (code & 0x3f);
          j += 3;
        } else {
          out[j] = 0xf0 | (code >> 18);
          out[j + 1] = 0x80 | ((code >> 12) & 0x3f);
          out[j + 2] = 0x80 | ((code >> 6) & 0x3f);
          out[j + 3] = 0x80 | (code & 0x3f);
          j += 4;
        }
      }
      return out.slice(0, j);
    }
  };
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = class TextDecoder {
    decode(buf) {
      let bytes;
      if (buf instanceof Uint8Array) {
        bytes = buf;
      } else if (buf instanceof ArrayBuffer) {
        bytes = new Uint8Array(buf);
      } else {
        return String(buf);
      }
      let out = '';
      let i = 0;
      while (i < bytes.length) {
        const b0 = bytes[i];
        let code;
        if (b0 < 0x80) {
          code = b0;
          i += 1;
        } else if ((b0 & 0xe0) === 0xc0) {
          code = ((b0 & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
          i += 2;
        } else if ((b0 & 0xf0) === 0xe0) {
          code =
            ((b0 & 0x0f) << 12) |
            ((bytes[i + 1] & 0x3f) << 6) |
            (bytes[i + 2] & 0x3f);
          i += 3;
        } else {
          code =
            ((b0 & 0x07) << 18) |
            ((bytes[i + 1] & 0x3f) << 12) |
            ((bytes[i + 2] & 0x3f) << 6) |
            (bytes[i + 3] & 0x3f);
          i += 4;
        }
        if (code < 0x10000) {
          out += String.fromCharCode(code);
        } else {
          const c = code - 0x10000;
          out += String.fromCharCode(0xd800 | (c >> 10), 0xdc00 | (c & 0x3ff));
        }
      }
      return out;
    }
  };
}

// -- assert polyfill --
// @endo/errors and @endo/eventual-send destructure `assert` at
// module init time: `const { Fail, details, quote } = assert;`
if (!globalThis.assert) {
  const Fail = (template, ...subs) => {
    throw Error(String.raw(template, ...subs));
  };
  const quote = (val) => {
    if (typeof val === 'string') return JSON.stringify(val);
    try {
      return JSON.stringify(val);
    } catch (_) {
      return JSON.stringify(String(val));
    }
  };
  const details = (template, ...subs) => ({
    toString() {
      // Subs are already formatted (e.g. by q()), so interpolate
      // them directly without re-quoting.
      return String.raw(template, ...subs);
    },
  });
  const baseAssert = (flag, optDetails) => {
    if (!flag) throw Error(optDetails ? String(optDetails) : 'Assert failed');
  };
  baseAssert.typeof = (val, type, optDetails) => {
    if (typeof val !== type)
      throw Error(optDetails ? String(optDetails) : 'Expected ' + type);
  };
  baseAssert.fail = (optDetails) => {
    throw Error(optDetails ? String(optDetails) : 'Assert failed');
  };
  baseAssert.equal = (a, b, optDetails) => {
    if (!Object.is(a, b))
      throw Error(optDetails ? String(optDetails) : 'Not equal');
  };
  baseAssert.string = (val, optDetails) =>
    baseAssert.typeof(val, 'string', optDetails);
  baseAssert.note = () => {};
  baseAssert.details = details;
  baseAssert.Fail = Fail;
  baseAssert.quote = quote;
  baseAssert.makeAssert = () => baseAssert;
  baseAssert.error = (optDetails) =>
    Error(optDetails ? String(optDetails) : 'Error');
  baseAssert.makeError = baseAssert.error;
  globalThis.assert = baseAssert;
}

// -- harden polyfill --
// Deep-freeze implementation matching @endo/harden behavior.
// This must be a proper deep-freeze (not just Object.freeze)
// because @endo/pass-style requires deeply frozen objects.
// The @endo/harden in the SES boot bundle's selectHarden()
// picks up globalThis.harden — if this is just Object.freeze,
// all downstream harden calls will be shallow.
if (!globalThis.harden) {
  const visited = new WeakSet();
  const deepFreeze = (obj) => {
    if (Object(obj) !== obj) return obj; // primitive
    if (visited.has(obj)) return obj;
    visited.add(obj);
    Object.freeze(obj);
    const descs = Object.getOwnPropertyDescriptors(obj);
    for (const name of Reflect.ownKeys(descs)) {
      const desc = descs[name];
      if ('value' in desc) {
        deepFreeze(desc.value);
      }
    }
    // NOTE: Do NOT walk prototypes. Freezing built-in prototypes
    // (Object.prototype, Function.prototype, etc.) crashes XS.
    // @endo/harden's makeHardener uses traversePrototypes: false
    // by default, so this matches that behavior.
    return obj;
  };
  globalThis.harden = deepFreeze;
}
// Also set Object[Symbol.for('harden')] so @endo/harden's
// makeHardenerSelector finds the polyfill directly, avoiding
// infinite recursion when it sets globalThis.harden to itself.
if (!Object[Symbol.for('harden')]) {
  Object.defineProperty(Object, Symbol.for('harden'), {
    value: globalThis.harden,
    configurable: false,
    writable: false,
  });
}
