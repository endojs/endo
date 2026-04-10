// @ts-check
/* global process */

import { makeExo } from '@endo/exo';

import { FaeToolInterface } from '../src/fae-tool-interface.js';
import { makeEditFileTool } from '../src/tool-makers.js';

/**
 * FaeTool caplet: edit files (string replace) under a root directory.
 * Root is set at creation time via env.FAE_CWD (default: process.cwd()).
 */
// eslint-disable-next-line no-underscore-dangle
export const make = (_powers, _context, { env = {} }) => {
  const cwd =
    /** @type {Record<string, string | undefined>} */ (env).FAE_CWD ||
    process.cwd();
  const impl = makeEditFileTool(cwd);
  return makeExo('EditFileTool', FaeToolInterface, {
    schema: () => impl.schema(),
    execute: args => impl.execute(args),
    help: () => impl.help(),
  });
};
harden(make);
