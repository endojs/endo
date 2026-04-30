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
