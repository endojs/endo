// @ts-check
/* global process */
// endo run --UNCONFINED setup.js --powers @agent
//   -E GENIE_MODEL=ollama/llama3.2
//   -E GENIE_WORKSPACE=/path/to/workspace

/** @import { EndoHost } from '@endo/daemon' */

import { makeError, q, X } from '@endo/errors';
import { E } from '@endo/eventual-send';

const genieSpecifier = new URL('main.js', import.meta.url).href;

/**
 * `make-unconfined` specifier for the `@endo/sandbox` plugin's agent
 * entry point.  Resolved relative to this file's URL so the launcher
 * works against the in-tree workspace layout without a runtime import
 * of `@endo/sandbox` (setup.js never loads the module — it only hands
 * the path to `makeUnconfined`, which dynamically imports it inside
 * the unconfined worker).  Couples the genie launcher to the sandbox
 * package's directory layout (`packages/sandbox/src/agent.js`),
 * matching the package's `"main"` export in `packages/sandbox/package.json`.
 */
const sandboxAgentSpecifier = new URL(
  '../sandbox/src/agent.js',
  import.meta.url,
).href;

/**
 * Pet name under which the host agent pins the workspace `Mount`
 * capability covering `GENIE_WORKSPACE`.  `main.js` looks this name
 * up in `powers` on boot to obtain the mount it threads into the
 * sandbox slice (`mounts: [{ cap: workspaceMount, innerPath:
 * '/workspace', mode: 'rw' }]`).  Kept as a single source of truth
 * so the launcher and `main.js` cannot drift on the name.
 *
 * See `TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`
 * § Decisions 1 + 3 for the rationale: the slice is minted main-side,
 * but the mount it consumes must already exist in the host pet store
 * before `main-genie` boots, hence its provisioning is the one new
 * responsibility `setup.js` takes on.
 */
const WORKSPACE_MOUNT_NAME = 'workspace-mount';

/**
 * Pet name under which the host agent pins the
 * `SandboxFactory` exo returned by `@endo/sandbox`'s
 * `make-unconfined` entry point.  `main.js` resolves this from
 * `powers` on boot to mint its workspace slice
 * (`main-genie-sandbox`) — see TADA/22 § Decision 1: the slice is
 * minted main-side because `MakeCapletOptionsShape` has no
 * `introducedNames` channel today, so the factory must be reachable
 * via the host pet store rather than threaded through
 * `makeUnconfined`'s `env`.  Kept as a single source of truth so
 * the launcher and `main.js` cannot drift on the name.
 */
const SANDBOX_FACTORY_NAME = 'sandbox-factory';

/**
 * Launch the genie root agent as an unconfined worklet running under
 * the daemon's host root agent (`@agent`).  Configuration is forwarded
 * via the `env` option so `main.js` can read `GENIE_*` values from the
 * `context.env` argument passed by `makeUnconfined`.  `GENIE_MODEL`
 * and `GENIE_WORKSPACE` are validated inside `main.js` at boot so
 * missing values fail loudly in the worker log instead of silently
 * exiting this launcher.
 *
 * Idempotent: on re-run, the `has('main-genie')` and
 * `has('workspace-mount')` checks short-circuit so repeated
 * `bottle.sh invoke` calls don't re-spawn an already-running root
 * agent or re-mint the workspace mount.  A daemon restart
 * reincarnates the worker from the stored `main-genie` formula and
 * the mount from the stored `Mount` formula without a new
 * `setup.js` invocation (see `packages/daemon/CLAUDE.md` § "Mount").
 *
 * @param {EndoHost} hostAgent
 */
export const main = async hostAgent => {
  const { env } = process;

  // Resolve the workspace path setup-side so a missing `GENIE_WORKSPACE`
  // fails loudly in the launcher log before we touch the host agent.
  // `main.js` re-validates inside the worker, but the mount-provisioning
  // call below cannot proceed without an absolute path.
  const workspace = env.GENIE_WORKSPACE;
  if (!workspace) {
    throw makeError(
      X`genie setup: GENIE_WORKSPACE env var is required (got ${q(workspace)})`,
    );
  }

  // Provision the workspace Mount before launching `main-genie` so the
  // worker's first `lookup('workspace-mount')` always resolves.  Per
  // TADA/22 Decision 1, the sandbox slice is minted main-side from
  // `powers`, so the mount must be pinned in the host pet store before
  // the worker boots.  `provideMount` formulates a fresh `Mount` formula
  // unconditionally, so guard with `has` to keep re-runs idempotent and
  // avoid orphaning the previous formula.
  if (!(await E(hostAgent).has(WORKSPACE_MOUNT_NAME))) {
    await E(hostAgent).provideMount(workspace, WORKSPACE_MOUNT_NAME, {
      readOnly: false,
    });
    console.log(
      `provisioned ${WORKSPACE_MOUNT_NAME} for GENIE_WORKSPACE=${workspace}`,
    );
  } else {
    console.log(
      `${WORKSPACE_MOUNT_NAME} already pinned — skipping provideMount.`,
    );
  }

  // Register the `@endo/sandbox` plugin as an unconfined caplet under
  // a stable pet name so `main.js` can resolve the resulting
  // `SandboxFactory` from `powers` on boot (TADA/22 Decision 1:
  // main-side slice minting).  Pinning via `makeUnconfined` produces
  // a `make-unconfined` formula the daemon reincarnates on restart,
  // so the factory ref survives daemon bounces without re-running
  // `setup.js`.  Guard with `has` to keep re-runs idempotent and
  // avoid orphaning the previous formula.
  if (!(await E(hostAgent).has(SANDBOX_FACTORY_NAME))) {
    await E(hostAgent).makeUnconfined('@agent', sandboxAgentSpecifier, {
      powersName: '@agent',
      resultName: SANDBOX_FACTORY_NAME,
    });
    console.log(`registered ${SANDBOX_FACTORY_NAME} from @endo/sandbox.`);
  } else {
    console.log(
      `${SANDBOX_FACTORY_NAME} already registered — skipping makeUnconfined.`,
    );
  }

  if (await E(hostAgent).has('main-genie')) {
    console.log('main-genie already running — skipping makeUnconfined.');
    return;
  }

  await E(hostAgent).makeUnconfined('@main', genieSpecifier, {
    powersName: '@agent',
    resultName: 'main-genie',
    env: {
      GENIE_MODEL: env.GENIE_MODEL ?? '',
      GENIE_WORKSPACE: workspace,
      GENIE_NAME: env.GENIE_NAME ?? 'main-genie',
      GENIE_HEARTBEAT_PERIOD: env.GENIE_HEARTBEAT_PERIOD ?? '',
      GENIE_HEARTBEAT_TIMEOUT: env.GENIE_HEARTBEAT_TIMEOUT ?? '',
      GENIE_OBSERVER_MODEL: env.GENIE_OBSERVER_MODEL ?? '',
      GENIE_REFLECTOR_MODEL: env.GENIE_REFLECTOR_MODEL ?? '',
      GENIE_AGENT_DIRECTORY: env.GENIE_AGENT_DIRECTORY ?? 'genie',
    },
  });
};
harden(main);
