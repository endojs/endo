// @ts-check

// Package root: defineAgent plus the harness primitives.
export { defineAgent } from './define-agent.js';
export {
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
