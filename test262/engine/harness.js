import inspect from 'object-inspect';

/* eslint-disable func-names, no-var, no-throw-literal, no-proto, no-underscore-dangle, no-self-compare, prefer-destructuring, prefer-template, vars-on-top */

// from test262/harness/sta.js
// An error class to avoid false positives when testing for thrown exceptions
// A function to explicitly throw an exception using the Test262Error class
function staHarness(_globalObject, _t) {
  function Test262Error(message) {
    this.message = message || '';
  }

  Test262Error.prototype.toString = function() {
    return `Test262Error: ${this.message}`;
  };

  function $ERROR(message) {
    throw new Test262Error(message);
  }

  function $DONOTEVALUATE() {
    throw 'Test262: This statement should not be evaluated.';
  }

  return {
    Test262Error,
    $ERROR,
    $DONOTEVALUATE,
  };
}

// ===
// from test262/harness/assert.js
// Collection of assertion functions used throughout test262
function assertHarness(globalObject, t) {
  const assert = function assert(condition, message) {
    t.ok(condition, message);
  };

  assert._isSameValue = function(a, b) {
    if (a === b) {
      // Handle +/-0 vs. -/+0
      return a !== 0 || 1 / a === 1 / b;
    }

    // Handle NaN vs. NaN
    return a !== a && b !== b;
  };

  assert.sameValue = function(found, expected, message) {
    if (assert._isSameValue(found, expected)) {
      t.pass(message);
    } else {
      const ex = inspect(expected);
      const ac = inspect(found);

      t.fail(
        `${message || ''} operator: sameValue expected: ${ex} actual: ${ac}`,
      );
    }
  };

  assert.notSameValue = function(found, expected, message) {
    if (!assert._isSameValue(found, expected)) {
      t.pass(message);
    } else {
      const ex = inspect(expected);
      const ac = inspect(found);

      t.fail(
        `${message || ''} operator: notSameValue expected: ${ex} actual: ${ac}`,
      );
    }
  };

  assert.throws = function(expectedErrorConstructor, func, message) {
    t.throws(func, expectedErrorConstructor, message);
  };

  return { assert };
}

// ===
// from test262/harness/fnGlobalObject.js
// Produce a reliable global object
function fnGlobalObjectHarness(globalObject, _t) {
  function fnGlobalObject() {
    return globalObject;
  }

  return { fnGlobalObject };
}

// ===
// from test262/harness/doneprintHandle.js
function doneprintHandleHarness(globalObject, t) {
  function __consolePrintHandle__(msg) {
    t.message(msg);
  }

  function $DONE(error) {
    if (error) {
      if (typeof error === 'object' && error !== null && 'name' in error) {
        t.fail(`Test262:AsyncTestFailure: ${error.name}: ${error.message}`);
      } else {
        t.fail(`Test262:AsyncTestFailure:Test262Error: ${error}`);
      }
    } else {
      t.pass('Test262:AsyncTestComplete');
    }
  }

  Object.assign(globalObject, { __consolePrintHandle__, $DONE });
}

