// @ts-check

/**
 * `/model` subcommand handler for sub-task 95 of
 * `TODO/92_genie_primordial.md`.
 *
 * The shared dispatcher mounts this alongside the other built-in
 * specials (`makeBuiltinSpecials` in `src/loop/builtin-specials.js`), so
 * operators can run `/model list`, `/model set …`, `/model test`,
 * `/model commit`, `/model show`, `/model clear`, and `/model help`
 * whether the genie booted in primordial mode (no LLM configured) or
 * piAgent mode (LLM already running).
 *
 * The handler itself is a single `SpecialHandler<Chunk>`: the first
 * token after `/model` selects the subcommand, the rest of the tokens
 * are forwarded to the sub-handler.  Sub-handlers share a single
 * `state` object (the same one threaded through the primordial
 * automaton) so `/model set` can stage a draft that `/model test` and
 * `/model commit` later consume.
 *
 * Persistence is pluggable: when `persistence.saveConfig` is supplied
 * (sub-task 96 lands the filesystem-backed loader), `/model commit`
 * writes the draft to `<workspaceDir>/.genie/config.json`.  Otherwise
 * the subcommand falls back to a labelled stub reply so operators see
 * exactly which sub-task is still outstanding.
 *
 * Credentials are masked whenever they are echoed back to the operator
 * (`/model show`), matching the 6+2 rule called out in the TODO: keep
 * the first 6 and last 2 characters, replace the middle with the
 * literal `…<redacted>` sentinel.  The raw credential values live only
 * in `state.draft.credentials`, never in the worker log or any reply
 * chunk.
 */

import {
  PROVIDER_CREDENTIAL_SPEC,
  PROVIDER_NAMES,
  getProviderSpec,
  listKnownKeys,
} from './providers.js';

import {
  SCRATCH_PING_PROMPT,
  buildScratchPiAgent,
  classifyPingError,
} from './scratch-agent.js';

/** @import { SpecialHandler } from '../loop/specials.js' */
/** @import { SpecialsIO } from '../loop/builtin-specials.js' */
/** @import { PrimordialState, ModelDraft } from './index.js' */
/** @import { ProviderCredentialSpec } from './providers.js' */

/**
 * @typedef {object} ModelHandlerPersistence
 * @property {(draft: ModelDraft) => Promise<void>} saveConfig
 *   - Persist the committed draft to durable storage.  Supplied by
 *     sub-task 96's filesystem-backed loader once it lands; until then
 *     `/model commit` degrades gracefully via the labelled-stub reply.
 */

/**
 * @template Chunk
 * @typedef {object} ModelHandlerOptions
 * @property {string} workspaceDir
 *   - Workspace root.  Reserved for subcommands that will read / write
 *     `<workspaceDir>/.genie/config.json` once sub-task 96 lands.
 * @property {PrimordialState} state
 *   - Shared state carrier.  `/model set` / `/model clear` mutate
 *     `state.draft`; `/model show` / `/model list` read both
 *     `state.draft` and `state.committed` so operators can see the
 *     active and staged configurations side-by-side.
 * @property {SpecialsIO<Chunk>} io
 *   - Rendering surface.  `/model` handlers route all output through
 *     `io.info` / `io.warn` / `io.error` / `io.success` so the
 *     deployment-specific styling (ANSI in dev-repl, plain strings in
 *     the daemon) stays in the adapter.
 * @property {Readonly<Record<string, ProviderCredentialSpec>>} [providerSpec]
 *   - Override for the provider catalog.  Defaults to the authoritative
 *     `PROVIDER_CREDENTIAL_SPEC` table; tests may inject a stub to
 *     exercise edge cases without touching the real catalog.
 * @property {ModelHandlerPersistence} [persistence]
 *   - Optional persistence hook.  Absent when sub-task 96 has not yet
 *     landed; `/model commit` then replies with the labelled stub note.
 */

