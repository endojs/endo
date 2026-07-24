// @ts-check
/* eslint-disable no-await-in-loop */
/* global process */

/**
 * ClaudeSandbox factory caplet.
 *
 * Presents a "Create Claude Sandbox" form on `@host`'s inbox. Each
 * submission validates the inputs (the `Filesystem` pet name exists,
 * the network profile and rootfs parse), then formulates the session
 * as a first-class `claude-client` caplet via `makeUnconfined`,
 * parameterised by `env`, and stores it under the chosen pet name.
 *
 * The heavy lifting — mounting the `Filesystem` over 9P, registering
 * the mountpoint as a daemon `Mount` cap (`provideMount`), minting the
 * `@endo/sandbox` podman slice, and materialising the credential —
 * lives in [`claude-client-module.js`](./claude-client-module.js),
 * which the client formula runs lazily on first use. The factory does
 * *not* hold those live handles, because an `@endo/sandbox` slice and a
 * 9P mount handle are worker-local remotables with no formula identity:
 * a separately-formulated client cannot receive them across a formula
 * boundary, so the client re-creates them itself from its `env`. This
 * is what gives the stored `ClaudeClient` a real daemon identity (so
 * `storeValue` works) and lets it reincarnate across daemon restarts.
 *
 * This is "plan B" workspace projection: the 9P mount happens on the
 * host (which needs `CAP_SYS_ADMIN` or passwordless `sudo` for
 * `mount`/`umount`, configured on the `fs-mounter` caplet), and the
 * container merely bind-mounts the resulting host mountpoint. Rootless
 * podman cannot itself run `mount -t 9p`, which is why the mount is
 * not performed inside the container.
 *
 * The factory is unconfined and trusted: it holds full host authority
 * via `host-agent` (the `@agent` cap). The credential secret never
 * passes through the factory — only the credential's pet name does, in
 * the client formula's `env`. Treat its source as part of the trusted
 * compute base.
 *
 * @module
 */

import os from 'node:os';
import nodePath from 'node:path';

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

/** @import { FarRef } from '@endo/eventual-send' */

import { parseRootfs, rootfsLabel } from './parse-rootfs.js';

const clientModuleSpecifier = new URL(
  './claude-client-module.js',
  import.meta.url,
).href;

/**
 * Source for a **per-session powers** cap, built by the factory via
 * `E(hostAgent).evaluate(...)`. It is a total attenuation of the host: it
 * closes over the four caps the client needs (resolved once, by reference,
 * from the endowed pet names) and `@agent`, and exposes **only** four
 * accessors plus a `provideMount` bounded to *this session's* workspace
 * mountpoint. There is no `lookup`, so the client cannot reach any host
 * name beyond its own caps.
 *
 * Endowed in the eval compartment (see `packages/daemon/src/worker.js`):
 * `makeExo`, `M`, `E`, plus `agent` / `sandboxFactory` / `fsMounter` /
 * `filesystem` / `credentials` (the last omitted when the session has no
 * credential — the accessor is then a baked `null`).
 *
 * @param {string} mountPoint - the session's host 9P mountpoint; the only
 *   path `provideMount` will accept.
 * @param {string} mountName - the session's workspace Mount pet name; the only
 *   name `provideMount` will register (and the one `removeMount` reclaims).
 * @param {boolean} hasCredentials
 * @returns {string}
 */
