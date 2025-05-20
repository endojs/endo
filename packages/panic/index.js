/* global globalThis */

// Modeled on `PassStyleOfEndowmentSymbol` of `@endo/pass-style`.
export const PanicEndowmentSymbol = Symbol.for('@endo panic');

/**
 * Last resort fallback that violates the `panic` spec by throwing rather
 * than immediately exiting, throws this `lastResortError`.
 * To help prospective catchers to,
 * reliably-enough, distinguish this caught error from other errors,
 * we add a property
 * named by the `PanicEndowmentSymbol` registered symbol. We use a
 * registered symbol rather than a novel subclass of Error to avoid
 * [Eval Twin Problems](https://github.com/endojs/endo/issues/1583).
 * However, as a necessary price for avoiding Eval Twim Problems, this
 * marking is forgeable -- anyone can create and throw a similar error.
 *
 * We also export this error so that importers can use it as an identity check.
 * This is not forgeable, i.e., not give false positives, but due to the
 * Eval Twin Problem, may produce falso negatives. Use this identity check
 * with caution.
 */
export const lastResortError = ReferenceError('Should have already exited');
lastResortError[PanicEndowmentSymbol] = 'Should have already exited';
Object.freeze(lastResortError);

/**
 * Ponyfill the `panic` function of the
 * [Don't Remember Panicking](https://github.com/tc39/proposal-oom-fails-fast)
 * tc39 proposal.
 *
 * @param {Error} [err]
 * @returns {never}
 */
export const panic = (err = RangeError('Panic')) => {
  if (globalThis.console && typeof globalThis.console.error === 'function') {
    globalThis.console.error('Panic', err);
  } else {
    // TODO use Moddable XS print function if we can reliably distinguish it
    // from `print` in browsers.
  }

  if (typeof globalThis[PanicEndowmentSymbol] === 'function') {
    /** @type {never} */ (globalThis[PanicEndowmentSymbol](err));
  } else if (
    globalThis.process &&
    typeof globalThis.process.abort === 'function'
  ) {
    globalThis.process.abort();
  } else {
    // TODO Once Moddable provides a host `panic` function, use that here.
  }
  throw lastResortError;
};
Object.freeze(panic);

/**
 * @typedef {typeof panic} Panic
 */
