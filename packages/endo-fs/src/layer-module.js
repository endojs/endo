// @ts-check
/**
 * Entry point for formulating a fresh writable `Layer` over an
 * existing `Filesystem` backing as a daemon caplet via
 * `host.makeUnconfined`.
 *
 * Why a module (and not `storeValue(makeLayer(...))` from the
 * client)? The `Layer` cap is a client-side construction with no
 * daemon formula. We need a recipe the daemon can persist and
 * re-instantiate — a module URL + env + powers — so that
 * `storeValue` (via the recipe) has something to point at.
 *
 * Caveat: the layer's writable backing is an in-memory
 * filesystem. The formula itself survives daemon restart, but
 * the layer's *contents* don't — restart-time re-instantiation
 * mints a fresh empty layer. This matches the existing
 * `in-memory-module.js` semantics; on-disk layer state is a
 * follow-up (cf. endo-fs ROADMAP).
 *
 * The composed view (layer ∘ backing as a single Filesystem) is
 * NOT minted here: clients that want it should chain
 *
 *   await E(host).evaluate(
 *     '@node',
 *     'await E(layer).asFilesystem()',
 *     ['layer'],
 *     [layerPetName],
 *     composedViewPetName,
 *   );
 *
 * so the composed view re-derives from the layer on restart.
 *
 * Usage from a host:
 *
 *   await E(host).makeUnconfined('@node', moduleUrl, {
 *     powersName: '@agent',
 *     resultName: 'tmp-layer',
 *     env: { BACKING_NAME: 'tmp' },          // or 'a/b/c'
 *   });
 */

import { E } from '@endo/eventual-send';

import { makeInMemoryFilesystem } from './in-memory.js';
import { makeLayer } from './layer.js';

/**
 * @param {object} powers
 * @param {unknown} _context
 * @param {{ env?: Record<string, string> }} [opts]
 * @returns {Promise<object>} a `Layer` cap (with `asFilesystem`,
 *   `diff`, `apply`, `backing`, `seal`, `help`)
 */
export const make = async (powers, _context, opts = {}) => {
  const env = opts.env || {};
  const backingName = env.BACKING_NAME;
  if (typeof backingName !== 'string' || backingName.length === 0) {
    throw new Error(
      'layer-module: env.BACKING_NAME (pet name of the backing filesystem) is required',
    );
  }
  const segments = backingName.split(/[./]/).filter(Boolean);
  if (segments.length === 0) {
    throw new Error(
      `layer-module: env.BACKING_NAME ${JSON.stringify(backingName)} did not yield any pet-name segments`,
    );
  }
  let capPromise = E(powers).lookup(segments[0]);
  for (let i = 1; i < segments.length; i += 1) {
    capPromise = E(capPromise).lookup(segments[i]);
  }
  const backing = await capPromise;
  const layerFs = makeInMemoryFilesystem();
  return makeLayer(layerFs, backing);
};
harden(make);
