/**
 * @endo/genie - Main Entry Point
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
