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
    // Primarily for SwingSet liveslots
    /** @type {never} */ (globalThis[PanicEndowmentSymbol](err));
  } else if (
    globalThis.process &&
    typeof globalThis.process.abort === 'function'
  ) {
    // Primarily for Node
    globalThis.process.abort();
  } else if (
    typeof globalThis.panic === 'function' &&
    panic !== globalThis.panic
  ) {
    // Primarily for Moddable XS.
    //
    // As of this writing,
    // Moddable does not yet provide a host `panic` function. But it
    // expects to provide one initially at `globalThis.panic`.
    // See https://github.com/endojs/endo/pull/2815#issuecomment-2896059277
    // However, we cannot simply detect this and use it if there, since a
    // future upgrade to this package may add a shim that takes the
    // ponyfill's `panic` and puts it at `globalThis.panic`.
    // To avoid this inifinite regress, we also check that the one at
    // `globalThis.panic` is not the one from this instance of the ponyfill.
    // In a Eval Twins scenario, the first to import the shim will cause
    // that shim to install its own `globalThis.panic` from its ponyfill,
    // and then its ponyfill would skip this case. All other instances of this
    // package would then defer to the whose shim ran first.
    globalThis.panic(err);
  }
  // When nothing else worked.
  // See the README.md for why we chose to throw rather than inifite loop.
  throw lastResortError;
};
Object.freeze(panic);

/**
 * @typedef {typeof panic} Panic
 */
