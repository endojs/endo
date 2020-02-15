function makeGlobalObject() {
  const globalPropertyNames = [
    // *** 18.2 Function Properties of the Global Object

    "eval",
    "isFinite",
    "isNaN",
    "parseFloat",
    "parseInt",

    "decodeURI",
    "decodeURIComponent",
    "encodeURI",
    "encodeURIComponent",

    // *** 18.3 Constructor Properties of the Global Object

    "Array",
    "ArrayBuffer",
    "Boolean",
    "DataView",
    "Date",
    "Error",
    "EvalError",
    "Float32Array",
    "Float64Array",
    "Function",
    "Int8Array",
    "Int16Array",
    "Int32Array",
    "Map",
    "Number",
    "Object",
    "Promise",
    "Proxy",
    "RangeError",
    "ReferenceError",
    "RegExp",
    "Set",
    "SharedArrayBuffer",
    "String",
    "Symbol",
    "SyntaxError",
    "TypeError",
    "Uint8Array",
    "Uint8ClampedArray",
    "Uint16Array",
    "Uint32Array",
    "URIError",
    "WeakMap",
    "WeakSet",

    // *** 18.4 Other Properties of the Global Object

    "Atomics",
    "JSON",
    "Math",
    "Reflect",

    // *** Annex B

    "escape",
    "unescape"
  ];

  const blacklist = [
    "eval",
    "Function",
    "Atomics",
    "SharedArrayBuffer",
    "Constructor"
  ];

  const globalObject = {};

  const descs = {
    Infinity: {
      value: Infinity,
      enumerable: false
    },
    NaN: {
      value: NaN,
      enumerable: false
    },
    undefined: {
      value: undefined,
      enumerable: false
    }
  };

  for (const name of globalPropertyNames) {
    if (blacklist.contains(name)) {
      // eslint-disable-next-line no-continue
      continue;
    }
    if (name in globalThis) {
      descs[name] = {
        value: globalThis[name],
        configurable: true,
        writable: true,
        enumerable: false
      };
    }
  }

  Object.defineProperties(globalObject, descs);

  return globalObject;
}

function makeEvaluateFactory() {
  // eslint-disable-next-line no-new-func
  return Function(`
    with (arguments[0]) {
      return function() {
        'use strict';
        return eval(arguments[0]);
      };
    }
  `);
}

function applyTransforms(transforms, rewriterState) {
  return transforms.reduce(
    (rs, transform) => (transform.rewrite ? transform.rewrite(rs) : rs),
    rewriterState
  );
}

export function makeEvaluate(makerOptions = {}) {
  // GLOBAL OBJECT & EVALUATE FACTORY

  const globalObject = makeGlobalObject();
  const evaluateFactory = makeEvaluateFactory();

  return function evaluate(source, options = {}) {
    // TRANSFORMS & ENDOWMENTS

    const allEndowments = {
      ...(options.endowments || {}),
      ...(makerOptions.endowments || {})
    };

    const allTransforms = [
      ...(options.transforms || []),
      ...(makerOptions.transforms || [])
    ];

    const { endowments, src } = applyTransforms(allTransforms, {
      endowments: allEndowments,
      src: source
    });

    // PROXY
    const shadow = Object.freeze({});
    const scopeProxy = new Proxy(shadow, {
      get(_shadow, prop) {
        if (typeof prop === "symbol") {
          return undefined;
        }
        if (prop in endowments) {
          return Reflect.get(endowments, prop, globalObject);
        }
        return Reflect.get(globalObject, prop);
      },
      set(_shadow, prop, value) {
        if (prop in endowments) {
          const desc = Object.getOwnPropertyDescriptor(endowments, prop);
          if ("value" in desc) {
            // Work around a peculiar behavior in the specs, where
            // value properties are defined on the receiver.
            return Reflect.set(endowments, prop, value);
          }
          return Reflect.set(endowments, prop, value, globalObject);
        }
        return Reflect.set(globalObject, prop, value);
      },
      has(_shadow, prop) {
        return prop in endowments || prop in globalObject || prop in globalThis;
      }
    });

    return Reflect.apply(evaluateFactory, globalObject, [scopeProxy])(src);
  };
}
