import { X, makeError, errorNote } from '@endo/errors';

/**
 * Given an error `innerErr` and a `label`, throws a similar
 * error whose message string is `${label}: ${innerErr.message}`.
 * See `applyLabelingError` for the motivating use.
 *
 * @param {Error} innerErr
 * @param {string|number} label
 * @param {ErrorConstructor=} ErrorConstructor
 * @returns {never}
 */
export const throwLabeled = (innerErr, label, ErrorConstructor = undefined) => {
  if (typeof label === 'number') {
    label = `[${label}]`;
  }
  const outerErr = makeError(`${label}: ${innerErr.message}`, ErrorConstructor);
  errorNote(outerErr, X`Caused by ${innerErr}`);
  throw outerErr;
};
harden(throwLabeled);