const buildSessionPowersSource = (
  mountPoint,
  mountName,
  hasCredentials,
) => `makeExo(
  'ClaudeSessionPowers',
  M.interface('ClaudeSessionPowers', {
    sandboxFactory: M.call().returns(M.any()),
    fsMounter: M.call().returns(M.any()),
    filesystem: M.call().returns(M.any()),
    credentials: M.call().returns(M.any()),
    provideMount: M.call(M.string(), M.string()).returns(M.promise()),
    removeMount: M.call().returns(M.promise()),
    help: M.call().returns(M.string()),
  }),
  {
    sandboxFactory: () => sandboxFactory,
    fsMounter: () => fsMounter,
    filesystem: () => filesystem,
    credentials: () => ${hasCredentials ? 'credentials' : 'null'},
    provideMount: (path, name) => {
      // Bound to *exactly* this session's mountpoint AND its workspace Mount
      // pet name. Without the name bound, this accessor would be a
      // host-namespace write gadget (provideMount registers 'name' at the
      // host root), defeating the "no other host reach" attenuation.
      if (path !== ${JSON.stringify(mountPoint)}) {
        throw Error('claude-sandbox session powers: provideMount restricted to this session workspace mountpoint');
      }
      if (name !== ${JSON.stringify(mountName)}) {
        throw Error('claude-sandbox session powers: provideMount restricted to this session workspace Mount name');
      }
      return E(agent).provideMount(path, name);
    },
    // Scoped teardown: remove *only* this session's workspace Mount pet name
    // (which provideMount registered at the host root) so it does not leak a
    // live Mount formula after the client is torn down.
    removeMount: () => E(agent).remove(${JSON.stringify(mountName)}),
    help: () =>
      'Per-session claude-sandbox powers: sandboxFactory/fsMounter/filesystem/credentials accessors + provideMount/removeMount bounded to this session workspace. No lookup.',
  },
)`;

/**
 * Subset of the inbox message shape this caplet reads. The `@host`
 * inbox API is dynamically typed at the Endo boundary; we narrow at
 * the read site.
 *
 * @typedef {object} InboxMessage
 * @property {string} from
 * @property {'form' | 'value' | string} type
 * @property {string} [messageId]
 * @property {string} [replyTo]
 * @property {number} number
 * @property {string} [valueId]
 */

/**
 * Subset of the "Create Claude Sandbox" form submission.
 *
 * @typedef {object} SandboxFormSubmission
 * @property {string} name
 * @property {string} filesystem
 * @property {string} [rootfs]
 * @property {string} [network]
 * @property {string} [model]
 * @property {string} [credentials]
 * @property {string} [initialPrompt]
 */

/**
 * Constructor wrapper / test-injection bag passed as the third arg.
 *
 * @typedef {object} ContextOrDeps
 * @property {Record<string, string>} [env]
 * @property {(readerRef: any) => AsyncIterator<any>} [iterateMessages] -
 *   Adapt the guest message reader into an async iterator (tests);
 *   defaults to `@endo/exo-stream`'s `iterateReader`.
 * @property {(readerRef: any) => AsyncIterator<any>} [iterateHostMessages] -
 *   Adapt the host message reader for the session-request loop (tests);
 *   defaults to `iterateReader` in production, off when only
 *   `iterateMessages` is injected.
 */

const FactoryInterface = M.interface('ClaudeSandboxFactory', {
  help: M.call().optional(M.string()).returns(M.string()),
});

const FORM_DESCRIPTION = 'Create Claude Sandbox';

const FORM_FIELDS = harden([
  {
    name: 'name',
    label: 'Pet name for the new ClaudeClient',
    default: 'claude-1',
  },
  {
    name: 'filesystem',
    label: 'Pet name of a Filesystem capability in @host petstore',
    example: 'Examples: my-workspace, project-fs',
  },
  {
    name: 'rootfs',
    label:
      'Container rootfs — an OCI image with BOTH node and the claude CLI (or host-bind/minimal). Leaving this blank uses the built-in default node image, which does NOT include claude: the session then fails with "claude: not found". Set CLAUDE_SANDBOX_IMAGE on the daemon or supply an image here.',
    default: '',
    example: 'Examples: oci:docker.io/myorg/claude:latest, host-bind',
  },
  {
    name: 'network',
    label: 'Sandbox network profile',
    default: 'private',
    example:
      'none | private   (no host networking; private = internet, no host reach)',
  },
  {
    name: 'model',
    label: 'Claude model id (optional)',
    default: '',
    example: 'Examples: claude-sonnet-4-6, claude-opus-4-7',
  },
  {
    name: 'credentials',
    label: 'Pet name of a ClaudeCredentials cap (optional)',
    default: '',
    example: 'Examples: claude-credentials',
  },
  {
    name: 'initialPrompt',
    label: 'Initial prompt (optional)',
    default: '',
  },
]);

