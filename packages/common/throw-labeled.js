import { X, makeError, annotateError } from '@endo/errors';

const { defineProperty } = Object;

/**
 * Given an error `innerErr` and a `label`, throws a similar
 * error whose message string is `${label}: ${innerErr.message}`.
 * See `applyLabelingError` for the motivating use.
 *
 * @param {Error} innerErr
 * @param {string|number} label
 * @param {import('ses').GenericErrorConstructor} [errConstructor]
 * @param {import('ses').AssertMakeErrorOptions} [options]
 * @returns {never}
 */
export const throwLabeled = (
  innerErr,
  label,
  errConstructor = undefined,
  options = undefined,
) => {
  if (typeof label === 'number') {
    label = `[${label}]`;
  }
  const outerErr = makeError(
    `${label}: ${innerErr.message}`,
    errConstructor,
    options,
  );
  annotateError(outerErr, X`Caused by ${innerErr}`);
  throw outerErr;
};
defineProperty(throwLabeled, 'name', {
  value: '__HIDE_throwLabeled__',
});
harden(throwLabeled);
