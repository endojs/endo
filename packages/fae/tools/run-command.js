// @ts-check
/* global harden, process */

import { makeExo } from '@endo/exo';

import { FaeToolInterface } from '../src/fae-tool-interface.js';
import { makeRunCommandTool } from '../src/tool-makers.js';

/**
 * FaeTool caplet: run shell commands with cwd as root.
 * Root is set at creation time via env.FAE_CWD (default: process.cwd()).
 */
export const make = (_powers, _context, { env = {} } = {}) => {
  const cwd =
    /** @type {Record<string, string | undefined>} */ (env).FAE_CWD ||
    process.cwd();
  const impl = makeRunCommandTool(cwd);
  return makeExo('RunCommandTool', FaeToolInterface, {
    schema: () => impl.schema(),
    execute: args => impl.execute(args),
    help: () => impl.help(),
  });
};
harden(make);
