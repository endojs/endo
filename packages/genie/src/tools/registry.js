// @ts-check

/**
 * Tool Registry Helper
 *
 * Provides config-dirven tool-construction boilerplate.
 *
 * `exec` and `git` remain registered here as *example attenuations*:
 * they demonstrate how to grant narrower-than-`bash` shell access
 * via `makeCommandTool`, and can be enabled by future deployments
 * (e.g. a read-only or git-only guest) via the `include` list
 * without duplicating this wiring.
 *
 * The registry does not (yet) try to abstract over tool allow-lists by guest
 * identity or pluggable policies.
 * The `git` policy closure below is deliberately hard-coded.
 */

import harden from '@endo/harden';

import { bash, exec, makeCommandTool } from './command.js';
import { makeFileTools } from './filesystem.js';
import { makeMemoryTools } from './memory.js';
import { webFetch } from './web-fetch.js';
import { webSearch } from './web-search.js';

/** @import { Tool } from './common.js' */
/** @import { SearchBackend } from './memory.js' */
/** @import { ERef } from '@endo/eventual-send' */

/**
 * Capability shape the registry hands down to `makeCommandTool`.  The
 * full shape lives in `@endo/sandbox/src/types.d.ts` (`SandboxHandle`);
 * the tool layer only ever calls `spawn(argv, opts)` against it, so we
 * type the field structurally here to avoid pulling `@endo/sandbox`
 * into the genie package's dependency graph.  Sub-task 35 of
 * `TODO/35_endo_genie_sandbox_tool_spawn.md` is the consumer.
 *
 * @typedef {ERef<{
 *   spawn: (argv: string[], opts?: object) => Promise<unknown>
 * }>} SandboxSlice
 */

/**
 * A group of tools that can be toggled on or off via the `include`
 * option on {@link buildGenieTools}.
 *
 * `'web'` is a convenience alias that expands to both `'webFetch'`
 * and `'webSearch'`.
 *
 * @typedef {(
 * | 'bash'
 * | 'exec'
 * | 'git'
 * | 'files'
 * | 'memory'
 * | 'web'
 * | 'webFetch'
 * | 'webSearch'
 * )} GenieToolGroup
 */

/**
 * The plugin-default include list.
 *
 * `exec` and `git` are intentionally absent; they live in the registry as
 * example attenuations demonstrating narrower-than-bash command access, and
 * are not enabled by default for the daemon-hosted genie.
 *
 * @type {readonly GenieToolGroup[]}
 */
export const PLUGIN_DEFAULT_INCLUDE = harden([
  'bash',
  'files',
  'memory',
  'webFetch',
  'webSearch',
]);

/**
 * @typedef {object} MemoryToolBundle
 * @property {Tool} memoryGet
 * @property {Tool} memorySet
 * @property {Tool} memorySearch
 * @property {Promise<void>} indexing - Resolves after the initial
 *   index seed pass completes.  Callers can `await` this before
 *   issuing the first prompt to avoid racing against indexing.
 */

/**
 * @typedef {object} GenieTools
 * @property {Record<string, Tool>} tools
 *   - Named tool record to be plumbed into `makePiAgent` via `listTools` / `execTool`.
 *     Only actual tools appear here (no `indexing` promise, etc.).
 * @property {() => Array<{ name: string, summary: string }>} listTools
 *   - Matches the `ToolSpec` shape expected by `makePiAgent`.
 * @property {(name: string, args: any) => Promise<any>} execTool
 *   - Executes a tool by name.  Throws on unknown names.
 * @property {MemoryToolBundle} [memoryTools]
 *   - Present only when the `memory` group is included.
 *     Sub-agents like observer and reflector use these directly.
 * @property {SearchBackend} [searchBackend]
 *   - Any search backend provided to buildGenieTools.
 *     Used by observer and reflector sub-agents.
 *     Missing when the caller did not supply one
 *     (the memory tools then use an internal substring backend that is not re-exposed here).
 * @property {SandboxSlice} [slice]
 *   - The persistent workspace `SandboxHandle` minted by `main.js`
 *     (`TODO/34_endo_genie_sandbox_main_wiring.md`).  Re-exposed on
 *     the registry so sub-task 35's `makeCommandTool` can route
 *     `bash` / `exec` / `git` spawns through `E(slice).spawn(...)`
 *     instead of the host `child_process.spawn`.  Absent when the
 *     caller did not supply one (e.g. `dev-repl.js`, the daemon
 *     self-boot test, or a future deployment that opts out of the
 *     sandbox slice).  Sub-task 35 wires the consumption side; this
 *     sub-task only threads the cap through.
 */