const SANDBOX_WORKSPACE_PATH = '/workspace';

// No host networking. A session gets either `none` (fully isolated — Claude
// can't reach the Anthropic API or package registries) or `private` (an
// isolated network namespace with outbound internet via NAT, but no reach to
// the host's loopback/LAN/services). `private` is the default: it lets Claude
// call the API and install deps while keeping the container off the host's
// network. The `host-loopback` / `host-lan` / `host-net` profiles are
// deliberately not offered — bridging a sandboxed session onto the host
// network is exactly what this package exists to avoid.
const ALLOWED_NETWORKS = harden(['none', 'private']);

/**
 * Slugify a pet name into a filesystem- and pet-name-safe token used
 * for the per-session mountpoint and workspace pet name. Pet names are
 * already lowercase/alnum/hyphen; this is belt-and-suspenders so an
 * unexpected input cannot escape the mount base dir.
 *
 * @param {string} name
 */
const slugify = name =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'claude';

/**
 * Factory caplet entry point.
 *
 * The third argument is overloaded: Endo's `makeUnconfined` worker
 * path passes the frozen `{ env }` wrapper; tests pass an
 * `iterateMessages` adapter to drive the inbox loop synchronously.
 *
 * @param {FarRef<object>} guestPowers
 * @param {Promise<object> | object | undefined} _context
 * @param {ContextOrDeps} [contextOrDeps]
 * @returns {object}
 */
