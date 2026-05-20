// @ts-check
/* global process, setTimeout, Buffer */
/* eslint-disable no-await-in-loop, no-console */

/**
 * End-to-end smoke test (manual; not in CI) for the `@endo/fae`
 * agent's tool-calling pipeline.  One shared Endo daemon per test
 * file, one factory (and provider record) per model under test,
 * per-test fae agent, per-test `FAE_CWD`, no provider-error cascade,
 * and a postmortem emitted from `test.afterEach.always`.
 *
 * The five test bodies (basic-chat, reply-tool, timestamp, math,
 * read-file) are each registered as a `test.macro` and replayed once
 * per entry in `LAL_MODELS` (default: `[LAL_MODEL]`), so a
 * multi-model run yields one AVA row per `(test, model)` pair.
 *
 * # Why this file is under `scripts/` rather than `test/`
 *
 * AVA's default file globs do not match `scripts/*.test.js` because
 * the package's `ava.files` config restricts auto-discovery to
 * `test/**\/*.test.*`. That keeps `yarn test` — including the CI
 * `turbo run test` invocation — from picking the smoke test up.  The
 * smoke runner is invoked explicitly via `yarn smoke`, which passes
 * this file as a positional argument to AVA.
 *
 * # CI gate
 *
 * Even invoked explicitly, the suite skips itself when `LAL_AUTH_TOKEN`
 * is unset (the typical CI condition), so the file can be safely run
 * under `ava` in environments without LLM credentials.
 *
 * # Prerequisites
 *
 * - `.env` in `packages/fae/` with `LAL_HOST`, `LAL_AUTH_TOKEN`, and
 *   either `LAL_MODEL` (single-model run, today's default) or
 *   `LAL_MODELS` (comma-separated list, multi-model matrix).  When
 *   both are set, `LAL_MODELS` wins.
 * - `SMOKE_REPLY_TIMEOUT_MS=<ms>` overrides the per-reply wait
 *   (default 30 s).
 */

import '@endo/init/debug.js';

import anyTest from 'ava';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { start, stop, purge, makeEndoClient } from '@endo/daemon';

/**
 * Per-test mutable context populated by `test.beforeEach` and consumed
 * by `sendAndAwaitReply` / `test.afterEach.always`.
 *
 * `workerLog` is cached at agent-creation time so that parallel tests
 * each track their own driver worker's log rather than racing on
 * "most recently modified" heuristics.  May start out empty if the
 * driver worker has not yet written its log; lookup is retried lazily
 * inside `sendAndAwaitReply`.
 *
 * @typedef {{
 *   agentName: string,
 *   fromId: string,
 *   cwd: string,
 *   workerLog: string,
 *   postmortem: null | { logPath: string, baseline: number, logTail: string },
 * }} TestCtx
 */

const test = /** @type {import('ava').TestFn<TestCtx>} */ (anyTest);

const dirname = url.fileURLToPath(new URL('..', import.meta.url));
const factorySpecifier = new URL('../agent.js', import.meta.url).href;
const readFileSpecifier = new URL('../tools/read-file.js', import.meta.url)
  .href;
const greetSpecifier = new URL('../tools/greet.js', import.meta.url).href;
const mathSpecifier = new URL('../tools/math.js', import.meta.url).href;
const timestampSpecifier = new URL('../tools/timestamp.js', import.meta.url)
  .href;

// ---------------------------------------------------------------------------
// Paths and constants
// ---------------------------------------------------------------------------

const SMOKE_TMP = path.join(dirname, 'tmp', 'smoke');
const SMOKE_STATE = path.join(SMOKE_TMP, 'state');
const SMOKE_RUN = path.join(SMOKE_TMP, 'run');
const SMOKE_CACHE = path.join(SMOKE_TMP, 'cache');
const SMOKE_SOCK =
  process.platform === 'win32'
    ? String.raw`\\?\pipe\endo-fae-smoke.sock`
    : path.join(SMOKE_RUN, 'endo.sock');
// `STATE_PATH` is the directory the daemon writes worker state into.
// `start()` lays out `<statePath>/worker/<sha>/worker.log` directly
// under the configured `statePath`, with no intermediate `endo/` segment.
// The postmortem command pastes `STATE_PATH` verbatim into
// `yarn debug:llm --state=…`, so it has to match what the daemon uses.
const STATE_PATH = SMOKE_STATE;
const WORKER_ROOT = path.join(STATE_PATH, 'worker');

// Default 90s per reply.  Free-tier providers can take more than 30s
// on attachment-driven multi-turn flows even when the tool sequence is
// healthy, so keep enough room for provider variance while still
// failing real stalls in finite time.  Override `SMOKE_REPLY_TIMEOUT_MS`
// when a lane needs a different budget.
const REPLY_TIMEOUT_MS =
  Number(process.env.SMOKE_REPLY_TIMEOUT_MS) > 0
    ? Number(process.env.SMOKE_REPLY_TIMEOUT_MS)
    : 90_000;
const POLL_INTERVAL_MS = 500;

