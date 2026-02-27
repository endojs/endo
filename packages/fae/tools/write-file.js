// @ts-check
/* global process */

import { makeExo } from '@endo/exo';

import { FaeToolInterface } from '../src/fae-tool-interface.js';
import { makeWriteFileTool } from '../src/tool-makers.js';

/**
 * FaeTool caplet: write files under a root directory.
 * Root is set at creation time via env.FAE_CWD (default: process.cwd()).
 */
export const make = (_powers, _context, { env = {} }) => {
  const cwd = env.FAE_CWD || process.cwd();
  const impl = makeWriteFileTool(cwd);
  return makeExo('WriteFileTool', FaeToolInterface, {
    schema: () => impl.schema(),
    execute: args => impl.execute(args),
    help: () => impl.help(),
  });
};
harden(make);
