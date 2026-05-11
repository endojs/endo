/**
 * endo/genie - Main Entry Point
 */

export {
  makePiAgent,
  runAgentRound,
  getMessageTokenCount,
  DEFAULT_MODEL_STRING,
  makeToolCallStart,
  makeToolCallEnd,
  makeMessage,
  makeThinking,
  makeUserMessage,
  makeError,
} from './agent/index.js';

export { makeToolGate } from './agent/tool-gate.js';

export {
  runHeartbeat,
  HeartbeatStatus,
  makeHeartbeatEvent,
  buildHeartbeatPrompt,
  isHeartbeatOk,
} from './heartbeat/index.js';

export { makeIntervalScheduler } from './interval/index.js';

export { makeGenieAgents } from './loop/agents.js';

export {
  makeObserver,
  OBSERVER_SYSTEM_PROMPT,
  DEFAULT_TOKEN_THRESHOLD,
  DEFAULT_IDLE_DELAY_MS,
  estimateUnobservedTokens,
  serializeMessages,
} from './observer/index.js';

export {
  makeReflector,
  REFLECTOR_SYSTEM_PROMPT,
  DEFAULT_REFLECTION_THRESHOLD,
  estimateFileTokens,
} from './reflector/index.js';

export { default as buildSystemPrompt } from './system/index.js';

export { estimateTokens } from './utils/index.js';

export {
  BUILTIN_HELP_DESCRIPTIONS,
  formatHelpLines,
  makeBuiltinSpecials,
} from './loop/builtin-specials.js';

export { runGenieLoop } from './loop/run.js';

export { makeSpecialsDispatcher } from './loop/specials.js';

export { buildGenieTools, PLUGIN_DEFAULT_INCLUDE } from './tools/registry.js';