// ---------------------------------------------------------------------------
// Env preflight
// ---------------------------------------------------------------------------
//
// Mirror `provider-setup.sh`'s `set -a; source .env` so any shared config
// (FAE_CWD, etc.) is visible to this process.  Read synchronously at module
// load so the skip decision below can use the result.

const loadEnvSync = () => {
  const envPath = path.join(dirname, '.env');
  let text;
  try {
    text = fsSync.readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim();
    }
  }
};
loadEnvSync();

/**
 * Models under test, in registration order.  `LAL_MODELS=a,b,c` opts
 * into the matrix; otherwise the single `LAL_MODEL` is used (today's
 * default).  Empty / whitespace-only entries are dropped.
 */
const MODELS = (() => {
  const raw = process.env.LAL_MODELS;
  if (raw) {
    return raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  return process.env.LAL_MODEL ? [process.env.LAL_MODEL] : [];
})();

const HAS_LLM_CONFIG = !!(
  process.env.LAL_AUTH_TOKEN &&
  process.env.LAL_HOST &&
  MODELS.length > 0
);

if (!HAS_LLM_CONFIG) {
  console.error(
    '[smoke] LAL_AUTH_TOKEN/LAL_HOST/(LAL_MODEL or LAL_MODELS) not set ' +
      '— skipping smoke suite',
  );
}

/**
 * Reduce a model identifier (e.g. `anthropic/claude-haiku-4-5`) to a
 * pet-name-safe slug.  Used to disambiguate the provider value and
 * factory caplet that each model gets in the daemon's host petstore.
 *
 * @param {string} modelName
 * @returns {string}
 */
const modelSlug = modelName =>
  modelName
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'model';

// Tests within an AVA file run concurrently by default; this file
// relies on per-test agent isolation (`createAgent` + per-test
// `fromId` filter + per-test `FAE_CWD`) and on the retry helper
// below to absorb provider rate-limit hits without serialising.
// `test.skip` registers the test as skipped at module load when no
// LLM credentials are configured (CI gate).  Hooks below also bail
// out when `HAS_LLM_CONFIG` is false so the daemon never starts.
const smokeTest = HAS_LLM_CONFIG ? test : test.skip;

// ---------------------------------------------------------------------------
// Filesystem helpers (postmortem worker-log tailing)
// ---------------------------------------------------------------------------

/**
 * @param {string} metaText
 * @returns {string}
 */
const parseLabel = metaText => {
  try {
    const { label } = /** @type {{ label?: string }} */ (JSON.parse(metaText));
    return typeof label === 'string' ? label : '';
  } catch {
    return '';
  }
};

/**
 * Locate the `worker.log` that captures every agent's `[fae]` /
 * `[tool]` / `[LAL]` chat output.  Fae's `createAgent` launches the
 * driver caplet via `makeUnconfined` (`agent.js:661`), which runs in
 * the daemon's `host` worker — so every test's chat events land in
 * the same `host`-labelled worker log rather than the per-agent guest
 * profile workers.  Tests baseline by file offset and read only the
 * bytes written after their send, which keeps the per-test postmortem
 * clean despite the shared backing file (the suite is `--serial`,
 * so no interleaving).
 *
 * The agentName argument is unused now but kept for call-site
 * compatibility — future per-agent workers would still be discovered
 * here.
 *
 * @param {string} agentName
 * @returns {Promise<string | undefined>}
 */
// eslint-disable-next-line no-unused-vars
const findDriverWorkerLog = async agentName => {
  const targetLabel = 'host';
  let entries;
  try {
    entries = await fs.readdir(WORKER_ROOT, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const dir = path.join(WORKER_ROOT, entry.name);
      const metaPath = path.join(dir, 'worker.meta.json');
      const metaText = await fs.readFile(metaPath, 'utf8').catch(() => '');
      if (metaText) {
        const label = parseLabel(metaText);
        if (label === targetLabel) {
          return path.join(dir, 'worker.log');
        }
      }
    }
  }
  return undefined;
};

/** @param {string} filePath */
const offsetOf = async filePath => {
  try {
    return (await fs.stat(filePath)).size;
  } catch {
    return 0;
  }
};

/**
 * @param {string} filePath
 * @param {number} fromOffset
 * @returns {Promise<string>}
 */
const readSince = async (filePath, fromOffset) => {
  const stat = await fs.stat(filePath);
  if (stat.size <= fromOffset) return '';
  const fh = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(stat.size - fromOffset);
    await fh.read(buf, 0, buf.length, fromOffset);
    return buf.toString('utf8');
  } finally {
    await fh.close();
  }
};

/**
 * Shell-quote `value` for safe inclusion in a single-line command.
 * @param value
 */
const shellQuote = (/** @type {string} */ value) =>
  `'${value.replace(/'/g, "'\\''")}'`;

/**
 * Build the shared `yarn debug:llm ...` prefix that slices the host
 * worker log to one test's agent. Append a view flag (`--tools`,
 * `--summary`, `--chat`) to get a complete command.
 *
 * @param {string} logPath
 * @param {string} agentName
 */
