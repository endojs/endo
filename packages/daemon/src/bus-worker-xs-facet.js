// @ts-check

/**
 * The XS worker's `EndoWorkerFacetForDaemon` — the object the daemon
 * drives over CapTP.
 *
 * Split out of `./bus-worker-xs.js` so it can be exercised directly.
 * That module is a bootstrap: importing it calls
 * `hostGetDaemonHandle()` and installs `globalThis.handleCommand`,
 * both of which need the Rust host functions, so nothing can import
 * it under Node to test it.  This module needs no host powers and no
 * transport, so `test/xs-worker-facet.test.js` covers it under
 * Node/ava while the bootstrap keeps only its wiring.
 *
 * The reference implementation is `./worker.js`'s `makeWorkerFacet`;
 * where behavior can match it, it does, and the comments name the
 * places it deliberately cannot.
 */

import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

import { WorkerFacetForDaemonInterface } from './worker-facet-interface.js';

/**
 * Standard endowments provided to evaluated code in Compartments.
 *
 * `undefined` values are dropped rather than endowed: XS does not
 * ship every Web API this list names (`URL`, notably), and a global
 * bound to `undefined` reads as "present but broken" to guest code,
 * where an absent binding is a plain `ReferenceError` naming what is
 * missing.
 */
export const standardEndowments = harden(
  Object.fromEntries(
    Object.entries({
      assert: globalThis.assert,
      console: globalThis.console,
      E,
      Far,
      makeExo,
      M,
      TextEncoder: globalThis.TextEncoder,
      TextDecoder: globalThis.TextDecoder,
      URL: globalThis.URL,
    }).filter(([_k, v]) => v !== undefined),
  ),
);

/**
 * Install `globals` on a compartment's `globalThis`.
 *
 * SES's `Compartment` takes endowments as a constructor argument; XS's
 * native `Compartment` ignores that argument and resolves globals off
 * `compartment.globalThis`, so the same code has to install them
 * explicitly to work against either runtime.
 *
 * The own-property test matters: `name in compartment.globalThis`
 * walks the prototype chain, so an endowment named `toString`,
 * `constructor`, or `valueOf` would look already-present and be
 * silently dropped.  A name already bound to the intended value (the
 * SES path, where the constructor argument did the work) is skipped;
 * a genuine collision throws rather than substituting the
 * compartment's own global for the caller's endowment.
 *
 * @param {{ globalThis: object }} compartment
 * @param {Record<string, unknown>} globals
 */
export const endowCompartment = (compartment, globals) => {
  for (const [name, value] of Object.entries(globals)) {
    const existing = Object.getOwnPropertyDescriptor(
      compartment.globalThis,
      name,
    );
    const alreadyBound =
      existing !== undefined && 'value' in existing && existing.value === value;
    if (!alreadyBound) {
      try {
        Object.defineProperty(compartment.globalThis, name, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      } catch (cause) {
        throw new Error(
          `Cannot endow ${name}: it collides with a non-configurable compartment global`,
          { cause },
        );
      }
    }
  }
};
harden(endowCompartment);

/**
 * @param {object} powers
 * @param {() => void} powers.markShouldTerminate - asks the Rust main
 *   loop to exit after the current command.
 */
export const makeXsWorkerFacet = ({ markShouldTerminate }) =>
  makeExo('EndoWorkerFacetForDaemon', WorkerFacetForDaemonInterface, {
    // Unlike `./worker.js`, which cancels a whole Node process's
    // vat, this only raises the flag the Rust main loop polls; any
    // in-flight `evaluate` runs to completion first.
    terminate: async () => {
      markShouldTerminate();
    },

    /**
     * @param {string} source
     * @param {readonly string[]} codeNames
     * @param {readonly import('@endo/pass-style').Passable[]} endowmentValues
     * @param {string} id
     * @param {PromiseLike<any>} cancelled
     */
    evaluate: async (source, codeNames, endowmentValues, id, cancelled) => {
      // Precedence follows `./worker.js`'s `evaluate`: the caller's
      // named endowments come last and so may shadow both the
      // standard endowments and `$id` / `$cancelled`.
      const globals = harden({
        ...standardEndowments,
        $id: id,
        $cancelled: cancelled,
        ...Object.fromEntries(
          codeNames.map((name, index) => [name, endowmentValues[index]]),
        ),
      });
      const compartment = new Compartment(globals);
      endowCompartment(compartment, globals);
      return compartment.evaluate(source);
    },

    // The three `make*` methods below are the XS worker's remaining
    // gap against the Node worker (`./worker.js`).  `evaluate` is the
    // only entry point the restored bootstrap needs; closing the rest
    // is planned and tracked as an explicit item in
    // `designs/worker-rust-xs.md` § Known Gaps, which names the route
    // for each.  Until then each rejects with a message that says so,
    // rather than failing obscurely deeper in the guest.

    /**
     * Planned: mirror `./worker.js`'s `makeArchive` — drain the
     * readable, then `parseArchive` + `application.import`.  Blocked
     * on `@endo/compartment-mapper`'s archive parser running under the
     * `xs` condition (its Node-only parser set must not be retained).
     *
     * @param {unknown} _readableP
     * @param {unknown} _powersP
     * @param {unknown} _contextP
     * @param {Record<string, string>} _env
     */
    makeArchive: async (_readableP, _powersP, _contextP, _env) => {
      throw new Error(
        'makeArchive not yet implemented in XS worker; see designs/worker-rust-xs.md § Known Gaps',
      );
    },

    /**
     * Planned: mirror `./worker.js`'s `makeFromTree` — walk the tree's
     * `compartment-map.json`, pack a ZIP, reuse the `makeArchive`
     * path.  Follows `makeArchive` and additionally needs
     * `@endo/zip`'s writer under XS.
     *
     * @param {unknown} _treeP
     * @param {unknown} _powersP
     * @param {unknown} _contextP
     * @param {Record<string, string>} _env
     */
    makeFromTree: async (_treeP, _powersP, _contextP, _env) => {
      throw new Error(
        'makeFromTree not yet implemented in XS worker; see designs/worker-rust-xs.md § Known Gaps',
      );
    },

    /**
     * Planned: the Node worker's `makeUnconfined` is a dynamic
     * `import()` of a host path, which XS has no equivalent for.  The
     * XS route is a host function that reads the module source via
     * cap-std and compiles it as a `ModuleSource`
     * (`designs/worker-rust-xs.md` § Module Loading, item 3).
     *
     * @param {string} _specifier
     * @param {unknown} _powersP
     * @param {unknown} _contextP
     * @param {Record<string, string>} _env
     */
    makeUnconfined: async (_specifier, _powersP, _contextP, _env) => {
      throw new Error(
        'makeUnconfined not yet implemented in XS worker; see designs/worker-rust-xs.md § Known Gaps',
      );
    },
  });
harden(makeXsWorkerFacet);
