// Hermes doesn't support native I/O,
// so we concat the SES shim above,
// when running this test on Hermes.

/**
 * Test calling SES lockdown.
 */
const testLockdown = () => {
  lockdown({ evalTaming: 'no-eval' });
};

testLockdown();