// ===
// from test262/harness/propertyHelper.js
// Collection of functions used to safely verify the correctness of
// property descriptors.
function propertyHelperHarness(globalObject, _t) {
  const { assert, $ERROR } = globalObject;

  function isConfigurable(obj, name) {
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    try {
      delete obj[name];
    } catch (e) {
      if (!(e instanceof TypeError)) {
        $ERROR('Expected TypeError, got ' + e);
      }
    }
    return !hasOwnProperty.call(obj, name);
  }

  function isEnumerable(obj, name) {
    var stringCheck = false;

    if (typeof name === 'string') {
      for (var x in obj) {
        if (x === name) {
          stringCheck = true;
          break;
        }
      }
    } else {
      // skip it if name is not string, works for Symbol names.
      stringCheck = true;
    }

    return (
      stringCheck &&
      Object.prototype.hasOwnProperty.call(obj, name) &&
      Object.prototype.propertyIsEnumerable.call(obj, name)
    );
  }

  function isSameValue(a, b) {
    if (a === 0 && b === 0) return 1 / a === 1 / b;
    if (a !== a && b !== b) return true;

    return a === b;
  }

  function isWritable(obj, name, verifyProp, value) {
    var newValue = value || 'unlikelyValue';
    var hadValue = Object.prototype.hasOwnProperty.call(obj, name);
    var oldValue = obj[name];
    var writeSucceeded;

    try {
      obj[name] = newValue;
    } catch (e) {
      if (!(e instanceof TypeError)) {
        $ERROR('Expected TypeError, got ' + e);
      }
    }

    writeSucceeded = isSameValue(obj[verifyProp || name], newValue);

    // Revert the change only if it was successful (in other cases, reverting
    // is unnecessary and may trigger exceptions for certain property
    // configurations)
    if (writeSucceeded) {
      if (hadValue) {
        obj[name] = oldValue;
      } else {
        delete obj[name];
      }
    }

    return writeSucceeded;
  }

  function verifyWritable(obj, name, verifyProp, value) {
    if (!verifyProp) {
      assert(
        Object.getOwnPropertyDescriptor(obj, name).writable,
        'Expected obj[' + String(name) + '] to have writable:true.',
      );
    }
    if (!isWritable(obj, name, verifyProp, value)) {
      $ERROR('Expected obj[' + String(name) + '] to be writable, but was not.');
    }
  }

  function verifyNotWritable(obj, name, verifyProp, value) {
    if (!verifyProp) {
      assert(
        !Object.getOwnPropertyDescriptor(obj, name).writable,
        'Expected obj[' + String(name) + '] to have writable:false.',
      );
    }
    if (isWritable(obj, name, verifyProp)) {
      $ERROR('Expected obj[' + String(name) + '] NOT to be writable, but was.');
    }
  }

  function verifyEnumerable(obj, name) {
    assert(
      Object.getOwnPropertyDescriptor(obj, name).enumerable,
      'Expected obj[' + String(name) + '] to have enumerable:true.',
    );
    if (!isEnumerable(obj, name)) {
      $ERROR(
        'Expected obj[' + String(name) + '] to be enumerable, but was not.',
      );
    }
  }

  function verifyNotEnumerable(obj, name) {
    assert(
      !Object.getOwnPropertyDescriptor(obj, name).enumerable,
      'Expected obj[' + String(name) + '] to have enumerable:false.',
    );
    if (isEnumerable(obj, name)) {
      $ERROR(
        'Expected obj[' + String(name) + '] NOT to be enumerable, but was.',
      );
    }
  }

  function verifyConfigurable(obj, name) {
    assert(
      Object.getOwnPropertyDescriptor(obj, name).configurable,
      'Expected obj[' + String(name) + '] to have configurable:true.',
    );
    if (!isConfigurable(obj, name)) {
      $ERROR(
        'Expected obj[' + String(name) + '] to be configurable, but was not.',
      );
    }
  }

  function verifyNotConfigurable(obj, name) {
    assert(
      !Object.getOwnPropertyDescriptor(obj, name).configurable,
      'Expected obj[' + String(name) + '] to have configurable:false.',
    );
    if (isConfigurable(obj, name)) {
      $ERROR(
        'Expected obj[' + String(name) + '] NOT to be configurable, but was.',
      );
    }
  }

  return {
    verifyWritable,
    verifyNotWritable,
    verifyEnumerable,
    verifyNotEnumerable,
    verifyConfigurable,
    verifyNotConfigurable,
  };
}

/**
 * Attach a test harness to the global object. We use the global object,
 * not the endowments, because test262 looks for the test harness on the
 * global object.
 */
export function injectHarness(globalObject, t) {
  Object.assign(globalObject, staHarness(globalObject, t));
  Object.assign(globalObject, assertHarness(globalObject, t));
  Object.assign(globalObject, fnGlobalObjectHarness(globalObject, t));
  Object.assign(globalObject, doneprintHandleHarness(globalObject, t));
  Object.assign(globalObject, propertyHelperHarness(globalObject, t));
}

/* eslint-enable func-names, no-var, no-throw-literal, no-proto, no-underscore-dangle, no-self-compare, prefer-destructuring, prefer-template, vars-on-top */