const formatDebugBaseCommand = (logPath, agentName) => {
  const sha = path.basename(path.dirname(logPath));
  return [
    'yarn debug:llm',
    `--state=${shellQuote(STATE_PATH)}`,
    `--worker=${sha}`,
    `--agent=${agentName}`,
  ].join(' ');
};

/**
 * Build the debug commands suggested in the postmortem, one per useful
 * view (tool calls, summary, chat). Each line is independently
 * copy-pasteable.
 *
 * @param {string} logPath
 * @param {string} agentName
 */
const formatPostmortemCommands = (logPath, agentName) => {
  const base = formatDebugBaseCommand(logPath, agentName);
  return [
    `[smoke] postmortem for agent "${agentName}":`,
    `  tool calls:  ${base} --tools`,
    `  summary:     ${base} --summary`,
    `  chat:        ${base} --chat`,
  ].join('\n');
};

// ---------------------------------------------------------------------------
// Inbox helpers
// ---------------------------------------------------------------------------

/**
 * Subset of `StampedMessage` that this file inspects. The daemon
 * exposes a richer type, but it is not exported in a way that's
 * convenient to import here.
 *
 * @typedef {{
 *   number: bigint,
 *   type: string,
 *   from: string,
 *   messageId?: string,
 *   replyTo?: string,
 *   names?: string[],
 *   strings?: string[],
 * }} InboxMessage
 */

/** @param {number} ms */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Reconstruct the internal `<formulaNumber>:<nodeNumber>` formula id
 * from a message's externalized `from` locator
 * (`endo://<nodeNumber>/?id=<formulaNumber>&type=<formulaType>`).
 * `host.identify(name)` returns the internal form (see
 * `formula-identifier.js:94`'s `formatId`), and `mail.js:160-162`
 * externalizes `from`/`to` to URL form before `listMessages` returns
 * them, so a direct `m.from === fromId` comparison can never match.
 *
 * Mirrors `daemon/src/locator.js`'s `internalizeLocator` without
 * pulling its non-public export into the test.
 *
 * @param {string} fromUrl
 * @returns {string | undefined}
 */
const extractFormulaId = fromUrl => {
  if (typeof fromUrl !== 'string') return undefined;
  try {
    const parsed = new URL(fromUrl);
    const number = parsed.searchParams.get('id');
    const node = parsed.host;
    if (!number || !node) return undefined;
    return `${number}:${node}`;
  } catch {
    return undefined;
  }
};

/**
 * Split a prompt around `@<kebab-name>` markers into the
 * `(strings, edgeNames)` shape `host.send` expects.  The recipient's
 * inbox renderer (`src/inbox-message-format.js`) interleaves
 * `strings[i]` with `@${names[i]}` and appends an "Attached references"
 * block listing each edge name with the exact `adoptTool(...)` call to
 * use; without it the agent sees the `@petname` as bare prose and
 * loops on `No reference named "X" in message` errors.
 *
 * Edge names are reused verbatim as pet-name lookups in the sender's
 * namespace — the smoke harness registers every tool under its own
 * kebab-case pet name, so the same identifier works on both sides.
 *
 * @param {string} prompt
 * @returns {{ strings: string[], edgeNames: string[] }}
 */
const parsePromptForEdgeNames = prompt => {
  const re = /@([a-z][a-z0-9-]*)/g;
  const strings = [];
  const edgeNames = [];
  let cursor = 0;
  let m = re.exec(prompt);
  while (m !== null) {
    strings.push(prompt.slice(cursor, m.index));
    edgeNames.push(m[1]);
    cursor = re.lastIndex;
    m = re.exec(prompt);
  }
  strings.push(prompt.slice(cursor));
  return { strings, edgeNames };
};

class SmokeReplyTimeoutError extends Error {}

/**
 * Resolve when a message satisfying `predicate` lands in HOST's inbox,
 * or reject after `timeoutMs`.
 *
 * @param {object} host
 * @param {(msg: InboxMessage) => boolean} predicate
 * @param {number} timeoutMs
 */
const waitForMessage = async (host, predicate, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = /** @type {InboxMessage[]} */ (
      await E(host).listMessages()
    );
    const hit = messages.find(predicate);
    if (hit) return hit;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new SmokeReplyTimeoutError(
    `Timed out after ${timeoutMs}ms waiting for inbox message`,
  );
};

// ---------------------------------------------------------------------------
// Shared daemon + factory state
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   host: any,
 *   factoriesByModel: Map<string, any>,
 *   cancel: (e: Error) => void,
 *   cancelled: Promise<unknown>,
 * }} SharedCtx
 */

/** @type {SharedCtx | null} */
let shared = null;

const daemonConfig = {
  statePath: SMOKE_STATE,
  ephemeralStatePath: SMOKE_RUN,
  cachePath: SMOKE_CACHE,
  sockPath: SMOKE_SOCK,
  pets: new Map(),
  values: new Map(),
};

