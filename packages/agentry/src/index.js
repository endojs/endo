// @ts-check

// Package root: defineAgent plus the harness primitives. The execute-tool /
// code-mode preset lives under the `@endo/agentry/execute` subpath.
export { defineAgent } from './define-agent.js';
export {
  toolResultToSmallcaps,
  smallcapsMarshal,
  getAmbientEnv,
  makeEnvCredentials,
  makeApiKeyGetter,
  resolveModel,
  resolveModelProfile,
  resolveModelString,
  buildOllamaModel,
  defineModels,
  makePiAgent,
} from './harness/index.js';