export const make = (guestPowers, _context, contextOrDeps = {}) => {
  /** @type {any} */
  const powers = guestPowers;
  const deps = contextOrDeps;
  const env = deps.env ?? {};

  const sandboxFactoryName =
    env.SANDBOX_FACTORY_NAME ||
    process.env.SANDBOX_FACTORY_NAME ||
    'sandbox-factory';
  const fsMounterName =
    env.FS_MOUNTER_NAME || process.env.FS_MOUNTER_NAME || 'fs-mounter';
  // Directory the host-side infra caplets (`sandbox-factory`, `fs-mounter`)
  // live under, so the per-session powers can endow them by path. Empty
  // means they sit at the host root (the bare names). Set by the
  // provisioner (factory.js) to the factory's own directory.
  const sandboxNamespace =
    env.SANDBOX_NAMESPACE || process.env.SANDBOX_NAMESPACE || '';
  /** @param {string} name @returns {string | string[]} */
  const underNamespace = name =>
    sandboxNamespace ? [sandboxNamespace, name] : name;
  const backend =
    env.CLAUDE_SANDBOX_BACKEND ||
    process.env.CLAUDE_SANDBOX_BACKEND ||
    'podman';
  const defaultImage =
    env.CLAUDE_SANDBOX_IMAGE || process.env.CLAUDE_SANDBOX_IMAGE || undefined;
  const mountBaseDir =
    env.CLAUDE_SANDBOX_MOUNT_DIR ||
    process.env.CLAUDE_SANDBOX_MOUNT_DIR ||
    os.tmpdir();
  const iterateMessages = deps.iterateMessages ?? iterateReader;
  // The session-request loop watches the **host** mailbox (peers send their
  // caps there as a package; see `handleSessionRequest`). In production it
  // defaults to `iterateReader`; unit tests that only inject `iterateMessages`
  // (the guest form loop) leave it off so it does not compete for the mock
  // iterator. The package path is covered by the live two-daemon test and by
  // unit tests that opt in via `iterateHostMessages` (see factory.test.js).
  const iterateHostMessages =
    deps.iterateHostMessages ??
    (deps.iterateMessages ? undefined : iterateReader);

  // Monotonic per-worker counter so two sessions formulated in the same
  // millisecond get distinct ids (and hence distinct mountpoints + workspace
  // pet names). `Date.now()` alone collides for same-name same-ms requests.
  let sessionCounter = 0;
  // Distinct counter for the temporary adopt names minted before a session id
  // exists (the `adopt` happens before the core runs).
  let tempCounter = 0;

  /** @type {Promise<any> | undefined} */
  let hostAgentP;
  const getHostAgent = () => {
    if (hostAgentP === undefined) {
      hostAgentP = E(powers).lookup('host-agent');
    }
    return hostAgentP;
  };

  /**
   * Core: formulate the per-session powers cap + `claude-client` from caps
   * that already carry a host **pet name** (or path). The powers `evaluate`
   * endows its caps **by name**, so the caller must have given each cap a host
   * name first — an existing operator pet name (the form path) or an `adopt`ed
   * name (a remote peer's caps; the mailbox session-request path). A bare CapTP
   * presence has no formula id and cannot be endowed, which is why a cap is
   * never wired in directly and there is no cap-argument entry point.
   *
   * `removeNames` are the *temporary* endowment names the caller minted (the
   * adopt path's `*-fscap`/`*-credcap`); the core removes them (with
   * `powersName`) after `makeUnconfined`. Each stays reachable for the client's
   * lifetime via the powers→endowment and client→powers dependency edges, so
   * dropping the names leaves no host-petstore residue. (An adopted cap is
   * *additionally* pinned by the host's `thisDiesIfThatDies` import edge, which
   * is scoped to the **host's** lifetime, not the client's — a superset, so it
   * over-retains rather than under-retains; there is no daemon un-import
   * primitive to release it early.) The form path passes no `removeNames` — its
   * endowment names are the operator's own durable names.
   *
   * `resultName` stores the client under that pet name — a host-side GC root.
   * Both create paths are host-rooted (mailbox delivery attaches the client by
   * name); destroy a session with `E(host).remove(name)`. See DESIGN.md
   * § Lifecycle.
   *
   * @param {object} spec
   * @param {string} spec.name
   * @param {string|string[]} spec.filesystemName - host pet name/path of a `Filesystem`.
   * @param {string|string[]|null} [spec.credentialsName] - host pet name/path of a `ClaudeCredentials`.
   * @param {string} [spec.rootfs]
   * @param {string} [spec.network]
   * @param {string} [spec.model]
   * @param {string} [spec.initialPrompt]
   * @param {{ resultName?: string|string[], removeNames?: (string|string[])[] }} [opts]
   * @returns {Promise<{ client: any, sessionId: string, hostMountPoint: string, rootfsLabel: string }>}
   */
  const formulateSessionFromPetNames = async (
    spec,
    { resultName, removeNames = [] } = {},
  ) => {
    const {
      name,
      filesystemName,
      credentialsName = null,
      rootfs: rootfsValue = '',
      network = 'private',
      model = '',
      initialPrompt = '',
    } = spec;

    const hostAgent = await getHostAgent();

    // Best-effort cleanup of every temporary name this formulation touches
    // (the caller's adopt names plus the per-session powers) so a
    // failure at *any* step — validation, evaluate, makeUnconfined — strands
    // nothing on the host. Names not (yet) present are ignored.
    /** @type {Array<string | string[]>} */
    let toCleanup = [...removeNames];
    try {
      if (!name) throw new Error('Missing "name".');
      if (!filesystemName) throw new Error('Missing filesystem.');
      if (!ALLOWED_NETWORKS.includes(network)) {
        throw new Error(
          `Unknown network profile "${network}"; expected one of ${ALLOWED_NETWORKS.join(', ')}.`,
        );
      }
      const parsedRootfs = parseRootfs(rootfsValue, { defaultImage });

      const slug = slugify(name);
      sessionCounter += 1;
      const sessionId = `${slug}-${Date.now().toString(36)}-${sessionCounter.toString(36)}`;
      const hostMountPoint = nodePath.join(
        mountBaseDir,
        `claude-sandbox-${sessionId}`,
      );
      const workspacePetName = `claude-${sessionId}-workspace`;

      // Least authority: the client runs as a **per-session powers** cap that
      // bundles its four caps by reference and a `provideMount` bounded to this
      // session's mountpoint — no `lookup`, no other host reach. `evaluate`
      // endows them **by name**: the infra caps (`@agent`, `sandbox-factory`,
      // `fs-mounter`) are the host's own (under the factory's directory), and
      // the `filesystem` / `credentials` names are an existing operator name
      // (the form path) or an `adopt`ed name (the peer's package). The powers
      // name is removed right after `makeUnconfined`; it stays reachable
      // for the client's lifetime via the make-unconfined→powers edge.
      const powersName = `claude-${sessionId}-powers`;
      toCleanup = [powersName, ...removeNames];
      const codeNames = ['agent', 'sandboxFactory', 'fsMounter', 'filesystem'];
      const petNames = [
        '@agent',
        underNamespace(sandboxFactoryName),
        underNamespace(fsMounterName),
        filesystemName,
      ];
      if (credentialsName) {
        codeNames.push('credentials');
        petNames.push(credentialsName);
      }
      await E(hostAgent).evaluate(
        '@main',
        buildSessionPowersSource(
          hostMountPoint,
          workspacePetName,
          Boolean(credentialsName),
        ),
        harden(codeNames),
        harden(petNames),
        powersName,
      );

      /** @type {Record<string, any>} */
      const options = {
        powersName,
        env: harden({
          SESSION_ID: sessionId,
          CREATED_AT: new Date().toISOString(),
          WORKSPACE_MOUNT_POINT: hostMountPoint,
          WORKSPACE_PET_NAME: workspacePetName,
          WORKSPACE_PATH: SANDBOX_WORKSPACE_PATH,
          BACKEND: backend,
          NETWORK: network,
          CLAUDE_ROOTFS: rootfsValue,
          DEFAULT_IMAGE: defaultImage ?? '',
          MODEL: model,
          INITIAL_PROMPT: initialPrompt,
        }),
      };
      if (resultName !== undefined) {
        options.resultName = resultName;
      }
      const client = await E(hostAgent).makeUnconfined(
        '@main',
        clientModuleSpecifier,
        harden(options),
      );

      // Unname the per-session powers and any temporary endowment names. Each
      // formula's dependency edge (make-unconfined→powers, powers→endowment)
      // keeps it reachable for exactly the client's lifetime, so dropping the
      // names leaves no host-petstore residue. This runs *after* the client is
      // created and stored, so cleanup is strictly best-effort: a failed
      // `remove` must not turn a completed session into a reported failure
      // (which would strand a live orphan behind an error reply) — hence
      // `allSettled`, matching the catch path below.
      await Promise.allSettled(toCleanup.map(n => E(hostAgent).remove(n)));

      return harden({
        client,
        sessionId,
        hostMountPoint,
        rootfsLabel: rootfsLabel(parsedRootfs),
      });
    } catch (error) {
      await Promise.allSettled(toCleanup.map(n => E(hostAgent).remove(n)));
      throw error;
    }
  };

  /**
   * Handle a remote peer's **session-request package** (delivered to the host
   * mailbox). A capability can only cross a daemon boundary with its identity
   * intact through `send`/`adopt`: a cap passed as a plain method argument
   * arrives as an unadoptable CapTP *presence* with no host formula id. So the
   * peer sends its `Filesystem` (+ optional `ClaudeCredentials`) as a package,
   * and the factory `adopt`s them into the **host** namespace — which both
   * marks them as tracked imports (`thisDiesIfThatDies`) and gives them a name
   * the per-session powers can endow. The config rides as JSON in
   * `strings[0]`. The session is **host-rooted** (the reply attaches the
   * client by name) under the factory's directory with a factory-minted leaf —
   * never the peer's raw name, which could otherwise clobber a host name. The
   * peer receives the session by `adopt`ing the `client` edge of the reply.
   *
   * @param {any} hostAgent
   * @param {any} msg - a host-mailbox `package` message.
   * @param {Record<string, any>} config - the parsed, marker-validated config.
   */
  const handleSessionRequest = async (hostAgent, msg, config) => {
    const { name } = config;
    tempCounter += 1;
    // The suffix carries `Date.now()`, so the host-rooted leaf and the temp
    // names survive a daemon restart (which resets `tempCounter`) without
    // colliding with / clobbering a prior session of the same name.
    const suffix = `${slugify(name)}-${Date.now().toString(36)}-${tempCounter.toString(36)}`;
    const tag = `claude-${suffix}`;
    const fsTmp = `${tag}-fscap`;
    /** @type {string[]} */
    const removeNames = [];
    try {
      // adopt = thisDiesIfThatDies import edge + a host name the powers endow.
      await E(hostAgent).adopt(msg.number, 'filesystem', fsTmp);
      removeNames.push(fsTmp);
      let credentialsName = null;
      if (Array.isArray(msg.names) && msg.names.includes('credentials')) {
        const credTmp = `${tag}-credcap`;
        await E(hostAgent).adopt(msg.number, 'credentials', credTmp);
        removeNames.push(credTmp);
        credentialsName = credTmp;
      }

      const clientName = underNamespace(`session-${suffix}`);
      const {
        sessionId,
        hostMountPoint,
        rootfsLabel: rfLabel,
      } = await formulateSessionFromPetNames(
        {
          name,
          filesystemName: fsTmp,
          credentialsName,
          rootfs: config.rootfs,
          network: config.network,
          model: config.model,
          initialPrompt: config.initialPrompt,
        },
        { resultName: clientName, removeNames },
      );

      await E(hostAgent).reply(
        msg.number,
        [
          `ClaudeClient "${name}" created.`,
          `  session:   ${sessionId}`,
          `  workspace: ${hostMountPoint} -> ${SANDBOX_WORKSPACE_PATH}`,
          `  rootfs:    ${rfLabel}`,
        ],
        ['client'],
        [clientName],
      );
    } catch (error) {
      // Clean any adopt names minted before the core could remove them, so a
      // mid-formulation failure strands nothing on the host.
      await Promise.allSettled(removeNames.map(n => E(hostAgent).remove(n)));
      throw error;
    }
  };

  // Marker that distinguishes a session-request package from unrelated host
  // traffic that merely carries a `filesystem` edge.
  const SESSION_REQUEST_KIND = 'claude-sandbox-session';

  /**
   * Classify a mailbox message. The `kind: 'claude-sandbox-session'` marker in
   * `strings[0]` is the intent signal that keeps the loop from hijacking
   * unrelated host packages. A message is one of:
   *   - `{ kind: 'ignore' }`      — not a session request (unrelated traffic);
   *     drop silently, do NOT dismiss (it isn't ours to consume).
   *   - `{ kind: 'invalid', reason }` — *marked* as a session request but
   *     malformed (missing `filesystem` edge or `name`); reply with the reason
   *     and dismiss so the peer gets feedback and it doesn't replay forever.
   *   - `{ kind: 'request', config }` — a well-formed session request.
   *
   * @param {any} msg
   * @returns {{ kind: 'ignore' } | { kind: 'invalid', reason: string } | { kind: 'request', config: Record<string, any> }}
   */
  const classifyMessage = msg => {
    if (msg.type !== 'package') {
      return { kind: 'ignore' };
    }
    let config;
    try {
      config = JSON.parse(msg.strings?.[0] ?? '{}');
    } catch {
      return { kind: 'ignore' };
    }
    if (
      !config ||
      typeof config !== 'object' ||
      config.kind !== SESSION_REQUEST_KIND
    ) {
      return { kind: 'ignore' };
    }
    // Marked as ours from here — malformed is a reportable user error, not a
    // silent drop (which would strand the peer waiting for a reply forever).
    if (!Array.isArray(msg.names) || !msg.names.includes('filesystem')) {
      return {
        kind: 'invalid',
        reason: 'session-request package must carry a `filesystem` edge',
      };
    }
    if (typeof config.name !== 'string' || !config.name) {
      return {
        kind: 'invalid',
        reason: 'session-request config must include a non-empty string `name`',
      };
    }
    return { kind: 'request', config };
  };

  const seenSessionRequests = new Set();

  /**
   * Watch the host mailbox for peer session-request packages and dispatch each
   * to `handleSessionRequest`. Non-request messages (forms, other packages)
   * are ignored. A handled request is `dismiss`ed so a daemon restart's
   * `followMessages` replay does not re-create the session.
   */
  const runSessionRequestLoop = async () => {
    if (iterateHostMessages === undefined) return;
    const hostAgent = await getHostAgent();
    const iterator = iterateHostMessages(E(hostAgent).followMessages());
    let exhausted = false;
    while (!exhausted) {
      const { value: message, done } = await iterator.next();
      if (done) {
        exhausted = true;
        break;
      }
      const msg = /** @type {InboxMessage & { names?: string[] }} */ (message);
      const classified = classifyMessage(msg);
      // Only act on a marked request we have not already consumed. Unrelated
      // traffic (`ignore`) is left in the mailbox untouched — it isn't ours to
      // dismiss.
      if (
        classified.kind !== 'ignore' &&
        !seenSessionRequests.has(msg.number)
      ) {
        seenSessionRequests.add(msg.number);
        try {
          if (classified.kind === 'invalid') {
            await E(hostAgent).reply(
              msg.number,
              [`Error creating sandbox: ${classified.reason}`],
              [],
              [],
            );
          } else {
            await handleSessionRequest(hostAgent, msg, classified.config);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          // eslint-disable-next-line no-console
          console.error(
            '[claude-sandbox-factory] session-request:',
            errorMessage,
          );
          try {
            await E(hostAgent).reply(
              msg.number,
              [`Error creating sandbox: ${errorMessage}`],
              [],
              [],
            );
          } catch {
            // best-effort error reply
          }
        }
        // Durable de-dup: drop the consumed request (success, handled error, or
        // marked-but-invalid) so a restart's mailbox replay does not reprocess
        // it.
        try {
          await E(hostAgent).dismiss(msg.number);
        } catch {
          // best-effort
        }
      }
    }
  };

  const seenFormReplies = new Set();

  const runFactory = async () => {
    await E(powers).form('@host', FORM_DESCRIPTION, FORM_FIELDS);

    const selfId = await E(powers).locate('@self');

    /** @type {string | undefined} */
    let formMessageId;
    const existingMessages = /** @type {InboxMessage[]} */ (
      await E(powers).listMessages()
    );
    for (const msg of existingMessages) {
      if (msg.from === selfId && msg.type === 'form') {
        formMessageId = msg.messageId;
      }
    }

    const messageIterator = iterateMessages(E(powers).followMessages());
    let exhausted = false;
    while (!exhausted) {
      const { value: message, done } = await messageIterator.next();
      if (done) {
        exhausted = true;
        break;
      }

      const msg = /** @type {InboxMessage} */ (message);
      const isOurForm = msg.from === selfId && msg.type === 'form';
      const isFormReply =
        msg.type === 'value' &&
        formMessageId !== undefined &&
        msg.replyTo === formMessageId &&
        !seenFormReplies.has(msg.number);

      if (isOurForm) {
        formMessageId = msg.messageId;
      } else if (isFormReply) {
        seenFormReplies.add(msg.number);
        try {
          const submission = /** @type {SandboxFormSubmission} */ (
            await E(powers).lookupById(msg.valueId)
          );
          // Operator/form path: the submitter *is* the host operator, so the
          // form's `filesystem` / `credentials` are existing **host pet names**
          // (resolving them with host authority is legitimate — not a confused
          // deputy). Endow those names directly into the per-session powers
          // (no `storeValue`, no temp names — they are durable operator names,
          // so `removeNames` is empty). Store the client under the chosen pet
          // name, a host-side GC root.
          const hostAgent = await getHostAgent();
          if (!(await E(hostAgent).has(submission.filesystem))) {
            throw new Error(`Unknown filesystem: "${submission.filesystem}".`);
          }
          if (
            submission.credentials &&
            !(await E(hostAgent).has(submission.credentials))
          ) {
            throw new Error(
              `Unknown credentials: "${submission.credentials}".`,
            );
          }
          const {
            sessionId,
            hostMountPoint,
            rootfsLabel: rfLabel,
          } = await formulateSessionFromPetNames(
            {
              name: submission.name,
              filesystemName: submission.filesystem,
              credentialsName: submission.credentials || null,
              rootfs: submission.rootfs,
              network: submission.network,
              model: submission.model,
              initialPrompt: submission.initialPrompt,
            },
            { resultName: submission.name },
          );

          await E(powers).reply(
            msg.number,
            [
              `ClaudeClient "${submission.name}" created.`,
              `  session:    ${sessionId}`,
              `  filesystem: ${submission.filesystem}`,
              `  workspace:  ${hostMountPoint} -> ${SANDBOX_WORKSPACE_PATH}`,
              `  rootfs:     ${rfLabel}`,
              `  backend:    ${backend}`,
              `  network:    ${submission.network ?? 'private'}`,
            ],
            [],
            [],
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          // eslint-disable-next-line no-console
          console.error('[claude-sandbox-factory]', errorMessage);
          try {
            await E(powers).reply(
              msg.number,
              [`Error creating sandbox: ${errorMessage}`],
              [],
              [],
            );
          } catch {
            // best-effort reply
          }
        }
        // Durable de-dup: drop the consumed form reply (success or handled
        // error) so a daemon restart's `followMessages` replay does not
        // re-run the submission and mint a *fresh* client that overwrites the
        // reincarnated one under the same pet name. `seenFormReplies` alone is
        // in-memory and resets on restart — the dismissed queue is the durable
        // source of truth, mirroring the session-request loop.
        try {
          await E(powers).dismiss(msg.number);
        } catch {
          // best-effort
        }
      }
    }
  };

  runFactory().catch(error => {
    // eslint-disable-next-line no-console
    console.error('[claude-sandbox-factory] Factory error:', error);
  });

  runSessionRequestLoop().catch(error => {
    // eslint-disable-next-line no-console
    console.error(
      '[claude-sandbox-factory] session-request loop error:',
      error,
    );
  });

  return makeExo('ClaudeSandboxFactory', FactoryInterface, {
    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return [
          'ClaudeSandboxFactory. Two ways to create a session (both via the',
          'mailbox — a capability can only cross a daemon boundary by',
          'send/adopt, so there is no cap-argument method):',
          '',
          '1. Remote peer (or any agent): SEND a package to the host with a',
          '   `filesystem` (+ optional `credentials`) edge and strings[0] =',
          '   JSON config { kind: "claude-sandbox-session", name, rootfs?,',
          '   network?, model?, initialPrompt? }. The factory adopts the caps',
          '   and REPLIES with a `client` edge to adopt. Host-rooted under the',
          '   factory directory.',
          '',
          '2. Operator: submit the "Create Claude Sandbox" form on @host with',
          '   pet names (resolved with the operator’s own host authority):',
          '  name        — pet name for the resulting ClaudeClient',
          '  filesystem  — pet name of an existing Filesystem capability',
          '  rootfs      — OCI image (oci:<ref> or bare ref) or host-bind/minimal',
          '  network     — none | private (default; no host networking)',
          '  model       — optional claude model id',
          '  credentials — optional ClaudeCredentials pet name',
          '  initialPrompt — optional first message',
          '',
          'Both sessions are host-rooted; destroy with E(host).remove(name).',
          'The workspace Filesystem is mounted on the host over 9P and',
          'bind-mounted into the podman slice at /workspace.',
        ].join('\n');
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
harden(make);