const setupDaemon = async () => {
  await fs.mkdir(SMOKE_TMP, { recursive: true });
  await fs.mkdir(SMOKE_STATE, { recursive: true });
  await fs.mkdir(SMOKE_RUN, { recursive: true });
  await fs.mkdir(SMOKE_CACHE, { recursive: true });
  console.log(`[smoke] state path: ${STATE_PATH}`);

  // Bind the gateway to an OS-assigned port so it cannot collide with
  // the user's main daemon (which usually holds 8920).
  process.env.ENDO_ADDR = '127.0.0.1:0';
  await purge(daemonConfig);
  await start(daemonConfig);

  const { reject: cancel, promise: cancelled } = makePromiseKit();
  const { getBootstrap } = await makeEndoClient(
    'fae-smoke',
    daemonConfig.sockPath,
    cancelled,
    undefined,
    {
      // Two `console.error` lines fire during a clean teardown that
      // the default `onReject` in `daemon/src/connection.js` would
      // otherwise log unconditionally:
      //
      //   1. `stop()` calls `terminate()` on the daemon, which
      //      rejects the daemon-side cancellation with
      //      `Error('Termination requested')` (`daemon.js:2810`).
      //      The error message rides back over CapTP and our
      //      client's `onReject` fires with it.
      //   2. Our own `shared.cancel(Error('teardown'))` in
      //      `test.after.always` similarly trips `onReject`.
      //
      // The `onReject` callback is a local JS function (CapTP
      // invokes it in-process; it never crosses the wire), so a
      // text-match on the rejection's message is enough to filter
      // those two shutdown signals.  Errors that cross CapTP arrive
      // as passable records (`{ '@@error': true, message, ... }`),
      // not native `Error` instances, so the filter checks
      // `.message` on either shape.  Other CapTP-level errors that
      // occur during a live test still log via the `else` branch.
      onReject: err => {
        const msg =
          err && typeof err === 'object' && typeof err.message === 'string'
            ? err.message
            : String(err);
        if (msg === 'Termination requested' || msg === 'teardown') {
          return;
        }
        console.error('CapTP fae-smoke exception:', err);
      },
    },
  );
  const bootstrap = getBootstrap();
  const host = /** @type {any} */ (E(bootstrap).host());

  // Build one provider value + factory caplet per model under test.
  // Each factory binds to its own `llm-provider` reference (set in the
  // factory's petstore via `storeIdentifier`), so agents created
  // through `factoriesByModel.get(modelName)` chat against that model.
  // The shape stored at each provider name matches what
  // `llm-provider-factory.js` would have stored after a form submit.
  const factoriesByModel = new Map();
  for (const modelName of MODELS) {
    const slug = modelSlug(modelName);
    const providerName = `provider-${slug}`;
    const factoryName = `fae-factory-${slug}`;
    const factoryGuestName = `${factoryName}-handle`;
    const factoryAgentName = `profile-for-${factoryGuestName}`;

    await E(host).storeValue(
      harden({
        host: process.env.LAL_HOST,
        model: modelName,
        authToken: process.env.LAL_AUTH_TOKEN,
      }),
      providerName,
    );

    const providerId = /** @type {string} */ (
      await E(host).identify(providerName)
    );
    await E(host).provideGuest(factoryGuestName, {
      introducedNames: harden({ '@agent': 'host-agent' }),
      agentName: factoryAgentName,
    });
    const factoryPowers = await E(host).lookup(factoryAgentName);
    await E(factoryPowers).storeIdentifier('llm-provider', providerId);
    await E(host).makeUnconfined('@main', factorySpecifier, {
      powersName: factoryAgentName,
      resultName: factoryName,
    });
    const factory = await E(host).lookup(factoryName);
    factoriesByModel.set(modelName, factory);
    console.log(`[smoke] factory ready for model "${modelName}"`);
  }

  // Shared tools — every per-test agent reaches them via `@tool-name`
  // adoption, so we only register them once.  The filesystem-rooted
  // `read-file` tool is created per-test (it needs a per-test FAE_CWD).
  await E(host).makeUnconfined('@main', greetSpecifier, {
    resultName: 'greet-tool',
  });
  await E(host).makeUnconfined('@main', mathSpecifier, {
    resultName: 'math-tool',
  });
  await E(host).makeUnconfined('@main', timestampSpecifier, {
    resultName: 'timestamp-tool',
  });

  shared = { host, factoriesByModel, cancel, cancelled };
};

// ---------------------------------------------------------------------------
// AVA hooks
// ---------------------------------------------------------------------------

test.before(async t => {
  if (!HAS_LLM_CONFIG) return;
  await setupDaemon();
  t.log(`smoke daemon ready at ${SMOKE_SOCK}`);
});

