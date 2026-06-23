// @ts-check
/**
 * Code-evaluation tools: `evaluate` runs a snippet directly with endowments
 * the guest names, while `define` proposes a reusable program with named
 * slots for the host to fill.
 *
 * @import { Pattern } from '@endo/patterns'
 */

import { M } from '@endo/patterns';
import { NameOrPathShape } from '@endo/daemon/type-guards.js';

/** @import { LalToolDef } from './index.js' */

/** @type {LalToolDef[]} */
export const codeToolDefs = harden([
  // --- Code evaluation ---
  {
    name: 'evaluate',
    summary:
      'Evaluate JavaScript code directly. Arguments: workerName (string|undefined), ' +
      'source (string), codeNames (string[]), edgeNames (string[]), resultName.',
    // workerName + codeNames + edgeNames are optional in the dispatcher
    // (codeNames/edgeNames default to [] and workerName accepts the
    // "#undefined" SmallCaps sentinel). Allow either undefined or the
    // expected primitive shape.
    params: M.splitRecord(
      { source: M.string(), resultName: NameOrPathShape },
      {
        workerName: M.or(M.string(), M.undefined()),
        codeNames: M.arrayOf(M.string()),
        edgeNames: M.arrayOf(M.string()),
      },
    ),
  },

  // --- Define (code with slots for host to fill) ---
  {
    name: 'define',
    summary:
      'Propose a reusable program with named capability slots for the host to fill. ' +
      'Unlike evaluate(), you do NOT provide the capabilities yourself. ' +
      'Arguments: source (string), slots (object mapping slot name to { label }).',
    params: M.splitRecord({
      source: M.string(),
      slots: M.recordOf(M.string(), M.splitRecord({ label: M.string() })),
    }),
  },
]);
