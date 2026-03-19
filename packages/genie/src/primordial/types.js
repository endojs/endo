// @ts-check

/**
 * Persisted-model config typedefs shared by the persistence helpers in
 * this directory, the `/model` handler (sub-task 95 of
 * `TODO/92_genie_primordial.md`), and the root genie's boot-time
 * precedence resolver in `packages/genie/main.js` (sub-task 93).
 *
 * The on-disk file lives at `<workspaceDir>/.genie/config.json` and
 * round-trips through {@link Config}.  See
 * `./persistence.js` for the read / write helpers and the v1 schema
 * validation.
 *
 * The file is plaintext: every credential committed via `/model
 * commit` lands here verbatim.  The deployment-level guidance for
 * keeping the file out of source control lives in
 * `packages/genie/CLAUDE.md` § "Env-var config".
 */

/**
 * Schema version literal.  Bump this when adding migrations; the
 * loader refuses to read configs whose `version` does not match.
 *
 * @typedef {1} ConfigVersion
 */

/**
 * Model block of the persisted config.  Mirrors the in-memory
 * {@link ModelDraft} from `./index.js` but always carries
 * `credentials` and `options` as plain (possibly empty) objects so
 * downstream consumers do not have to defend against `undefined`.
 *
 * @typedef {object} ConfigModel
 * @property {string} provider
 *   - Provider name (e.g. `'anthropic'`, `'ollama'`).  Must match a
 *     key of `PROVIDER_CREDENTIAL_SPEC` for the boot stamping path to
 *     find the right credential env-var names.
 * @property {string} modelId
 *   - Model identifier (e.g. `'claude-sonnet-4-5'`, `'llama3.2'`).
 *     Combined with `provider` as `${provider}/${modelId}` to drive
 *     the `model:` option of `makeGenieAgents`.
 * @property {Record<string, string>} credentials
 *   - UPPER_SNAKE_CASE env-var name → credential value.  Stamped into
 *     `process.env` at boot so pi-ai's `getEnvApiKey` finds them.
 * @property {Record<string, string>} options
 *   - UPPER_SNAKE_CASE env-var name → non-secret option value (e.g.
 *     `OLLAMA_HOST`).  Stamped into `process.env` alongside the
 *     credentials so provider-specific code (e.g. the Ollama base URL
 *     resolver) picks them up unchanged.
 */

/**
 * Top-level shape of `<workspaceDir>/.genie/config.json`.
 *
 * @typedef {object} Config
 * @property {string} [_README]
 *   - Optional human-readable note round-tripped verbatim so an
 *     operator browsing the file by hand sees the doc pointer.
 *     `loadConfig` does not require it; `saveConfig` writes the
 *     canonical `README_TEXT` from `./persistence.js`.
 * @property {ConfigVersion} version
 * @property {ConfigModel} model
 */

// Type-only module — no runtime exports.  Re-export an empty marker so
// the file is a valid ES module under Node's strict-module loader and
// `import './types.js'` does not fail in TS-aware builds.
export {};
