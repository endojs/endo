// @ts-check
/* global process */
// endo run --UNCONFINED setup.js --powers @agent
//   -E GENIE_MODEL=ollama/llama3.2
//   -E GENIE_WORKSPACE=/path/to/workspace
//
// Environment variables:
//   GENIE_MODEL      — model spec (e.g. `ollama/llama3.2`); when absent
//                      the form is left for manual submission.
//   GENIE_WORKSPACE  — host filesystem path to the workspace directory
//                      the daemon should mount on the agent's behalf.
//                      When provided, setup.js mints a `workspace-mount`
//                      Mount cap on the host and introduces it into the
//                      genie guest as `workspace`.  Inside a sandbox
//                      slice the workspace surfaces at the slice-internal
//                      path `/workspace`; see
//                      `TODO/44_genie_sandbox_workspace_slice.md`.
//                      Omit to keep the legacy "workspace = host cwd,
//                      no slice" code path during rollout.
//   GENIE_NAME       — pet name for the first agent guest.  Defaults
//                      to `main-genie`.
//
// The setup script also mints a `sandbox-factory` capability via the
// `@endo/sandbox` plugin's `make-unconfined` entry point, so the genie
// guest can request slices without having to mint the factory itself.

/** @import { EndoHost } from '@endo/daemon' */

import { makeError, q, X } from '@endo/errors';
import { E } from '@endo/eventual-send';

import {
  SANDBOX_FACTORY_NAME,
  WORKSPACE_MOUNT_NAME,
} from './src/pet-names.js';

const genieSpecifier = new URL('main.js', import.meta.url).href;
const sandboxSpecifier = new URL('../sandbox/src/agent.js', import.meta.url)
  .href;

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
  const model = env.GENIE_MODEL;
  const workspace = env.GENIE_WORKSPACE;
  const name = env.GENIE_NAME || 'main-genie';

  // ── Mint host-side capabilities the genie guest will reference ──
  // Both calls are guarded with `has(...)` so daemon restarts do not
  // re-mint and so re-running `endo run setup.js` is idempotent.

  // 1. Workspace mount — only when the operator supplied a path.
  //    Skipping keeps the legacy "workspace = host cwd, no slice"
  //    code path working in main.js for backwards compatibility.
  if (workspace) {
    if (!(await E(hostAgent).has(WORKSPACE_MOUNT_NAME))) {
      await E(hostAgent).provideMount(workspace, WORKSPACE_MOUNT_NAME);
      console.log(`Minted workspace-mount at ${workspace}`);
    }
  } else {
    console.log(
      `No GENIE_WORKSPACE — skipping ${WORKSPACE_MOUNT_NAME} (legacy direct-spawn path).`,
    );
  }

  // 2. Sandbox factory — minted from the `@endo/sandbox` plugin's
  //    `make-unconfined` entry point.  `powersName: '@agent'` grants
  //    the factory the host's `provideHostPath` / `provideScratchMount`
  //    surface, which is the privileged operation the factory needs to
  //    bridge granted Mount caps to the kernel's bind-mount surface.
  if (!(await E(hostAgent).has(SANDBOX_FACTORY_NAME))) {
    await E(hostAgent).makeUnconfined('@main', sandboxSpecifier, {
      powersName: '@agent',
      resultName:SANDBOX_FACTORY_NAME,
    });
    console.log(`Minted ${SANDBOX_FACTORY_NAME}`);
  }

  // ── Provision the genie guest ──
  // Only create the guest on first run; on restart the guest already exists
  // and re-running provideGuest with introducedNames hits a daemon bug
  // where the handle formula lacks the write method.
  const hasGenie = await E(hostAgent).has('setup-genie');
  if (!hasGenie) {
    /** @type {Record<string, string>} */
    const introducedNames = { '@agent': 'host-agent' };
    if (await E(hostAgent).has(WORKSPACE_MOUNT_NAME)) {
      introducedNames[WORKSPACE_MOUNT_NAME] = 'workspace';
    }
    if (await E(hostAgent).has(SANDBOX_FACTORY_NAME)) {
      introducedNames[SANDBOX_FACTORY_NAME] = 'sandboxes';
    }
    await E(hostAgent).provideGuest('setup-genie', {
      introducedNames: harden(introducedNames),
      agentName: 'profile-for-genie',
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

  if (!model) {
    console.log('No GENIE_MODEL — skipping auto-submit.');
    return;
  }

  const selfLocator = await E(hostAgent).locate('@self');
  const messages = makeRefIterator(E(hostAgent).followMessages());

  console.log('Watching inbox for form from setup-genie...');
  for await (const message of messages) {
    if (message.type !== 'form') continue;
    if (message.from === selfLocator) continue;

    const [fromName] = await E(hostAgent).reverseLocate(message.from);
    if (fromName !== 'setup-genie') continue;

    console.log(`Found form at message ${message.number} — submitting...`);
    await E(hostAgent).submit(message.number, {
      name,
      model,
      workspace: workspace || process.cwd(),
    });
    console.log('Submitted.');
    return;
  }
};
harden(main);
