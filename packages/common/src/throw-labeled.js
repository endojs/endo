const { details: X } = assert;

/**
 * @param {Error} innerErr
 * @param {string|number} label
 * @param {ErrorConstructor=} ErrorConstructor
 * @returns {never}
 */
export const throwLabeled = (innerErr, label, ErrorConstructor = undefined) => {
  if (typeof label === 'number') {
    label = `[${label}]`;
  }
  const outerErr = assert.error(
    `${label}: ${innerErr.message}`,
    ErrorConstructor,
  );
  assert.note(outerErr, X`Caused by ${innerErr}`);
  throw outerErr;
};
harden(throwLabeled);
