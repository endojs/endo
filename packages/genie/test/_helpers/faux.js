// @ts-check

/**
 * Faux LLM provider test helper.
 *
 * Tests that drive `dev-repl.js` (or the genie agent in general) need
 * a deterministic LLM stand-in: the real `ollama/llama3.2` path mis-
 * quotes argv, never invokes the bash tool, or simply isn't reachable
 * on CI.  `pi-ai` already ships a `faux` provider whose
 * `setResponses([...])` queues the assistant messages the agent will
 * see on successive turns.
 *
 * This module is the test-side wrapper that makes the faux provider
 * usable across the **child-process boundary** the dev-repl test
 * spawns.  The faux provider lives in a per-process registry, so a
 * registration in the AVA parent is invisible to the dev-repl child.
 * The workaround is to write the registration as an ESM module to a
 * temporary file, hand the path to the child via the
 * `GENIE_FAUX_SCRIPT` env var, and let `dev-repl.js` dynamically
 * import it on startup.
 *
 * The script module's default export is an `install()` function that:
 *   1. Calls `registerFauxProvider({ api, provider, models })`.
 *   2. Queues steps with `setResponses([…])`.
 *   3. Returns the `Model<…>` object to use as the agent's model.
 *
 * `dev-repl.js` passes that object straight into `makePiAgent` via
 * the `model:` option, bypassing the provider/modelId string parser
 * entirely.
 *
 * The script source is supplied to `writeFauxScriptModule` as a
 * template string — function-valued faux factory steps can't be
 * marshaled across a child-process boundary, so the script has to be
 * self-contained source rather than a closure captured in the
 * parent.  Factory steps declared **inside** the script can still
 * inspect `context.messages` to branch on the previous tool result.
 *
 * Sub-task of `TODO/61_genie_faux_llm_integration_test.md`.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/**
 * Write a `.mjs` module containing the supplied source to
 * `<dir>/<fileName>` and return the absolute path.  The caller is
 * responsible for keeping `dir` alive long enough for the dev-repl
 * child to import the file (typically a `mkdtemp` directory with a
 * `t.teardown(() => fs.rm(dir, …))`).
 *
 * @param {object} options
 * @param {string} options.dir - Directory to write the module in.
 *   Must already exist.
 * @param {string} options.source - Module source code.  The module
 *   must `export default` an `install()` function returning the
 *   `Model<…>` object the dev-repl should use.
 * @param {string} [options.fileName] - File name within `dir`.
 *   Defaults to `genie-faux-script.mjs`.
 * @returns {Promise<string>} The absolute path to the written file.
 */
export const writeFauxScriptModule = async ({
  dir,
  source,
  fileName = 'genie-faux-script.mjs',
}) => {
  const path = join(dir, fileName);
  await fs.writeFile(path, source);
  return path;
};
