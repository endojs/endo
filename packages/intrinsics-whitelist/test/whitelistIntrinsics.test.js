// Adapted from CoreJS Copyright (c) 2014-2018 Denis Pushkarev.
// This code is governed by the MIT license found in the LICENSE file.
import test from 'tape';
import { captureGlobals } from '@agoric/test262-runner';
import getRootNamedIntrinsics from '@agoric/intrinsics-root-named';
import getRootAnonIntrinsics from '@agoric/intrinsics-root-anonymous';
import whitelistPrototypes from '..';

const {
  assign,
  getPrototypeOf,
  getOwnPropertyNames,
  getOwnPropertySymbols,
} = Object;
const { ownKeys } = Reflect;

test('whitelistPrototypes - on', t => {
  // What to test.
  const globalNames = [
    // *** 18.1 Value Properties of the Global Object

    // Ignore: those value properties are not intrinsics.

    // *** 18.2 Function Properties of the Global Object

    'eval',
    'isFinite',
    'isNaN',
    'parseFloat',
    'parseInt',

    'decodeURI',
    'decodeURIComponent',
    'encodeURI',
    'encodeURIComponent',

    // *** 18.3 Constructor Properties of the Global Object

    'Array',
    'ArrayBuffer',
    'Boolean',
    'DataView',
    'Date',
    'Error',
    'EvalError',
    'Float32Array',
    'Float64Array',
    'Function',
    'Int8Array',
    'Int16Array',
    'Int32Array',
    'Map',
    'Number',
    'Object',
    'Promise',
    'Proxy',
    'RangeError',
    'ReferenceError',
    'RegExp',
    'Set',
    // 'SharedArrayBuffer'  // removed on Jan 5, 2018
    'String',
    'Symbol',
    'SyntaxError',
    'TypeError',
    'Uint8Array',
    'Uint8ClampedArray',
    'Uint16Array',
    'Uint32Array',
    'URIError',
    'WeakMap',
    'WeakSet',

    // *** 18.4 Other Properties of the Global Object

    // 'Atomics', // removed on Jan 5, 2018
    'JSON',
    'Math',
    'Reflect',

    // *** Annex B

    'escape',
    'unescape',

    // ESNext

    'globalThis',
    'Realm',
    'Evaluator',
  ];

  // 1. Prepare a restore point.

  const restore = captureGlobals(globalNames);

  // 2. Create a list of intrinsics to check.

  const namedIntrinsics = getRootNamedIntrinsics();
  const anonIntrinsics = getRootAnonIntrinsics();

  // 3. Create a pseudo plan to represent the original state.

  function populate(source, target) {
    ownKeys(source).forEach(key => {
      if (target[key] === undefined) target[key] = true;
    });
  }

  const origObjects = { __proto__: null };
  for (const name of globalNames) {
    if (global.hasOwnProperty(name)) {
      origObjects[name] = { __proto: null, prototype: { __proto: null } };
      populate(global[name], origObjects[name]);
      if (global[name].hasOwnProperty('prototype')) {
        populate(global[name].prototype, origObjects[name].prototype);
      }
    }
  }

  // 4. Apply the changes to the intrinsics.
debugger;
  console.time();
  whitelistPrototypes({ namedIntrinsics, anonIntrinsics });
  console.timeEnd();

  // 4. Test some values.
  const rootObjects = { Object, Function, Array };
  const rootPlan = {
    Object: {
      assign: true,
      create: true,
      defineProperties: true,
      defineProperty: true,
      entries: true,
      freeze: true,
      // fromEntries: true,
      getOwnPropertyDescriptor: true,
      getOwnPropertyDescriptors: true,
      getOwnPropertyNames: true,
      getOwnPropertySymbols: true,
      getPrototypeOf: true,
      is: true,
      isExtensible: true,
      isFrozen: true,
      isSealed: true,
      keys: true,
      preventExtensions: true,
      seal: true,
      setPrototypeOf: true,
      values: true,

      prototype: {
        '**proto**': true,

        __defineGetter__: true,
        __defineSetter__: true,
        __lookupGetter__: true,
        __lookupSetter__: true,

        constructor: 'Object',
        hasOwnProperty: true,
        isPrototypeOf: true,
        propertyIsEnumerable: true,
        toLocaleString: true,
        toString: true,
        valueOf: true,

        'Symbol.iterator': true,
        'Symbol.toPrimitive': true,
        'Symbol.toStringTag': true,
        'Symbol.unscopables': true,
      },
    },
    Function: {
      name: 'string',
      length: 'number',

      prototype: {
        apply: true,
        bind: true,
        call: true,
        constructor: 'Function',
        toString: true,

        'Symbol.hasInstance': true,
        'Symbol.species': true,
      },
    },
    Array: {
      from: true,
      isArray: true,
      of: true,
      'Symbol.species': true,

      prototype: {
        concat: true,
        copyWithin: true,
        constructor: 'Array',
        entries: true,
        every: true,
        fill: true,
        filter: true,
        find: true,
        findIndex: true,
        forEach: true,
        includes: true,
        indexOf: true,
        join: true,
        keys: true,
        lastIndexOf: true,
        length: 'number',
        map: true,
        pop: true,
        push: true,
        reduce: true,
        reduceRight: true,
        reverse: true,
        shift: true,
        slice: true,
        some: true,
        sort: true,
        splice: true,
        unshift: true,
        values: true,
      },
    },
  };

  const prototypePlan = {
    Object: {
      prototype: {
        toLocaleString: true,
        toString: true,
        valueOf: true,

        'Symbol.iterator': true,
        'Symbol.toPrimitive': true,
        'Symbol.toStringTag': true,
        'Symbol.unscopables': true,
      },
    },
    Function: {
      prototype: {
        name: 'string',
        length: 'number',
      },
    },
  };

  const primitives = ['undefined', 'boolean', 'number', 'string', 'symbol'];
  function compare(path, obj, orig, plan) {
    if (typeof plan === 'string') {
      if (primitives.includes(plan)) {
        // Assert a primitive value.
        t.equal(typeof obj, plan, `Object ${path} should be of path ${plan}`);
        return;
      }
      // eslint-disable-next-line no-prototype-builtins
      if (rootPlan.hasOwnProperty(plan)) {
        // Assert a loop in the object graph.
        t.equal(
          obj,
          rootObjects[plan],
          `Object ${path} should be the global ${plan}`,
        );
        return;
      }
    }

    switch (getPrototypeOf(obj)) {
      case null:
      case undefined:
        if (plan === true) {
          t.fail(`Object ${path} should have a prototype.`);
        }
        return;
      case Function.prototype:
        plan = assign({}, prototypePlan.Function.prototype, plan);
        break;
      case Object.prototype:
        plan = assign({}, prototypePlan.Object.prototype, plan);
        break;
      default:
        if (plan === true) {
          t.fail(`Object ${path} should have a whitelisted prototype.`);
        }
        return;
    }

    // Object should not have extra property names.
    const propNames = getOwnPropertyNames(obj);
    const planNames = getOwnPropertyNames(plan)
      .filter(prop => !prop.startsWith('Symbol.')) // exclude symbols
      .map(prop => (prop === '**proto**' ? '__proto__' : prop));
    const extraNames = propNames.filter(prop => !planNames.includes(prop));
    t.deepEqual(
      extraNames,
      [],
      `Object ${path} should not have extra named properties`,
    );

    // Object should not have missing property names.
    const origNames = getOwnPropertyNames(orig);
    const missing = origNames.filter(
      prop => planNames.includes(prop) && !propNames.includes(prop),
    );
    t.deepEqual(missing, [], `Object ${path} should not miss named properties`);

    // Object should not have extra property symbols.
    const propSymbols = getOwnPropertySymbols(obj).map(
      // Convert symbols to string, an remove the Symbol() wrapper.
      prop => (typeof prop === 'symbol' ? prop.toString().slice(7, -1) : prop),
    );
    const planSymbols = getOwnPropertyNames(plan).filter(
      prop => prop.startsWith('Symbol.'), // only symbols
    );
    const extraSymbols = propSymbols.filter(
      prop => !planSymbols.includes(prop),
    );
    t.deepEqual(
      extraSymbols,
      [],
      `Object ${path} should not have extra symbol properties`,
    );

    // Todo missing.
    const props = ownKeys(obj);
    for (const name of ownKeys(plan)) {
      const desc = Object.getOwnPropertyDescriptor(obj, name);
      if (!desc) {
        // Missing property.
        continue;
      }
      if (desc.get || desc.set) {
        // Accessor property.
        t.fail(`Object ${path} should not have an accessor ${name}.`);
        continue;
      }
      if (props.includes(name)) {
        compare(`${path}.${name}`, desc.value, orig[name], plan[name]);
      }
    }
  }

  compare('root', rootObjects, origObjects, rootPlan);

  restore();
  t.end();
});