test.after.always(async () => {
  if (!HAS_LLM_CONFIG) return;
  // Order matches `daemon/test/gateway.test.js`'s teardown: stop the
  // daemon first, then cancel the client.  Cancelling before the
  // daemon has shut down races with CapTP teardown.  Pre-attaching
  // `.catch` on `cancelled` keeps Node's unhandled-rejection handler
  // quiet for the teardown rejection itself; the client's custom
  // `onReject` (set in `setupDaemon`) filters the matching CapTP
  // shutdown-noise lines.
  await stop(daemonConfig).catch(() => undefined);
  if (shared) {
    shared.cancelled.catch(() => {});
    shared.cancel(Error('teardown'));
  }
  delete process.env.ENDO_ADDR;
});

/**
 * Per-test setup: mkdtemp a scratch FAE_CWD and initialise the test's
 * `t.context` shell.  Agent creation is deferred to `provisionAgent`,
 * which the macro body calls once it knows which model to bind to.
 *
 * The temp dir is created here (not in `provisionAgent`) so that
 * `test.afterEach.always` can rm it even if a macro throws before
 * provisioning.
 */
test.beforeEach(async t => {
  if (!HAS_LLM_CONFIG) return;

  const slug = t.title
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 60);
  const cwd = await fs.mkdtemp(path.join(SMOKE_TMP, `cwd-${slug}-`));
  t.context = {
    agentName: '',
    fromId: '',
    cwd,
    workerLog: '',
    postmortem: null,
  };
});

/**
 * Create a fresh fae agent against the factory bound to `modelName`,
 * populate `t.context.{agentName, fromId, workerLog}`, and drain the
 * agent's `Fae agent ready.` boot announcement so it is not mistaken
 * for the reply to the macro's first send.
 *
 * @param {import('ava').ExecutionContext<TestCtx>} t
 * @param {string} modelName
 */
const provisionAgent = async (t, modelName) => {
  if (!shared) throw new Error('shared daemon ctx not initialised');
  const factory = shared.factoriesByModel.get(modelName);
  if (!factory) {
    throw new Error(
      `No factory registered for model "${modelName}". ` +
        `Available: ${[...shared.factoriesByModel.keys()].join(', ') || '(none)'}`,
    );
  }

  const slug = t.title
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 60);
  const agentName = `fae-${slug}-${Date.now().toString(36)}`;
  t.context.agentName = agentName;

  await E(factory).createAgent(agentName, harden({}));

  // The host stores the agent's guest under `agentName` (`agent.js:621,
  // 632-634`), so `identify` returns the guest's formula id — the same
  // value the agent stamps as `from` on outbound messages (mailbox
  // `selfId`).  Determining it deterministically here lets parallel
  // tests filter their replies without racing over "Fae agent ready."
  // announcements landing in HOST's shared inbox.
  t.context.fromId = /** @type {string} */ (
    await E(shared.host).identify(agentName)
  );
  t.context.workerLog = (await findDriverWorkerLog(agentName)) ?? '';

  await waitForMessage(
    shared.host,
    m =>
      m.type === 'package' &&
      extractFormulaId(m.from) === t.context.fromId &&
      Array.isArray(m.strings) &&
      m.strings.some(s => /Fae agent ready\./i.test(s)),
    REPLY_TIMEOUT_MS,
  );

  t.log(
    `created agent "${agentName}" model=${modelName} ` +
      `fromId=${t.context.fromId.slice(0, 12)}…`,
  );
};

const FRESH_AGENT_ATTEMPTS = 2;

/**
 * Re-run one smoke scenario on a fresh agent when a live provider call
 * never returns.  A wedged agent cannot process a second prompt, so
 * retrying the send alone is ineffective.
 *
 * @template T
 * @param {import('ava').ExecutionContext<TestCtx>} t
 * @param {string} modelName
 * @param {() => Promise<T>} run
 */
const runWithFreshAgentRetries = async (t, modelName, run) => {
  for (let attempt = 1; attempt <= FRESH_AGENT_ATTEMPTS; attempt += 1) {
    await provisionAgent(t, modelName);
    try {
      return await run();
    } catch (error) {
      if (
        !(error instanceof SmokeReplyTimeoutError) ||
        attempt === FRESH_AGENT_ATTEMPTS
      ) {
        throw error;
      }
      t.log(
        `reply timeout on attempt ${attempt}/${FRESH_AGENT_ATTEMPTS}; ` +
          'retrying the smoke case with a fresh agent',
      );
    }
  }
  throw new Error('unreachable');
};

test.afterEach.always(async t => {
  if (!HAS_LLM_CONFIG) return;
  const { cwd, postmortem, agentName } = t.context;
  if (cwd) {
    await fs.rm(cwd, { recursive: true, force: true });
  }
  if (!postmortem) return;
  const { logPath, logTail } = postmortem;

  if (t.passed) {
    if (logPath && agentName) {
      t.log(`log: ${logPath}`);
      t.log(
        `tool calls: ${formatDebugBaseCommand(logPath, agentName)} --tools`,
      );
    }
    return;
  }

  if (logTail) {
    console.error('--- worker.log tail (last 4 KB) ---');
    console.error(logTail.slice(-4096));
    console.error('--- end worker.log tail ---');
  }
  if (logPath && agentName) {
    console.error(formatPostmortemCommands(logPath, agentName));
  }
});

