// @ts-check
/* eslint-disable no-continue */

/**
 * Tool Construction Utilities
 *
 * This module provides `makeTool`, the standard factory for creating named
 * `Tool` objects.  A *tool-maker* module (e.g. `filesystem.js`) calls
 * `makeTool` once per tool and returns the resulting set of named tools
 * from its own maker function.
 *
 * ## Conventions
 *
 * ### Maker functions return a record of Tools
 *
 * Each tool-domain module exports a maker function (e.g. `makeFileTools`)
 * that accepts configuration options and returns a hardened record whose
 * values are `Tool` objects produced by `makeTool`:
 *
 * ```js
 * const makeFileTools = (options = {}) => {
 *   const readFile  = makeTool('readFile',  { help, schema, execute });
 *   const writeFile = makeTool('writeFile', { help, schema, execute });
 *   return harden({ readFile, writeFile });
 * };
 * ```
 *
 * ### The `help` generator function
 *
 * Each tool spec includes a `help` property — a generator function that
 * yields successive lines of documentation.  The first yielded line
 * **must** be a concise, plain-English description of what the tool does.
 * Do **not** repeat the tool name in this line; it is already known from
 * the tool's key in the record.
 *
 * Subsequent lines may describe parameters, examples, and caveats using
 * Markdown formatting.  Blank lines (`yield ''`) separate sections.
 *
 * ```js
 * help: function*() {
 *   yield 'Reads file contents.';             // first line: description
 *   yield '';
 *   yield '**Parameters:**';
 *   yield '- `path`: Path to file (required)';
 * },
 * ```
 *
 * `makeTool` joins the yielded lines into a single string for the
 * `help()` method and derives a short `desc()` from the first line when
 * no explicit `desc` is provided.
 */

import harden from '@endo/harden';
import { M, mustMatch, getMethodGuardPayload } from '@endo/patterns';

/** @import { InterfaceGuard, MethodGuard } from '@endo/patterns' */

/**
 * @typedef {object} ToolSpec
 * @property {() => Iterable<string>} help
 * @property {() => string} [desc]
 * @property {MethodGuard} schema
 */

/**
 * @typedef {object} Tool
 * @property {() => string} help
 * @property {() => string} [desc]
 * @property {InterfaceGuard} schema
 * @property {(args: any) => Promise<any>} execute
 */

/**
 * Create a hardened `Tool` from a name and specification.
 *
 * The returned object exposes `help()`, `desc()`, `schema`, and
 * `execute` and is suitable for inclusion in the record returned by a
 * maker function.
 *
 * @param {string} name
 * @param {ToolSpec & {execute: (args: any) => Promise<any>}} spec
 * @returns {Tool}
 */
export const makeTool = (name, { execute, ...spec }) => {
  const {
    help,
    desc = () => {
      const [first] = help();
      return first ? first.split('\n')[0] : '';
    },
    schema,
  } = spec;

  // Pre-compute the params pattern from the MethodGuard for per-call
  // validation, following the same approach as @endo/exo.
  const {
    argGuards,
    optionalArgGuards = [],
    restArgGuard,
  } = getMethodGuardPayload(schema);
  const paramsPattern = M.splitArray(
    argGuards,
    optionalArgGuards,
    restArgGuard,
  );

  return harden({
    help() {
      return Array.from(help()).join('\n');
    },
    desc,
    schema: M.interface(name, {
      help: M.call().returns(M.string()),
      desc: M.call().returns(M.string()),
      execute: schema,
    }),
    async execute(args) {
      let didUnJSON = false;
      for (;;) {
        try {
          mustMatch(harden([args]), paramsPattern, `${name} args`);
          break;
        } catch (err) {
          const message = `${err?.message}`;
          if (typeof args === 'object') {
            const null2undef = /args:.* ([^ ]+?)\?: null.*/.exec(message);
            if (null2undef !== null) {
              const key = null2undef[1];
              if (Object.hasOwn(args, key) && args[key] === null) {
                args = { ...args, ...{ [key]: undefined } };
                continue;
              }
            }

            // try to fixup by parsing nested JSON values
            if (!didUnJSON) {
              didUnJSON = true;
              for (const [key, val] of Object.entries(
                /** @type {Record<string, any>} */ (args),
              )) {
                if (typeof val === 'string') {
                  try {
                    args = { ...args, ...{ [key]: JSON.parse(val) } };
                  } catch {
                    continue;
                  }
                }
              }
              continue;
            }
          }

          // fallthrough: no fixup, final throw to caller
          throw err;
        }
      }

      return execute(args);
    },
  });
};
harden(makeTool);
