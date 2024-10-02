// Hermes doesn't support native I/O,
// so we concat the SES shim above,
// when running this test on Hermes.

/**
 * Test calling SES lockdown.
 */
const testLockdown = () => {
  lockdown();
  try {
    // eslint-disable-next-line no-new-func
    new Function(
      'return (async function* AsyncGeneratorFunctionInstance() {})',
    )();
  } catch (e) {
    // @ts-expect-error
    // eslint-disable-next-line
    print('SES: lockdown complete');
  }
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

// testCompartment();

// testCompartmentHooks();
