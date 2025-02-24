// Hermes doesn't support native I/O,
// so we concat the SES shim above,
// when running this test on Hermes.

/**
 * Test calling SES lockdown.
 */
const testLockdown = () => {
  lockdown({ legacyHermesTaming: 'unsafe', evalTaming: 'safeEval' });
};

/**
 * TODO: Test creating a new Compartment.
 */
// eslint-disable-next-line no-unused-vars
const testCompartment = () => {
  // eslint-disable-next-line no-unused-vars
  const c = new Compartment();
};

/**
 * TODO: Test Compartment import hook and resolve hook.
 */
// eslint-disable-next-line no-unused-vars
async function testCompartmentHooks() {
  const resolveHook = a => a;

  async function importHook() {
    return {
      imports: [],
      exports: ['meaning'],
      execute(exports) {
        exports.meaning = 42;
      },
    };
  }

  const compartment = new Compartment({}, {}, { resolveHook, importHook });

  const module = compartment.module('.');

  const {
    namespace: { _meaning },
  } = await compartment.import('.');

  assert(module);
}

testLockdown();

// bin/hermes (VM): warning: Direct call to eval(), but lexical scope is not supported.

print(eval(1)); // safeEval: ok
print(eval(1 + 1)); // safeEval: ok

print(eval('1+2')); // safeEval: throw TypeError, unsafeEval: ok

// print(new Function('', 'return 42')); // safeEval: throw TypeError, unsafeEval: ok
// calls make-function-constructor, evaluates a string

// print((() => 42)()); // safeEval: ok
// print(
//   (function () {
//     return 42;
//   })(),
// ); // safeEval: ok

// function c() {
//   const TEST = false;
//   eval('TEST=true');
//   eval('TEST');
//   return TEST;
// }
// print(c()); // false
