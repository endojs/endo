/**
 * Wraps a function with an isolated endo daemon, caveat:
 * - does not actually create an isolated endo daemon
 * - until above is remedied, should not be used concurrently
 *
 * TODO reuse daemon/test/endo.test.js:prepareConfig for setup
 *
 * @param {*} execa
 * @param {() => Promise<void>} implementation
 * @returns {Promise<void>}
 */
export const withContext = async (execa, implementation) => {
  try {
    await execa`endo purge -f`;
    await execa`endo restart`;
    await implementation();
  } finally {
    await execa`endo purge -f`;
    await execa`endo stop`;
  }
};
