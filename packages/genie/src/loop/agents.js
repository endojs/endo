// @ts-check

/** @import { Agent as PiAgent } from '@earendil-works/pi-agent-core' */
/** @import { Api, Model } from '@earendil-works/pi-ai' */
/** @import { Observer } from '../observer/index.js' */
/** @import { Reflector } from '../reflector/index.js' */
/** @import { GenieTools } from '../tools/registry.js' */

import harden from '@endo/harden';

import { makePiAgent } from '../agent/index.js';
import { makeObserver } from '../observer/index.js';
import { makeReflector } from '../reflector/index.js';

/**
 * @typedef {object} GenieAgentsConfig
 * @property {string | Model<Api>} [model]
 * - Baseline model used by the main chat agent.  Either a
 *   `provider/modelId` string the pi-ai registry can resolve or a
 *   pre-constructed `Model<…>` object (used by the dev-repl when a
 *   `GENIE_FAUX_SCRIPT` registration supplies its own model).
 *   Default model for any sub-agent that does not supply its own
 *   override.
 * @property {string | Model<Api>} [observerModel]
 *   - Override model for the observer sub-agent.
 * @property {string | Model<Api>} [reflectorModel]
 *   - Override model for the reflector sub-agent.
 * @property {string | Model<Api>} [heartbeatModel]
 *   - Override model for the heartbeat sub-agent.
 * @property {boolean} [dedicatedHeartbeatAgent]
 * - When `true` (default), `heartbeatAgent` is a separately constructed
 *   PiAgent so that heartbeat context does not pollute the main agent.
 *   When `false` (historical), `heartbeatAgent` is the same reference as
 *   `piAgent` — matches the old shared-agent behaviour for debugging parity
 *   with today's main.js.
 */

/**
 * @typedef {object} GenieAgentsOptions
 * @property {string} hostname
 *   - Hostname string passed through to `makePiAgent`.
 * @property {string} workspaceDir
 *   - Workspace root, relevant for any file tools.
 * @property {string} [sliceWorkspacePath]
 *   - When the agent's command-style tools are routed through a sandbox
 *     slice that bind-mounts `workspaceDir` to a fixed path, the
 *     slice-internal mount path (e.g. `/workspace`).  Threaded into
 *     every `makePiAgent` call so the main and heartbeat agents'
 *     system prompts advertise both the host workspace path (used by
 *     daemon-side file / memory tools) and the slice-internal path
 *     (used by `bash` / `exec` / `git`).  Omit when no slice is in use.
 * @property {GenieTools} tools
 *   - The pack re-uses `tools.listTools` / `tools.execTool` for the
 *     main/heartbeat agents and `tools.memoryTools` / `tools.searchBackend`
 *     for the observer / reflector.
 * @property {GenieAgentsConfig} [config]
 * @property {typeof makePiAgent} [makeAgent]
 *   - Factory override used to construct the `piAgent` / `heartbeatAgent`.
 *     Defaults to the real `makePiAgent`; tests inject a stub to observe the
 *     options passed to each sub-agent without hitting the model registry.
 * @property {typeof makeObserver} [makeObserverAgent]
 *   - Factory override for the observer sub-agent.
 *     Tests use this to avoid touching the filesystem or search backend.
 * @property {typeof makeReflector} [makeReflectorAgent]
 *   - Factory override for the reflector sub-agent.
 *     Tests use this to avoid touching the filesystem or search backend.
 */

/**
 * @typedef {object} GenieAgents
 * @property {PiAgent} piAgent
 *   - The main chat PiAgent.
 * @property {PiAgent} heartbeatAgent
 *   - The heartbeat PiAgent.
 * @property {Observer} [observer]
 *   - Memory observer; missing of no memoryTools were given.
 * @property {Reflector} [reflector]
 *   - Memory reflector; missing of no memoryTools were given.
 */

/**
 * Construct a genie's shared agent pack.
 *
 * Primary concerns:
 * - ensuring that every sub-agent sees the same workspaceDir, tools, and searchBackend
 * - passing along per-agent model config
 *
 * Secondarily provides a legacy config option for whether the heartbeat agent
 * should be separate, or same as main chat agent.
 *
 * When `options.tools.memoryTools` is undefined, the observer and reflector
 * sub-agents are omitted.
 *
 * Non-concerns:
 * - round/turn-taking loop
 * - scheduler for tasks like heartbeat, obserer, and reflector
 * - provisioning config from args or a from submission
 * - rendition of chat events, whether to console or mail messages
 *
 * @param {GenieAgentsOptions} options
 * @returns {Promise<GenieAgents>}
 */
export const makeGenieAgents = async ({
  hostname,
  workspaceDir,
  sliceWorkspacePath,
  tools,
  config = {},
  makeAgent = makePiAgent,
  makeObserverAgent = makeObserver,
  makeReflectorAgent = makeReflector,
}) => {
  const {
    model,
    observerModel = model,
    reflectorModel = model,
    heartbeatModel = model,
    dedicatedHeartbeatAgent = true,
  } = config;

  const { listTools, execTool, memoryTools, searchBackend } = tools;

  const currentTime = new Date().toISOString();

  // Thread `sliceWorkspacePath` into the main and heartbeat agents only:
  // observer / reflector run daemon-side and never invoke command-style
  // tools, so the slice asymmetry is irrelevant to their prompts.
  const sliceArg =
    sliceWorkspacePath !== undefined ? { sliceWorkspacePath } : {};

  const piAgent = await makeAgent({
    hostname,
    currentTime,
    workspaceDir,
    ...sliceArg,
    model,
    listTools,
    execTool,
  });

  const heartbeatAgent = dedicatedHeartbeatAgent
    ? await makeAgent({
        hostname,
        currentTime,
        workspaceDir,
        ...sliceArg,
        model: heartbeatModel,
        listTools,
        execTool,
      })
    : piAgent;

  /** @type {Observer | undefined} */
  let observer;
  /** @type {Reflector | undefined} */
  let reflector;
  if (memoryTools) {
    observer = makeObserverAgent({
      model: observerModel,
      memoryGet: memoryTools.memoryGet,
      memorySet: memoryTools.memorySet,
      searchBackend,
      workspaceDir,
    });
    reflector = makeReflectorAgent({
      model: reflectorModel,
      memoryGet: memoryTools.memoryGet,
      memorySet: memoryTools.memorySet,
      memorySearch: memoryTools.memorySearch,
      searchBackend,
      workspaceDir,
    });
  }

  // NOTE cannot harden() because PiAgent is a mutable surface
  return {
    piAgent,
    heartbeatAgent,
    observer,
    reflector,
  };
};
harden(makeGenieAgents);
