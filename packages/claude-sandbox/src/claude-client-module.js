// @ts-check
/* global process */

/**
 * Per-session `ClaudeClient` caplet.
 *
 * The factory provisions one of these per "Create Claude Sandbox"
 * submission via `makeUnconfined`, so the resulting exo is a
 * first-class formulated Endo capability with a real daemon identity —
 * which is what lets `@host` store it under a pet name and reincarnate
 * it across daemon restarts.
 *
 * Why the client (not the factory) owns the slice and mount: an
 * `@endo/sandbox` slice and the `@endo/9p-server` mount handle are
 * worker-local remotables with no formula identity, so they cannot be
 * passed across a formula boundary into a separately-formulated client.
 * Instead this module re-creates them itself, lazily, from its `env`:
 * the first `send()` (or an `initialPrompt`) mounts the workspace and
 * mints the slice; subsequent daemon restarts reincarnate the formula
 * and re-provision on demand. The workspace and the conversation
 * persist in the `Filesystem` cap, and the (possibly peer-hosted)
 * credential is re-materialised at spawn time, so no secret ever lands
 * in the formula `env`.
 *
 * Expected env (set by the factory; all strings). The caps the client
 * needs are passed by reference through `powers`, **not** by pet name, so
 * no cap-name env vars appear here:
 *   SESSION_ID            Stable session id (the mount path + pet names
 *                         derive from it, so it must survive restarts).
 *   CREATED_AT            ISO timestamp (diagnostic).
 *   WORKSPACE_MOUNT_POINT Host path the workspace 9P mount lives at (also
 *                         the only path `provideMount` will accept).
 *   WORKSPACE_PET_NAME    Pet name to register the workspace Mount cap
 *                         under.
 *   WORKSPACE_PATH        Slice-internal workspace path (default
 *                         `/workspace`).
 *   BACKEND               Sandbox backend (default `podman`).
 *   NETWORK               Sandbox network profile (default `private`).
 *   CLAUDE_ROOTFS         Raw `rootfs` form value (may be empty).
 *   DEFAULT_IMAGE         Default OCI image when CLAUDE_ROOTFS is blank.
 *   MODEL                 Optional claude model id.
 *   INITIAL_PROMPT        Optional one-shot prompt fired on creation.
 *
 * This caplet does **not** run with `@agent`. The factory builds a
 * **per-session powers** cap (factory.js, via `evaluate`) that is a total
 * attenuation: it bundles the four caps the client needs **by reference**
 * and exposes only `sandboxFactory()` / `fsMounter()` / `filesystem()` /
 * `credentials()` accessors plus a `provideMount(path, name)` bounded to
 * *this session's* workspace mountpoint. There is **no `lookup`**, so the
 * client cannot resolve any host name beyond its own four caps, and cannot
 * reach `makeUnconfined`, `remove`, `provideHostPath`, `provideGuest`,
 * etc. See DESIGN.md § Known issue #8.
 *
 * @module
 */

import { E } from '@endo/eventual-send';
import { makeError, q, X } from '@endo/errors';

import { makeClaudeClient } from './claude-client.js';
import { parseRootfs, rootfsLabel } from './parse-rootfs.js';

/** @import { FarRef } from '@endo/eventual-send' */

/**
 * Map a credential kind to the environment variable Claude Code reads
 * it from inside the slice. See `claude-sandbox-factory.js` for the
 * peer-hosted, short-lived-secret rationale.
 */
const CREDENTIAL_ENV_VARS = harden({
  apiKey: 'ANTHROPIC_API_KEY',
  oauthToken: 'CLAUDE_CODE_OAUTH_TOKEN',
});

/**
 * Create a cancellation context kit: an in-process passable context and
 * a `cancel` function that triggers it. The context exposes
 * `whenCancelled()` — the same method the daemon's live context presence
 * exposes — so tests and callers can use one consistent shape.
 *
 * @returns {{ context: { whenCancelled: () => Promise<never> }, cancel: (reason?: Error) => void }}
 */
