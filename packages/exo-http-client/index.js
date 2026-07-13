// @ts-check

/**
 * @typedef {import('./src/types.js').HttpClient} HttpClient
 * @typedef {import('./src/types.js').HttpResponse} HttpResponse
 * @typedef {import('./src/types.js').HttpClientControl} HttpClientControl
 * @typedef {import('./src/types.js').PolicyMode} PolicyMode
 * @typedef {import('./src/types.js').Binding} Binding
 * @typedef {import('./src/types.js').BindingState} BindingState
 * @typedef {import('./src/types.js').AuditEntry} AuditEntry
 * @typedef {import('./src/types.js').Decision} Decision
 * @typedef {import('./src/types.js').PolicyAuthority} PolicyAuthority
 * @typedef {import('./src/types.js').PolicySnapshot} PolicySnapshot
 * @typedef {import('./src/types.js').FetchOptions} FetchOptions
 * @typedef {import('./src/types.js').FetchLike} FetchLike
 * @typedef {import('./src/types.js').FetchLikeRequestOptions} FetchLikeRequestOptions
 * @typedef {import('./src/types.js').FetchLikeResponse} FetchLikeResponse
 * @typedef {import('./src/types.js').FetchLikeBodyReader} FetchLikeBodyReader
 */

export {
  makeHttpClientAndControl,
  makeHttpClientKit,
  makeTrustOnFirstBindPolicyAdapter,
  // Interface guards, exported so downstream tool adapters (`@endo/agent-tools`'
  // `makeHttpTool`) can pin their hand-authored wire schemas against the guards
  // the exo actually enforces, rather than a hand-typed copy that could drift.
  FetchOptionsShape,
  HttpClientInterface,
  HttpClientControlInterface,
  HttpResponseInterface,
} from './src/http-client.js';