/** Preferred subcommand listing order (drives `/model help` output). */
const SUBCOMMAND_ORDER = harden([
  'list',
  'show',
  'set',
  'test',
  'commit',
  'clear',
  'help',
]);

/**
 * Short descriptions for each subcommand, used by `/model help`.
 *
 * @type {Readonly<Record<string, string>>}
 */
const SUBCOMMAND_HELP = harden({
  list: 'print the provider catalog (marking the active entry)',
  show: 'print the active + staged model, masking credentials',
  set: 'stage a draft: /model set <provider> <modelId> [KEY=value …]',
  test: 'round-trip a fixed prompt through the staged draft',
  commit: 'persist the staged draft (primordial: hand off; piAgent: restart)',
  clear: 'drop the in-memory draft',
  help: 'print this subcommand table',
});

/**
 * Mask a credential value using the 6+2 rule: keep the first 6 and
 * last 2 characters, replace the middle with `…<redacted>`.  Short
 * values (<= 8 chars) collapse to the full `…<redacted>` sentinel so
 * the operator cannot read any portion of the secret.
 *
 * @param {string} value
 * @returns {string}
 */
export const maskCredential = value => {
  if (typeof value !== 'string' || value.length === 0) return '';
  if (value.length <= 8) return '…<redacted>';
  const head = value.slice(0, 6);
  const tail = value.slice(-2);
  return `${head}…<redacted>${tail}`;
};
harden(maskCredential);

/**
 * Parse a `KEY=value` token into a `[key, value]` tuple.  Returns
 * `undefined` when the token does not contain `=`, does not start with
 * an env-var-style identifier (uppercase letter or underscore), or the
 * value is empty — callers treat any of those as operator error.
 *
 * @param {string} token
 * @returns {[string, string] | undefined}
 */
const parseKeyValue = token => {
  if (typeof token !== 'string') return undefined;
  const eq = token.indexOf('=');
  if (eq <= 0) return undefined;
  const key = token.slice(0, eq);
  const value = token.slice(eq + 1);
  if (key.length === 0 || value.length === 0) return undefined;
  // Env-var-style: uppercase, digits, underscore; must start with a
  // letter or underscore.  Rejects stray flags like `--foo` or
  // lowercased typos so `/model set` surfaces the error instead of
  // silently stashing a key pi-ai will never consult.
  if (!/^[A-Z_][A-Z0-9_]*$/u.test(key)) return undefined;
  return [key, value];
};

/**
 * Validate that the draft satisfies the provider's credential
 * requirements.  Returns `undefined` when the draft is acceptable or
 * an error message string otherwise.
 *
 * @param {ProviderCredentialSpec} spec
 * @param {string} provider
 * @param {Record<string, string>} credentials
 * @returns {string | undefined}
 */
const validateCredentials = (spec, provider, credentials) => {
  const required = spec.requiredCreds || [];
  const alts = spec.altCreds || [];
  if (required.length === 0 && alts.length === 0) return undefined;
  // Providers with altCreds treat the union as a disjunction (anthropic
  // accepts either ANTHROPIC_API_KEY or ANTHROPIC_OAUTH_TOKEN).
  const union = [...required, ...alts];
  const satisfied = union.some(key => {
    const value = credentials[key];
    return typeof value === 'string' && value.length > 0;
  });
  if (!satisfied) {
    const primary = required.length ? required.join(' / ') : alts.join(' / ');
    return `provider "${provider}" requires one of: ${primary}`;
  }
  return undefined;
};

/**
 * Render the draft credentials as masked `KEY: masked` lines.  Returns
 * a placeholder when the draft has no credentials (the ollama case).
 *
 * @param {Record<string, string>} credentials
 * @returns {string[]}
 */
const renderCredentials = credentials => {
  const keys = Object.keys(credentials).sort();
  if (keys.length === 0) return ['    (none)'];
  return keys.map(key => `    ${key}: ${maskCredential(credentials[key])}`);
};