export const makeCancellationKit = () => {
  /** @type {(reason: Error) => void} */
  let rejectCancelled;
  const cancelled = /** @type {Promise<never>} */ (
    new Promise((_resolve, reject) => {
      rejectCancelled = reject;
    })
  );
  // Suppress unhandled-rejection noise: the promise is meant to stay pending
  // until cancel() is called, after which callers drain it.
  cancelled.catch(() => {});
  const cancel = (reason = new Error('Cancelled')) => rejectCancelled(reason);
  const context = harden({ whenCancelled: () => cancelled });
  return harden({ context, cancel });
};
harden(makeCancellationKit);

/**
 * Capture the caplet's cancellation promise from the daemon-context
 * passable shape. A context presence exposes `whenCancelled()`.
 * `null`/absent means no teardown signal.
 *
 * Note: we return the promise captured into a local, not via an
 * `async` return. An `async` return would adopt (flatten) the
 * cancellation promise, so the caller would hang until cancellation
 * instead of receiving the still-pending promise to subscribe to.
 *
 * @param {any} resolvedContext
 * @returns {Promise<never> | null}
 */
const cancellationPromiseOf = resolvedContext => {
  if (!resolvedContext) return null;
  if (typeof resolvedContext.whenCancelled === 'function') {
    return E(resolvedContext).whenCancelled();
  }
  return null;
};

/**
 * Per-session ClaudeClient caplet entry point.
 *
 * @param {FarRef<object>} powers - The
 *   `@agent` host authority. Tests pass a mock host agent exposing
 *   `lookup` and `provideMount`.
 * @param {Promise<object> | object | undefined} context - The daemon
 *   cancellation context. When the formula is cancelled or collected,
 *   the session is torn down (container disposed, workspace unmounted).
 * @param {{ env?: Record<string, string> }} [contextWrapper]
 * @returns {object}
 */