/**
 * Build the tool registry for a genie deployment.
 *
 * Provides integration points for:
 * - PiAgent via `listTools` and `execTool`
 * - sub-agent systems like the observer and reflector, which need direct
 *   memory-tool access
 *
 *
 * @param {object} options
 * @param {string} options.workspaceDir
 * @param {readonly GenieToolGroup[]} [options.include]
 *   - An empty list builds an empty registry.
 * @param {SearchBackend} [options.searchBackend]
 * @param {SandboxSlice} [options.slice]
 *   - Optional persistent workspace `SandboxHandle` minted by
 *     `main.js` per `TODO/34_endo_genie_sandbox_main_wiring.md`.
 *     Sub-task 35 (`TODO/35_endo_genie_sandbox_tool_spawn.md`) will
 *     wire `makeCommandTool` to consume it; this sub-task only
 *     threads it through the registry so the slice cap survives the
 *     hand-off without further `main.js` changes.  Absent when no
 *     slice is available — the consumer (sub-task 35) is responsible
 *     for falling back to host spawn or refusing.
 * @returns {GenieTools}
 */
export const buildGenieTools = ({
  workspaceDir,
  searchBackend,
  slice,
  include = PLUGIN_DEFAULT_INCLUDE,
}) => {
  const groups = new Set(include);

  /** @type {Record<string, Tool>} */
  const tools = {};

  if (groups.has('bash')) {
    tools.bash = bash;
  }

  if (groups.has('exec')) {
    tools.exec = exec;
  }

  if (groups.has('git')) {
    // `git` is an example attenuation of command execution, showing how to
    // grant narrower access to a specfic command.
    tools.git = makeCommandTool({
      name: 'git',
      program: 'git',
      description:
        'Runs git version control commands (status, log, diff, commit, etc.).',
      allowPath: true,
      policies: [
        // eslint-disable-next-line no-shadow
        args => {
          const first = args.filter(arg => !arg.startsWith('-'))[0];
          return !(
            // ban network-touching commands ; TODO moar
            (first && ['push', 'pull', 'fetch'].includes(first))
          );
        },
      ],
    });
  }

  if (groups.has('files')) {
    Object.assign(tools, makeFileTools({ root: workspaceDir }));
  }

  /** @type {MemoryToolBundle | undefined} */
  let memoryTools;

  if (groups.has('memory')) {
    const made = makeMemoryTools({
      root: workspaceDir,
      searchBackend,
    });
    const { indexing: _indexing, ...toTools } = made;
    memoryTools = harden({ ...made });
    Object.assign(tools, toTools);
  }

  if (groups.has('web') || groups.has('webFetch')) {
    tools.webFetch = webFetch;
  }

  if (groups.has('web') || groups.has('webSearch')) {
    tools.webSearch = webSearch;
  }

  /**
   * List available tools in the ToolSpec format expected by makeAgent.
   *
   * @returns {Array<{ name: string, summary: string }>}
   */
  const listTools = () => {
    return Object.entries(tools).map(([name, tool]) => ({
      name,
      summary: tool.help(),
    }));
  };

  /**
   * Execute a tool by name.
   *
   * @param {string} name
   * @param {any} toolArgs
   * @returns {Promise<any>}
   */
  const execTool = async (name, toolArgs) => {
    const tool = tools[name];
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.execute(toolArgs);
  };

  return harden({
    tools: harden({ ...tools }),
    listTools,
    execTool,
    memoryTools,
    searchBackend,
    slice,
  });
};
harden(buildGenieTools);