/**
 * Render the draft options as `KEY: value` lines (options are
 * non-secret so values are echoed verbatim).  Returns a placeholder
 * when the draft has no options.
 *
 * @param {Record<string, string>} options
 * @returns {string[]}
 */
const renderOptions = options => {
  const keys = Object.keys(options).sort();
  if (keys.length === 0) return ['    (none)'];
  return keys.map(key => `    ${key}: ${options[key]}`);
};

/**
 * Render a committed / draft model block for `/model show`.  Keeps the
 * two blocks on the same shape so operators can spot differences by
 * eye.
 *
 * @param {string} label
 * @param {ModelDraft} draft
 * @returns {string[]}
 */
const renderModelBlock = (label, draft) => {
  return [
    `${label}:`,
    `  provider: ${draft.provider}`,
    `  modelId:  ${draft.modelId}`,
    `  credentials:`,
    ...renderCredentials(draft.credentials || {}),
    `  options:`,
    ...renderOptions(draft.options || {}),
  ];
};

/**
 * Build the single `/model` handler.  Each subcommand is dispatched on
 * the first token after `/model` and consumes the remaining tokens.
 *
 * @template Chunk
 * @param {ModelHandlerOptions<Chunk>} options
 * @returns {SpecialHandler<Chunk>}
 */
