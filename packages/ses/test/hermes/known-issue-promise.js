/* global test */
/* global repairIntrinsics */
test('knonw issue: Hermes Promise is non-standard', () => {
  const dumbPolyfillExposedInternals = Object.entries(Promise).filter(entry => {
    return !!entry[1] && entry[0].startsWith('_');
  });

  repairIntrinsics({
    evalTaming: 'unsafe-eval',
    errorTaming: 'unsafe-debug',
    overrideTaming: 'severe',
    reporting: 'none',
  });

  // Uncomment to see what the polyfill exposes
  // console.log(dumbPolyfillExposedInternals);

  try {
    Promise.resolve({});
  } catch (e) {
    assert(
      e.message.includes("Promise constructor's argument is not a function"),
      'Hermes uses a broken polyfill for Promise intrnally. If you see this assertion fail, it must have been fixed',
    );
  }

  Object.assign(Promise, Object.fromEntries(dumbPolyfillExposedInternals));

  try {
    Promise.resolve({});
  } catch (e) {
    assert.fail(
      'Existing workaround for broken Promise in Hermes stopped working',
    );
  }
});
