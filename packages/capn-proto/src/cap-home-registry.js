// @ts-check
/**
 * Network-wide map from a Presence we hold to "which peer hosts the
 * underlying capability". Populated by every connection's import
 * registry as it manufactures presences for incoming `senderHosted` /
 * `senderPromise` capability descriptors. Consulted by the encode side
 * of the payload codec when it's about to ship a capability to a
 * different peer.
 *
 * If the encode-side peer matches the home peer the codec emits the
 * usual `receiverHosted` pass-back. If the encode-side peer is a
 * different peer (and one we have a connection to) the codec triggers
 * the L3 auto-Provide flow: send `Provide` on the home's connection,
 * allocate a vine, and emit `thirdPartyHosted` instead of
 * `senderHosted`. The recipient's existing `acceptThirdParty` then
 * dials the home directly.
 *
 * The map is `WeakMap`-keyed so it doesn't keep presences alive — when
 * the user drops a Presence, the import-side FinalizationRegistry can
 * still fire and Release the export on the host.
 *
 * Implementation parallels the pattern used by `@endo/ocapn`'s
 * `grant-tracker.js` — same shape, same `WeakMap<presence, details>`.
 */

import harden from '@endo/harden';

/**
 * @typedef {object} CapHome
 * @property {any} hostConnection  The `makeCapnp` peer that exports the cap.
 * @property {number} hostImportId The import id this presence carries on
 *   that peer's connection — i.e. the value the host's ImportRegistry
 *   yields for `importIdOf(presence)`. (`importIdOf` lives on the import
 *   registry / connection, not on the InterfaceRegistry.)
 */

export const makeCapHomeRegistry = () => {
  /** @type {WeakMap<object, CapHome>} */
  const presenceToHome = new WeakMap();

  return harden({
    /**
     * Record where a freshly-imported Presence came from. Idempotent —
     * a re-import of the same id (which our import registry collapses
     * to the same Presence object) just overwrites with the same value.
     *
     * @param {object} presence
     * @param {any} hostConnection
     * @param {number} hostImportId
     */
    register: (presence, hostConnection, hostImportId) => {
      presenceToHome.set(presence, { hostConnection, hostImportId });
    },
    /**
     * Look up the home for a presence. Returns `undefined` if the
     * presence is locally hosted (i.e. created in this vat, not imported
     * from any peer this network knows about).
     *
     * @param {unknown} value
     * @returns {CapHome | undefined}
     */
    find: value => presenceToHome.get(/** @type {object} */ (value)),
  });
};
