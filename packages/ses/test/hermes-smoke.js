// Hermes doesn't support native I/O,
// so we concat the SES shim above,
// when running this test on Hermes.

/**
 * Test calling SES lockdown.
 */
const testLockdown = () => {
  lockdown();
  // @ts-expect-error
  // eslint-disable-next-line
  print('SES: lockdown complete ✅');
  // eslint-disable-next-line
  print('TODO: smoke test sanity checks?');
  // TODO: sanity checks on non-standard props
  // constructor ref, pass it a string
  // function FunctionInstance() {}
  // const FunctionInstancePrototype = FunctionInstance.prototype;
  // const ArrowFunctionInstance = () => {};
  // const ArrowFunctionInstancePrototype = ArrowFunctionInstance.prototype;
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
