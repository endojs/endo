// @ts-check
/**
 * Meta / self-documentation tools: `help` surfaces guest documentation,
 * `locate` returns the endo:// URL for a pet name, and `inspect` resolves
 * a capability and reports its help() text plus method names.
 *
 * @import { Pattern } from '@endo/patterns'
 */

import { M } from '@endo/patterns';
import { NamePathShape, NameOrPathShape } from '@endo/daemon/type-guards.js';

/** @import { LalToolDef } from './index.js' */

/** @type {LalToolDef[]} */
export const metaToolDefs = harden([
  // --- Self-documentation ---
  {
    name: 'help',
    summary:
      'Get documentation for guest capabilities or a specific method. ' +
      'Call with no arguments for an overview, or with a method name for specific documentation.',
    params: M.splitRecord({}, { methodName: M.string() }),
  },

  // --- Identity ---
  {
    name: 'locate',
    summary:
      'Get the locator URL for a pet name. Returns an "endo://..." URL string. ' +
      'Use locate(["@self"]) to get your own locator. ' +
      'Argument: petNamePath (string[]).',
    params: M.splitRecord({ petNamePath: NamePathShape }),
  },

  // --- Capability operations ---
  {
    name: 'inspect',
    summary:
      'Look up a capability by pet name and call its help() method to learn how to use it. ' +
      'Argument: petNameOrPath.',
    params: M.splitRecord({ petNameOrPath: NameOrPathShape }),
  },
]);
