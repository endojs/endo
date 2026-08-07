// @ts-check

import {
  TypeError,
  construct,
  defineProperties,
  globalThis,
} from './commons.js';

/**
 * Tame the host's `URL` constructor into a `Date`-style split: a powered
 * start-compartment binding (`%URL%`) and a powerless shared-compartment
 * binding (`%SharedURL%`).
 *
 * The two constructors share the host's `URL.prototype`, so an instance
 * constructed on either side satisfies `instanceof URL` on the other. The
 * shared binding delegates construction to the host `URL` and exposes only
 * the pure static helpers `parse` and `canParse`; it omits
 * `createObjectURL` and `revokeObjectURL`, the ambient blob-registry
 * authority that ocap discipline forbids from shared compartments.
 *
 * The start-compartment binding keeps the host's full `URL` (including the
 * blob methods) by default, as an ambient authority a host application may
 * legitimately need. The `urlBlobTaming: 'remove'` lockdown option
 * collapses the split so the start compartment also receives the tamed
 * constructor and the blob methods are removed everywhere.
 *
 * On hosts that do not provide `URL` (notably XS), this returns no
 * intrinsics and lockdown proceeds without them, exactly as before.
 *
 * @param {'retain' | 'remove'} [urlBlobTaming]
 */
export default function tameUrlConstructor(urlBlobTaming = 'retain') {
  const OriginalURL = globalThis.URL;
  if (typeof OriginalURL !== 'function') {
    // Host without `URL` (e.g. XS). Nothing to tame; compartments observe
    // its absence exactly as they do today.
    return {};
  }

  const URLPrototype = OriginalURL.prototype;

  // The tamed, powerless `URL`. It delegates construction to the host `URL`
  // (so instances get real internal slots) and shares the host prototype
  // (so `instanceof URL` holds across the compartment boundary). The blob
  // static methods are simply never installed on it.
  // eslint-disable-next-line no-shadow
  const SharedURL = function URL(...rest) {
    if (new.target === undefined) {
      // `URL` is not callable as a plain function on any host either.
      throw TypeError(
        'secure mode Calling %SharedURL% constructor as a function throws',
      );
    }
    return construct(OriginalURL, rest, new.target);
  };

  defineProperties(SharedURL, {
    length: { value: OriginalURL.length },
    prototype: {
      value: URLPrototype,
      writable: false,
      enumerable: false,
      configurable: false,
    },
  });

  // The pure static parse helpers are admitted when the host provides them.
  // Older hosts that lack them are handled by the same skip-when-missing
  // pass that handles `URL` itself.
  if (typeof OriginalURL.parse === 'function') {
    defineProperties(SharedURL, {
      parse: {
        value: OriginalURL.parse,
        writable: true,
        enumerable: false,
        configurable: true,
      },
    });
  }
  if (typeof OriginalURL.canParse === 'function') {
    defineProperties(SharedURL, {
      canParse: {
        value: OriginalURL.canParse,
        writable: true,
        enumerable: false,
        configurable: true,
      },
    });
  }

  // Point the shared prototype's `constructor` at the tamed constructor so
  // that no compartment reaches the powered start-compartment `URL` (which
  // may retain the blob methods) via `URL.prototype.constructor`. This
  // mirrors how `%DatePrototype%.constructor` points at `%SharedDate%`.
  defineProperties(URLPrototype, {
    constructor: { value: SharedURL },
  });

  // Default: the start compartment keeps the host's full `URL`. With
  // `urlBlobTaming: 'remove'`, the split collapses: the start compartment
  // also receives the tamed constructor, so the blob methods are gone
  // everywhere and `URL` is a single binding shared by every compartment.
  const InitialURL = urlBlobTaming === 'remove' ? SharedURL : OriginalURL;

  return {
    '%URL%': InitialURL,
    '%SharedURL%': SharedURL,
  };
}