export const make = (powers, context, contextWrapper = {}) => {
  // The per-session powers cap (factory.js builds it via `evaluate`): a
  // total attenuation that exposes only `sandboxFactory()` / `fsMounter()`
  // / `filesystem()` / `credentials()` accessors (the caps bundled by
  // reference at creation) and a `provideMount(path, name)` bounded to
  // *this session's* workspace mountpoint. There is no `lookup`, so the
  // client cannot reach any host name beyond its four caps.
  /** @type {any} */
  const sessionPowers = powers;
  const env = contextWrapper.env ?? process.env;

  const sessionId = env.SESSION_ID;
  if (!sessionId) {
    throw makeError(X`claude-client-module: SESSION_ID required`);
  }
  const workspaceMountPoint = env.WORKSPACE_MOUNT_POINT;
  if (!workspaceMountPoint) {
    throw makeError(X`claude-client-module: WORKSPACE_MOUNT_POINT required`);
  }

  const createdAt = env.CREATED_AT || new Date().toISOString();
  const workspacePetName =
    env.WORKSPACE_PET_NAME || `claude-${sessionId}-workspace`;
  const workspacePath = env.WORKSPACE_PATH || '/workspace';
  const backend = env.BACKEND || 'podman';
  const network = env.NETWORK || 'private';
  const model = env.MODEL || undefined;
  const initialPrompt = env.INITIAL_PROMPT || undefined;

  // Parse (and validate) the rootfs synchronously so a bad value fails
  // at construction rather than on first use.
  const parsedRootfs = parseRootfs(env.CLAUDE_ROOTFS, {
    defaultImage: env.DEFAULT_IMAGE || undefined,
  });

  /**
   * Lazily mount the workspace and mint the slice. Run once on first
   * use and memoized by `makeClaudeClient`.
   *
   * @returns {Promise<{ slice: any, mountHandle: { unmount: () => Promise<void> } }>}
   */
  const provision = async () => {
    // Pull the caps from the per-session powers by reference (no name
    // lookup). The factory bundled exactly these four when it built the
    // powers cap.
    const sandboxFactory = await E(sessionPowers).sandboxFactory();
    const fsMounter = await E(sessionPowers).fsMounter();
    const fs = await E(sessionPowers).filesystem();
    if (!fs) {
      throw makeError(X`claude-sandbox: no Filesystem cap was provided`);
    }

    // The credentials cap (or null when the session has none). Resolved up
    // front so a failure (or terminate) can revoke the per-session grant
    // rather than leak it in the credentials cap's outstanding set.
    /** @type {any} */
    const credCap = (await E(sessionPowers).credentials()) || null;
    const revokeCredential = async () => {
      if (credCap) {
        await E(credCap).revoke(sessionId);
      }
    };

    // Materialise the credential, mount the FS over 9P, register the
    // mountpoint as a daemon Mount cap, then mint the slice. On any
    // failure release whatever was created — unmount the 9P mount and
    // revoke the issued credential grant — rather than leak it.
    /** @type {any} */
    let mountHandle = null;
    try {
      // Materialise the credential immediately before it flows into the
      // slice env. The cap may live on a remote peer; the host only ever
      // receives the short-lived secret it mints here.
      /** @type {Record<string, string>} */
      const credentialEnv = {};
      if (credCap) {
        // `kind()` is interface-guaranteed on ClaudeCredentials, so call it
        // directly rather than probing `__getMethodNames__`: probing could
        // miss an oauthToken cap that doesn't surface introspection and
        // silently mis-route its token into ANTHROPIC_API_KEY. A cap with no
        // `kind()` at all degrades to a raw API key.
        let kind = 'apiKey';
        try {
          kind = await E(credCap).kind();
        } catch {
          // No kind() method — treat as a raw API key.
        }
        // `Object.hasOwn` guard so a hostile `kind()` returning an inherited
        // key (e.g. `"__proto__"`) can't resolve to a truthy prototype value
        // and mis-route the secret under a coerced env key.
        const envVar = Object.hasOwn(CREDENTIAL_ENV_VARS, kind)
          ? CREDENTIAL_ENV_VARS[kind]
          : undefined;
        if (!envVar) {
          throw makeError(
            X`Unknown credential kind ${q(kind)}; expected one of ${q(
              Object.keys(CREDENTIAL_ENV_VARS).join(', '),
            )}`,
          );
        }
        const issuedCred = await E(credCap).issue(sessionId);
        credentialEnv[envVar] = await E(issuedCred).materialise();
      }

      mountHandle = await E(fsMounter).mount(
        fs,
        workspaceMountPoint,
        harden({ lazyUnmount: true }),
      );
      const workspaceCap = await E(sessionPowers).provideMount(
        workspaceMountPoint,
        workspacePetName,
      );
      const slice = await E(sandboxFactory).make(
        harden({
          rootfs: parsedRootfs,
          mounts: [
            {
              cap: workspaceCap,
              innerPath: workspacePath,
              mode: 'rw',
            },
          ],
          network,
          env: credentialEnv,
          cwd: workspacePath,
          backend,
        }),
      );
      return harden({
        slice,
        mountHandle,
        revoke: revokeCredential,
        // Reclaim the workspace Mount pet name that `provideMount` registered
        // at the host root, so a torn-down session leaves no live Mount
        // formula behind. Scoped to this session's name by the powers cap.
        removeMount: () => E(sessionPowers).removeMount(),
      });
    } catch (error) {
      if (mountHandle) {
        try {
          await E(mountHandle).unmount();
        } catch {
          // best-effort
        }
      }
      // If `provideMount` had already registered the workspace Mount name
      // before this failure, drop it so a failed provision leaks nothing.
      try {
        await E(sessionPowers).removeMount();
      } catch {
        // best-effort; the name may not have been registered yet
      }
      try {
        await revokeCredential();
      } catch {
        // best-effort; the credential cap may be gone
      }
      throw error;
    }
  };

  const client = makeClaudeClient({
    sessionId,
    createdAt,
    provision,
    workspaceMountPoint,
    workspacePath,
    backend,
    rootfsLabel: rootfsLabel(parsedRootfs),
    model,
    initialPrompt,
  });

  // Tear down on cancellation/collection. `cancel` is transient (the
  // formula persists and reincarnates after a daemon restart, then
  // re-provisions on the next send); `remove`/GC additionally deletes
  // the formula. Either way the container and 9P mount must be released
  // — `terminate()` does exactly that and is a no-op when nothing was
  // provisioned, so a never-used session cancels for free.
  const armTeardown = async () => {
    const resolvedContext = context ? await context : null;
    const cancelled = cancellationPromiseOf(resolvedContext);
    if (!cancelled) return;
    // The cancellation promise settles (resolves, or rejects with the
    // cancel reason) when the formula is cancelled or collected.
    // Normalize both settlements to a resolution, then tear down.
    await cancelled.then(
      () => {},
      () => {},
    );
    await client.terminate();
  };
  armTeardown().catch(() => {});

  return client;
};
harden(make);
