// @ts-check

/**
 * Re-export the credential-seam typedefs so consumers can `@import` them from
 * `@endo/agentry/harness` without reaching into the module's internal paths.
 *
 * @typedef {import('./credentials.js').Credentials} Credentials
 * @typedef {import('./credentials.js').GetApiKey} GetApiKey
 */

export { toolResultToSmallcaps, smallcapsMarshal } from './marshal.js';
export {
  getAmbientEnv,
  makeEnvCredentials,
  makeApiKeyGetter,
} from './credentials.js';
export {
  resolveModel,
  resolveModelProfile,
  resolveModelString,
  buildOllamaModel,
  defineModels,
} from './model.js';
export { makePiAgent } from './pi-agent.js';
