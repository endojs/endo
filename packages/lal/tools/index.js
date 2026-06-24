// @ts-check
/**
 * Registry of Endo capability tools exposed to the LLM through pi-agent-core.
 *
 * Tool definitions are grouped into family modules under this directory; each
 * module exports a hardened array of `LalToolDef` records. The shape matches
 * the previous inline `toolDefs` array in `agent.js`; tool dispatch (the
 * single `switch` over tool names) still lives in `agent.js`.
 *
 * Tools are read just-in-time by `agent.js` via the aggregated `tools`
 * array below. To add a new tool: add a record to the appropriate family
 * file (or seed a new family file), then import and spread it here.
 */

/**
 * @typedef {object} LalToolDef
 * @property {string} name
 * @property {string} summary - one-line description sent to the LLM.
 * @property {object} [parameters] - JSON-schema-like shape (for documentation).
 * @property {import('@endo/patterns').Pattern} [params] - `@endo/patterns`
 *   matcher run against the decoded args object before dispatch. Inspired by
 *   `packages/genie/src/tools/common.js`, which uses the same matcher
 *   discipline to validate tool inputs at the `@endo/patterns` layer that
 *   the rest of the Endo capability surface already speaks.
 */

import { metaToolDefs } from './meta.js';
import { petnamesToolDefs } from './petnames.js';
import { mailToolDefs } from './mail.js';
import { fsToolDefs } from './fs.js';
import { codeToolDefs } from './code.js';

/** @type {LalToolDef[]} */
export const tools = harden([
  // Self-documentation, identity, capability help (meta)
  ...metaToolDefs,
  // Directory operations + adopt (petnames)
  ...petnamesToolDefs,
  // Mail operations
  ...mailToolDefs,
  // Filesystem read/write
  ...fsToolDefs,
  // Code evaluation + define
  ...codeToolDefs,
]);
