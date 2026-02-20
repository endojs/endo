// @ts-check
/* global harden, process */

import { makeExo } from '@endo/exo';

import { FaeToolInterface } from '../src/fae-tool-interface.js';
import { makeReadFileTool } from '../src/tool-makers.js';

/**
 * FaeTool caplet: read files under a root directory.
 * Root is set at creation time via env.FAE_CWD (default: process.cwd()).
 */
export const make = (_powers, _context, { env = {} }) => {
  const cwd = env.FAE_CWD || process.cwd();
  const impl = makeReadFileTool(cwd);
  return makeExo('ReadFileTool', FaeToolInterface, {
    schema: () => impl.schema(),
    execute: args => impl.execute(args),
    help: () => impl.help(),
  });
};
harden(make);