// ---------------------------------------------------------------------------
// sendAndAwaitReply
// ---------------------------------------------------------------------------

/**
 * Send `prompt` to the test's agent and resolve to its next reply.
 * Filters on `t.context.fromId` so parallel tests don't pick up each
 * other's replies from HOST's shared inbox.
 *
 * @param {import('ava').ExecutionContext<TestCtx>} t
 * @param {string} prompt
 */
const sendOnce = async (t, prompt) => {
  if (!shared) throw new Error('shared daemon ctx not initialised');
  const { agentName, fromId } = t.context;

  // Resolve the driver worker's log path lazily on the first send: a
  // freshly-created driver may not yet have written `worker.log` when
  // `beforeEach` ran.  Once resolved, the path is stable across the
  // test's remaining sends.
  if (!t.context.workerLog) {
    t.context.workerLog = (await findDriverWorkerLog(agentName)) ?? '';
  }
  const { workerLog } = t.context;
  const logBaseline = workerLog ? await offsetOf(workerLog) : 0;
  t.context.postmortem = {
    logPath: workerLog,
    baseline: logBaseline,
    logTail: '',
  };

  const before = /** @type {InboxMessage[]} */ (
    await E(shared.host).listMessages()
  );
  const inboxBaseline = before.length ? before[before.length - 1].number : 0n;

  const { strings, edgeNames } = parsePromptForEdgeNames(prompt);
  t.log(
    `send to ${agentName} (workerLog=${workerLog ? 'found' : 'missing'}) ` +
      `strings=${strings.length} edgeNames=${
        edgeNames.length ? edgeNames.join(',') : '(none)'
      } fromId=${fromId.slice(0, 12)}…`,
  );
  await E(shared.host).send(agentName, strings, edgeNames, edgeNames);
  const afterSend = /** @type {InboxMessage[]} */ (
    await E(shared.host).listMessages()
  );
  const sentPackage = afterSend.find(
    m =>
      m.number > inboxBaseline &&
      m.type === 'package' &&
      m.replyTo === undefined &&
      JSON.stringify(m.strings ?? []) === JSON.stringify(strings) &&
      JSON.stringify(m.names ?? []) === JSON.stringify(edgeNames),
  );
  if (!sentPackage?.messageId) {
    throw new Error('Could not identify sent smoke package in host inbox');
  }

  let reply;
  try {
    reply = await waitForMessage(
      shared.host,
      m =>
        m.number > sentPackage.number &&
        m.type === 'package' &&
        m.replyTo === sentPackage.messageId,
      REPLY_TIMEOUT_MS,
    );
  } catch (err) {
    const after = /** @type {InboxMessage[]} */ (
      await E(shared.host).listMessages()
    );
    const candidates = after.filter(m => m.number > inboxBaseline);
    t.log(
      `waitForMessage timed out after ${REPLY_TIMEOUT_MS}ms; ` +
        `${candidates.length} new inbox message(s) since baseline ${inboxBaseline}; ` +
        `none matched replyTo=${sentPackage.messageId.slice(0, 12)}…`,
    );
    for (const m of candidates.slice(-5)) {
      t.log(
        `  · #${m.number} type=${m.type} from=${String(m.from).slice(0, 20)}… ` +
          `strings=${JSON.stringify((m.strings ?? []).map(s => s.slice(0, 60)))}`,
      );
    }
    throw err;
  }

  const logTail =
    workerLog && (await offsetOf(workerLog)) > logBaseline
      ? await readSince(workerLog, logBaseline)
      : '';
  t.context.postmortem = { logPath: workerLog, baseline: logBaseline, logTail };

  const text = Array.isArray(reply.strings)
    ? reply.strings.join('')
    : String(reply);
  return { text, logTail };
};

// ---------------------------------------------------------------------------
// Provider-error classification + retry
// ---------------------------------------------------------------------------
//
// Tests run in parallel within the file, which can briefly push past
// the LLM provider's per-second / per-minute rate-limit bucket
// (e.g. ≈ 1 req/s on free-tier OpenRouter, 50 req/min on Anthropic
// free tier).  Provider clients in `packages/lal/providers/` do not
// retry on 429 — the error propagates straight into the reply text.
// We classify the reply and retry transient hits with exponential
// backoff + jitter; permanent errors (auth, invalid key) fail
// immediately without burning the retry budget.

const PROVIDER_PERMANENT_RE = /invalid_api_key|authentication_error|\b401\b/i;
const PROVIDER_TRANSIENT_RE =
  /\b429\b|Rate limit exceeded|insufficient_quota|temporar(y|ily)/i;

/** @param {string} replyText */
const isPermanentProviderError = replyText =>
  PROVIDER_PERMANENT_RE.test(replyText);

/** @param {string} replyText */
const isTransientProviderError = replyText =>
  !isPermanentProviderError(replyText) && PROVIDER_TRANSIENT_RE.test(replyText);

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1500;
const RETRY_JITTER_MS = 500;

