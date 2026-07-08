// @ts-check

/**
 * @typedef {import('./src/types.js').ConfinedRequest} ConfinedRequest
 * @typedef {import('./src/types.js').ConfinedResponse} ConfinedResponse
 * @typedef {import('./src/types.js').FetchLike} FetchLike
 * @typedef {import('./src/types.js').FetchLikeBodyReader} FetchLikeBodyReader
 * @typedef {import('./src/types.js').FetchLikeRequestOptions} FetchLikeRequestOptions
 * @typedef {import('./src/types.js').FetchLikeResponse} FetchLikeResponse
 * @typedef {import('./src/types.js').HttpConfinementPolicy} HttpConfinementPolicy
 */

export {
  HeaderRejectedError,
  MethodNotAllowedError,
  OriginNotAllowedError,
  RateLimitError,
  RevokedError,
  assertHeadersSafe,
  checkOriginAllowed,
  limitResponseBytes,
  makeHttpConfinement,
  makeRateLimiter,
  makeRequestSignal,
  normalizeMethod,
  parseAllowedOrigins,
  resolveRedirect,
} from './src/http-confine.js';
