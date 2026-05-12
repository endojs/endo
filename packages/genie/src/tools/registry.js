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

import {
  bash,
  exec,
  makeBashTool,
  makeCommandTool,
  makeExecTool,
} from './command.js';
import { makeFileTools } from './filesystem.js';
import { makeMemoryTools } from './memory.js';
import { makeMountVFS } from './vfs-mount.js';
import { webFetch } from './web-fetch.js';
import { webSearch } from './web-search.js';

/** @import { Tool } from './common.js' */
/** @import { SearchBackend } from './memory.js' */
/** @import { Spawner } from './spawner.js' */
/** @import { MountVFSCap } from './vfs-mount.js' */

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
 * @param {Spawner} [options.spawner]
 *   - Process-execution engine for the `bash` / `exec` / `git`
 *     tools.  When omitted, those tools fall through to the host
 *     spawner baked into `command.js` (the default for the
 *     `dev-repl` and any host-only deployment).  When supplied
 *     (e.g. a sandbox spawner from `./sandbox-spawner.js`), the
 *     command tools spawn through it instead — file / memory / web
 *     tools continue to run daemon-side.
 * @param {string} [options.sliceWorkspacePath]
 *   - Slice-internal mount path for the workspace when `spawner`
 *     routes the command tools through a sandbox slice (e.g.
 *     `/workspace`).  Threaded into the `bash` / `exec` / `git`
 *     tool descriptions so the model sees the correct workspace
 *     path in the tool-level docs (the same value also shows up in
 *     the system-prompt runtime-info section).  Leave undefined for
 *     host-spawn deployments.
 * @param {MountVFSCap} [options.workspaceMount]
 *   - Optional Endo `Mount` capability rooted at `workspaceDir`.
 *     When supplied, the `files` tool group routes its reads and
 *     writes through the cap surface (`makeMountVFS`) instead of
 *     holding ambient host fs authority via `makeNodeVFS`.  The
 *     `memory` group and FTS5 search backend continue to use the
 *     host path because they rely on Node-specific APIs (FTS5 SQLite,
 *     atomic writes) that have no Mount equivalent — the slice's
 *     bind-mount lands on the same bytes either way, so the two
 *     views still stay in lockstep.
 * @returns {GenieTools}
 */
export const buildGenieTools = ({
  workspaceDir,
  searchBackend,
  include = PLUGIN_DEFAULT_INCLUDE,
  spawner,
  sliceWorkspacePath,
  workspaceMount,
}) => {
  const groups = new Set(include);

  /** @type {Record<string, Tool>} */
  const tools = {};

  // Slice-aware overrides: when both `spawner` and `sliceWorkspacePath`
  // are supplied, the model needs to know the slice-internal workspace
  // path in the tool descriptions as well as the system prompt.  When
  // only `spawner` is supplied (no slice path threaded), the tool
  // descriptions stay path-agnostic — the override is opt-in so the
  // dev-repl's `--sandbox off` path and the daemon's no-factory path
  // continue to share the pre-built host-spawner exports verbatim.
  const sliceOpts =
    sliceWorkspacePath !== undefined ? { sliceWorkspacePath } : {};

  // When a spawner is injected, rebuild the bash / exec tools so the
  // override flows through to the underlying makeCommandTool factory
  // while preserving the pre-built dangerous-pattern policies.
  // Otherwise reuse the pre-built host-spawner exports verbatim.
  if (groups.has('bash')) {
    tools.bash = spawner ? makeBashTool({ spawner, ...sliceOpts }) : bash;
  }

  if (groups.has('exec')) {
    tools.exec = spawner ? makeExecTool({ spawner, ...sliceOpts }) : exec;
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
      ...(spawner ? { spawner } : {}),
      ...sliceOpts,
    });
  }

  if (groups.has('files')) {
    // When the caller passed a `workspaceMount` cap, route the file
    // tools through the Mount surface so the genie's daemon-side
    // reads and writes ride the cap minted by `setup.js` instead of
    // ambient host fs authority.  The `vfs-mount` adapter uses POSIX
    // path semantics, so `root` stays a string (the host path) and
    // the adapter strips that prefix to derive the segment list it
    // forwards to the Mount.
    const fileTools = workspaceMount
      ? makeFileTools({
          root: workspaceDir,
          vfs: makeMountVFS({ mount: workspaceMount, rootDir: workspaceDir }),
        })
      : makeFileTools({ root: workspaceDir });
    Object.assign(tools, fileTools);
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
  });
};
harden(buildGenieTools);