export const makeModelHandler = ({
  workspaceDir,
  state,
  io,
  providerSpec = PROVIDER_CREDENTIAL_SPEC,
  persistence,
}) => {
  if (typeof workspaceDir !== 'string' || workspaceDir.length === 0) {
    throw new Error(
      'makeModelHandler: workspaceDir must be a non-empty string',
    );
  }
  if (!state || typeof state !== 'object') {
    throw new Error('makeModelHandler: state must be an object');
  }
  if (!providerSpec || typeof providerSpec !== 'object') {
    throw new Error('makeModelHandler: providerSpec must be an object');
  }
  // Snapshot the provider order so `/model list` is deterministic even
  // when tests pass a custom `providerSpec`.
  const providerNames =
    providerSpec === PROVIDER_CREDENTIAL_SPEC
      ? PROVIDER_NAMES
      : harden(Object.keys(providerSpec));

  /**
   * @param {string} name
   * @returns {ProviderCredentialSpec | undefined}
   */
  const lookupSpec = name => {
    if (providerSpec === PROVIDER_CREDENTIAL_SPEC) {
      return getProviderSpec(name);
    }
    if (typeof name !== 'string') return undefined;
    return providerSpec[name];
  };

  /** @type {SpecialHandler<Chunk>} */
  const listHandler = async function* listHandler(_tail) {
    const active = state.committed;
    yield io.info('Providers:');
    for (const name of providerNames) {
      const spec = providerSpec[name];
      if (!spec) continue;
      const isActive = active && active.provider === name;
      const marker = isActive ? ' [active]' : '';
      yield io.info(`  ${name}${marker} — ${spec.notes}`);
    }
    if (active) {
      yield io.info('');
      yield io.info(`Active model: ${active.provider}/${active.modelId}`);
    } else {
      yield io.info('');
      yield io.info(
        'No active model configured.  Use /model set <provider> <modelId> to stage a draft.',
      );
    }
  };

  /** @type {SpecialHandler<Chunk>} */
  const showHandler = async function* showHandler(_tail) {
    const { committed, draft } = state;
    if (!committed && !draft) {
      yield io.info(
        'No model configured.  Use /model set <provider> <modelId> [KEY=value …] to stage a draft.',
      );
      return;
    }
    if (committed) {
      for (const line of renderModelBlock('Active model', committed)) {
        yield io.info(line);
      }
    }
    if (committed && draft) {
      yield io.info('');
    }
    if (draft) {
      for (const line of renderModelBlock(
        committed ? 'Draft model (not yet committed)' : 'Draft model',
        draft,
      )) {
        yield io.info(line);
      }
    }
  };

  /** @type {SpecialHandler<Chunk>} */
  const setHandler = async function* setHandler(tail) {
    if (tail.length < 2) {
      yield io.error(
        'Usage: /model set <provider> <modelId> [KEY=value …]',
      );
      return;
    }
    const [provider, modelId, ...rest] = tail;
    const spec = lookupSpec(provider);
    if (!spec) {
      const known = providerNames.join(', ');
      yield io.error(
        `Unknown provider "${provider}".  Known: ${known}.  Run /model list for details.`,
      );
      return;
    }
    const known = listKnownKeys(spec);
    /** @type {Record<string, string>} */
    const credentials = {};
    /** @type {Record<string, string>} */
    const opts = {};
    for (const token of rest) {
      const parsed = parseKeyValue(token);
      if (!parsed) {
        yield io.error(
          `Invalid KEY=value token: "${token}" — expected UPPER_SNAKE_CASE=non-empty-value.`,
        );
        return;
      }
      const [key, value] = parsed;
      if (!known.includes(key)) {
        yield io.error(
          `Unknown key "${key}" for provider "${provider}".  ` +
            `Known: ${known.length ? known.join(', ') : '(none)'}.`,
        );
        return;
      }
      const isSecret =
        spec.requiredCreds.includes(key) ||
        (spec.altCreds || []).includes(key);
      if (isSecret) {
        credentials[key] = value;
      } else {
        opts[key] = value;
      }
    }
    const err = validateCredentials(spec, provider, credentials);
    if (err) {
      yield io.error(err);
      return;
    }
    /** @type {ModelDraft} */
    const draft = harden({
      provider,
      modelId,
      credentials: harden({ ...credentials }),
      options: harden({ ...opts }),
    });
    state.draft = draft;
    yield io.success(
      `✓ Draft staged: ${provider}/${modelId}.  Run /model test to smoke-test, or /model commit to persist.`,
    );
  };

  /** @type {SpecialHandler<Chunk>} */
  const testHandler = async function* testHandler(_tail) {
    const { draft } = state;
    if (!draft) {
      yield io.error(
        'No draft staged.  Run /model set <provider> <modelId> first.',
      );
      return;
    }
    yield io.notice(
      `Testing ${draft.provider}/${draft.modelId} with prompt ${JSON.stringify(SCRATCH_PING_PROMPT)}…`,
    );
    let scratch;
    try {
      scratch = buildScratchPiAgent({
        provider: draft.provider,
        modelId: draft.modelId,
        credentials: { ...(draft.credentials || {}) },
        options: { ...(draft.options || {}) },
      });
    } catch (err) {
      yield io.error(
        `OTHER: ${(err && /** @type {Error} */ (err).message) || String(err)}`,
      );
      return;
    }
    try {
      const reply = await scratch.runPing();
      const trimmed = typeof reply === 'string' ? reply.trim() : '';
      const preview =
        trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
      yield io.success(
        preview.length > 0
          ? `✓ OK — reply: ${JSON.stringify(preview)}`
          : '✓ OK — provider returned an empty reply.',
      );
    } catch (err) {
      const { kind, message } = classifyPingError(err);
      yield io.error(`${kind}: ${message}`);
    }
  };

  /** @type {SpecialHandler<Chunk>} */
  const commitHandler = async function* commitHandler(_tail) {
    const { draft } = state;
    if (!draft) {
      yield io.error(
        'No draft staged.  Run /model set <provider> <modelId> first.',
      );
      return;
    }
    if (!persistence || typeof persistence.saveConfig !== 'function') {
      yield io.warn(
        '(commit will land with sub-task 97 + 96) — draft preserved, persistence not yet wired.',
      );
      return;
    }
    try {
      await persistence.saveConfig(draft);
    } catch (err) {
      yield io.error(
        `Failed to persist draft: ${(err && /** @type {Error} */ (err).message) || String(err)}`,
      );
      return;
    }
    yield io.success(
      `✓ Configuration saved: ${draft.provider}/${draft.modelId}.`,
    );
    if (state.mode === 'primordial') {
      // Primordial → piAgent hand-off (sub-task 97 of TODO/92).  The
      // shared `state.activate` callback is bound by the daemon
      // deployment to `activatePiAgent`, which builds the agent pack,
      // flips `state.mode` to `'piAgent'`, starts the heartbeat ticker,
      // and logs the backwards-compatible `[genie:<name>] agent ready`
      // line.  Unit tests pass a fake `activate` that does not flip
      // `state.mode`; in that case the warning branch below surfaces
      // the degraded state to the operator.
      yield io.notice('Activating piAgent…');
      try {
        await state.activate();
      } catch (err) {
        yield io.error(
          `Persistence succeeded but activation failed: ${(err && /** @type {Error} */ (err).message) || String(err)}`,
        );
        return;
      }
      if (state.mode === 'piAgent') {
        yield io.success(
          `✓ Ready: model=${draft.provider}/${draft.modelId}.`,
        );
      } else {
        // `activate` returned without flipping to piAgent — typically
        // a misconfigured deployment (no `activatePiAgent` wired) or a
        // test stub.  Tell the operator the LLM is not live so they
        // know to investigate / restart manually.
        yield io.warn(
          'Activation completed but did not flip to piAgent mode; LLM remains offline.',
        );
      }
    } else {
      // piAgent mode: the LLM is already running, but the agent pack
      // bakes the model into closures (see TODO/92 § 1b).  The reliable
      // swap path is "persist + exit + restart" — let the daemon
      // reincarnate the worker with the new config.  Yield the visible
      // hint first so the operator sees the rationale before mail
      // delivery races against the worker exit.
      yield io.info(
        'Restart required — daemon will reincarnate on next message.',
      );
      if (typeof state.requestRestart === 'function') {
        // Best-effort fire-and-forget: the deployment hook is expected
        // to schedule its own `process.exit` after a short delay so
        // the chunks above flush through CapTP first.  Errors are
        // swallowed — the operator already saw the persistence success
        // chunk, and a stuck worker is better than an uncaught throw
        // that hides the saved config behind a generic error reply.
        state.requestRestart().catch(() => {});
      }
    }
  };

  /** @type {SpecialHandler<Chunk>} */
  const clearHandler = async function* clearHandler(_tail) {
    if (!state.draft) {
      yield io.info('No draft to clear.');
      return;
    }
    state.draft = undefined;
    yield io.info('Draft cleared.');
  };

  /** @type {SpecialHandler<Chunk>} */
  const helpHandler = async function* helpHandler(_tail) {
    yield io.info('Subcommands:');
    for (const name of SUBCOMMAND_ORDER) {
      const desc = SUBCOMMAND_HELP[name];
      yield io.info(`  /model ${name.padEnd(6)} — ${desc}`);
    }
  };

  /** @type {Record<string, SpecialHandler<Chunk>>} */
  const subhandlers = {
    list: listHandler,
    show: showHandler,
    set: setHandler,
    test: testHandler,
    commit: commitHandler,
    clear: clearHandler,
    help: helpHandler,
  };

  // Touch `workspaceDir` so the closure captures it; sub-task 96 will
  // consume this path to resolve `<workspaceDir>/.genie/config.json`.
  void workspaceDir;

  /** @type {SpecialHandler<Chunk>} */
  const modelHandler = async function* modelHandler(tail) {
    if (tail.length === 0) {
      yield* helpHandler([]);
      return;
    }
    const [head, ...rest] = tail;
    const sub = subhandlers[head];
    if (!sub) {
      yield io.error(
        `Unknown /model subcommand "${head}".  Run /model help for the full list.`,
      );
      return;
    }
    yield* sub(rest);
  };
  return modelHandler;
};
harden(makeModelHandler);