/**
 * Send `prompt` and retry the send when the reply looks like a
 * transient provider error (429 / quota / rate-limit / temporary).
 * Permanent errors are returned to the caller so the test fails fast.
 *
 * @param {import('ava').ExecutionContext<TestCtx>} t
 * @param {string} prompt
 */
const sendAndAwaitReply = async (t, prompt) => {
  /** @type {{ text: string, logTail: string }} */
  let last = { text: '', logTail: '' };
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt += 1) {
    last = await sendOnce(t, prompt);
    if (!isTransientProviderError(last.text)) return last;
    if (attempt < RETRY_ATTEMPTS - 1) {
      const wait =
        RETRY_BASE_DELAY_MS * 2 ** attempt +
        Math.floor(Math.random() * RETRY_JITTER_MS);
      t.log(
        `transient provider error (attempt ${attempt + 1}/${RETRY_ATTEMPTS}); ` +
          `backing off ${wait}ms: ${last.text.slice(0, 120)}`,
      );
      await sleep(wait);
    }
  }
  return last;
};

/**
 * Fail the current test if the reply is a provider error that the
 * retry loop above could not recover from — either an auth/permanent
 * error or a transient error that survived all retries.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {string} replyText
 */
const failOnProviderError = (t, replyText) => {
  if (isPermanentProviderError(replyText)) {
    t.fail(`provider auth error: ${replyText.slice(0, 200)}`);
  } else if (isTransientProviderError(replyText)) {
    t.fail(
      `provider rate-limit / quota error survived ${RETRY_ATTEMPTS} retries: ${replyText.slice(
        0,
        200,
      )}`,
    );
  }
};

// ---------------------------------------------------------------------------
// Test macros (replayed once per model in `REGISTRATION_MODELS`)
// ---------------------------------------------------------------------------
//
// Each macro:
//   1. Calls `provisionAgent(t, modelName)` to bind `t.context` to a
//      fresh agent against the factory for `modelName`.
//   2. Runs the test body.
//   3. Renders its AVA row title as `<test-name> [<modelName>]` so each
//      `(test, model)` pair is a distinct row in `--list-tests` and in
//      the TAP / postmortem output.

const basicChatMacro = test.macro({
  /**
   * @param {import('ava').ExecutionContext<TestCtx>} t
   * @param {string} modelName
   */
  exec: async (t, modelName) => {
    await runWithFreshAgentRetries(t, modelName, async () => {
      const { text, logTail } = await sendAndAwaitReply(
        t,
        'Smoke test: please reply with the single word "ack" and nothing else.',
      );
      t.log(`reply: ${text.slice(0, 200)}`);
      failOnProviderError(t, text);
      t.regex(text.toLowerCase(), /ack/, 'reply should contain "ack"');
      t.truthy(logTail, 'worker.log tail should be captured');
    });
  },
  title: (provided, modelName) => `basic-chat [${modelName}]`,
});

