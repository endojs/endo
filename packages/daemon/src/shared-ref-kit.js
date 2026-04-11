// @ts-check

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeDotMembraneKit } from '@endo/marshal';

/** @import { Passable } from '@endo/pass-style' */

/**
 * Method guards shared by every SharedRef controller. Kind-specific
 * controllers may spread these into their own interface shape alongside
 * additional attenuator methods.
 */
export const SharedRefBaseMethodGuards = harden({
  help: M.call().optional(M.string()).returns(M.string()),
  revoke: M.call().optional(M.string()).returns(M.promise()),
  isLive: M.call().returns(M.boolean()),
  getLabel: M.call().returns(M.string()),
  getKind: M.call().returns(M.string()),
});

export const SharedRefControllerInterface = M.interface(
  'SharedRefController',
  SharedRefBaseMethodGuards,
);
harden(SharedRefControllerInterface);

/**
 * Build the base method record for a SharedRef controller. Typed
 * controllers spread these into their own method record alongside
 * kind-specific attenuators so that every share exposes a uniform
 * revoke / isLive / label surface.
 *
 * @param {object} opts
 * @param {string} opts.kind - namespace of the share ('channel-invitation', 'opaque', etc.)
 * @param {string} opts.label - human-readable label
 * @param {() => boolean} opts.isLive
 * @param {(reason?: string) => void | Promise<void>} opts.revoke
 * @param {string} [opts.helpText]
 */
export const makeSharedRefBaseMethods = ({
  kind,
  label,
  isLive,
  revoke,
  helpText,
}) =>
  harden({
    help: () =>
      helpText ||
      `SharedRef [${kind}] ${label}\n` +
        `  revoke([reason])  destroy this share (one-way)\n` +
        `  isLive()          true if not yet revoked\n` +
        `  getLabel()        human label\n` +
        `  getKind()         share kind`,
    revoke: async reason => revoke(reason),
    isLive: () => isLive(),
    getLabel: () => label,
    getKind: () => kind,
  });
harden(makeSharedRefBaseMethods);

/**
 * One-shot helper for the generic case: wrap any passable in a
 * dot-membrane proxy and pair it with a plain controller. The
 * caller hands `shared` to recipients and keeps `controller` to
 * revoke later.
 *
 * Typed shares (e.g. channel invitations) should build their own
 * typed exos and call `makeSharedRefBaseMethods` directly to get
 * the standard controller methods.
 *
 * @param {Passable} target
 * @param {{ kind: string, label: string }} opts
 */
export const makeSharedRefKit = (target, { kind, label }) => {
  const membrane = makeDotMembraneKit(target);
  let live = true;
  const revoke = reason => {
    if (!live) return;
    live = false;
    membrane.revoke(reason || 'revoked');
  };
  const isLive = () => live;
  const controller = makeExo(
    'SharedRefController',
    SharedRefControllerInterface,
    makeSharedRefBaseMethods({ kind, label, isLive, revoke }),
  );
  return harden({ shared: membrane.proxy, controller });
};
harden(makeSharedRefKit);