const replyToolMacro = test.macro({
  /**
   * @param {import('ava').ExecutionContext<TestCtx>} t
   * @param {string} modelName
   */
  exec: async (t, modelName) => {
    await runWithFreshAgentRetries(t, modelName, async () => {
      const { text, logTail } = await sendAndAwaitReply(
        t,
        'Smoke test: please respond with a brief hello.',
      );
      t.log(`reply: ${text.slice(0, 200)}`);
      failOnProviderError(t, text);
      t.truthy(logTail, 'worker.log tail should be captured');
      t.regex(
        logTail,
        /\[tool\] reply\(/,
        'worker.log should show `[tool] reply(...)`',
      );
    });
  },
  title: (provided, modelName) => `reply-tool [${modelName}]`,
});

const timestampMacro = test.macro({
  /**
   * @param {import('ava').ExecutionContext<TestCtx>} t
   * @param {string} modelName
   */
  exec: async (t, modelName) => {
    await runWithFreshAgentRetries(t, modelName, async () => {
      const { text, logTail } = await sendAndAwaitReply(
        t,
        'Here is a timestamp tool @timestamp-tool. ' +
          'Adopt it, then call it and tell me the current ISO time in your reply.',
      );
      t.log(`reply: ${text.slice(0, 200)}`);
      failOnProviderError(t, text);
      t.truthy(logTail, 'worker.log tail should be captured');
      const usedTimestampCapability =
        /\[tool\] timestampTool\(/.test(logTail) ||
        /\[tool\] exec\(\{code:".*timestamp-tool/s.test(logTail);
      t.true(
        usedTimestampCapability,
        'worker.log should show timestamp-tool capability use',
      );
      // The daemon-side `[tool] X -> "…"` line is emitted by `agent.js`
      // when the tool returns; the model cannot fabricate it.  The exact
      // format the tool returns depends on the `timezone` argument the
      // model passes — under SES, `Date.prototype.toLocaleString` falls
      // back to `Date.prototype.toString()` output because `Intl` is
      // unavailable, so the result is not necessarily ISO.  Asserting on
      // the model's ISO-formatted reply (below) covers the end-to-end
      // requirement without coupling to the tool's per-arg output shape.
      const sawTimestampResult =
        /\[tool\] timestampTool -> "[^"]*\d{4}[^"]*"/.test(logTail) ||
        /\[tool\] exec -> .*?\d{4}/.test(logTail);
      t.true(
        sawTimestampResult,
        'worker.log should show a timestamp result containing a year',
      );
      t.regex(
        logTail,
        /\[tool\] adoptTool\([^\n]*timestamp-tool/,
        'worker.log should show `[tool] adoptTool(...)` for timestamp-tool',
      );
      t.regex(
        text,
        /\d{4}-\d{2}-\d{2}/,
        'reply should contain an ISO-ish date',
      );
    });
  },
  title: (provided, modelName) => `timestamp [${modelName}]`,
});

const mathMacro = test.macro({
  /**
   * @param {import('ava').ExecutionContext<TestCtx>} t
   * @param {string} modelName
   */
  exec: async (t, modelName) => {
    await runWithFreshAgentRetries(t, modelName, async () => {
      const { text, logTail } = await sendAndAwaitReply(
        t,
        'Here is a math tool @math-tool. ' +
          'Adopt it, then use it to compute 7 * 6 and reply with just the number.',
      );
      t.log(`reply: ${text.slice(0, 200)}`);
      failOnProviderError(t, text);
      t.truthy(logTail, 'worker.log tail should be captured');
      const usedMathCapability =
        /\[tool\] mathTool\(/.test(logTail) ||
        /\[tool\] exec\(\{code:".*math-tool/s.test(logTail);
      t.true(
        usedMathCapability,
        'worker.log should show math-tool capability use',
      );
      t.regex(text, /\b42\b/, 'reply should contain "42"');
    });
  },
  title: (provided, modelName) => `math [${modelName}]`,
});

const readFileMacro = test.macro({
  /**
   * @param {import('ava').ExecutionContext<TestCtx>} t
   * @param {string} modelName
   */
  exec: async (t, modelName) => {
    await runWithFreshAgentRetries(t, modelName, async () => {
      if (!shared) throw new Error('shared daemon ctx not initialised');
      // The read-file tool's root is fixed at creation, so for per-test
      // isolation we create one rooted at this test's mkdtemp FAE_CWD.
      // The tool's petname is unique per test so adoption picks it up by
      // name rather than colliding with siblings.
      const toolName = `read-file-${t.context.agentName}`;
      await E(shared.host).makeUnconfined('@main', readFileSpecifier, {
        resultName: toolName,
        env: harden({ FAE_CWD: t.context.cwd }),
      });

      const sentinelName = 'fae-smoke-sentinel.json';
      const sentinelToken = `FAE_SMOKE_${Date.now().toString(36)}`;
      await fs.writeFile(
        path.join(t.context.cwd, sentinelName),
        JSON.stringify({ token: sentinelToken }, null, 2),
      );

      const adoption = await sendAndAwaitReply(
        t,
        `Here is a read-file tool @${toolName}. ` +
          `Adopt it, then reply with the single word "adopted".`,
      );
      t.log(`adoption reply: ${adoption.text.slice(0, 200)}`);
      failOnProviderError(t, adoption.text);
      t.regex(
        adoption.logTail,
        /\[tool\] adoptTool\(/,
        'worker.log should show `[tool] adoptTool(...)`',
      );

      const reply = await sendAndAwaitReply(
        t,
        `Read "${sentinelName}" and tell me the value of ` +
          `the "token" field exactly as it appears.`,
      );
      t.log(`reply: ${reply.text.slice(0, 200)}`);
      failOnProviderError(t, reply.text);
      const usedReadFileCapability =
        /\[tool\] readFile\S*\(/.test(reply.logTail) ||
        new RegExp(String.raw`\[tool\] exec\(\{code:".*${toolName}`, 's').test(
          reply.logTail,
        );
      t.true(
        usedReadFileCapability,
        'worker.log should show read-file capability use',
      );
      t.true(
        reply.text.includes(sentinelToken),
        `reply should contain the sentinel token "${sentinelToken}"`,
      );
    });
  },
  title: (provided, modelName) => `read-file [${modelName}]`,
});

// ---------------------------------------------------------------------------
// Macro registration
// ---------------------------------------------------------------------------
//
// One AVA row per `(macro, modelName)` pair.  When `HAS_LLM_CONFIG`
// is false `smokeTest === test.skip`, so the rows register but never
// run.  If neither `LAL_MODEL` nor `LAL_MODELS` is set `MODELS` is
// empty and the loop registers nothing — AVA will note the file as
// "no tests", which is the right answer for a fully unconfigured run.

for (const modelName of MODELS) {
  smokeTest(basicChatMacro, modelName);
  smokeTest(replyToolMacro, modelName);
  smokeTest(timestampMacro, modelName);
  smokeTest(mathMacro, modelName);
  smokeTest(readFileMacro, modelName);
}
