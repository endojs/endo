// @ts-check
/* global process */
/* eslint-disable no-continue */
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

import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

const genieSpecifier = new URL('main.js', import.meta.url).href;
const sandboxSpecifier = new URL('../sandbox/src/agent.js', import.meta.url)
  .href;

/**
 * Provision a genie guest, launch the main caplet, then watch the
 * inbox for configuration forms from the genie guest and auto-submit
 * env vars.  Runs until interrupted.
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
    if (!(await E(hostAgent).has('workspace-mount'))) {
      await E(hostAgent).provideMount(workspace, 'workspace-mount');
      console.log(`Minted workspace-mount at ${workspace}`);
    }
  } else {
    console.log(
      'No GENIE_WORKSPACE — skipping workspace-mount (legacy direct-spawn path).',
    );
  }

  // 2. Sandbox factory — minted from the `@endo/sandbox` plugin's
  //    `make-unconfined` entry point.  `powersName: '@agent'` grants
  //    the factory the host's `provideHostPath` / `provideScratchMount`
  //    surface, which is the privileged operation the factory needs to
  //    bridge granted Mount caps to the kernel's bind-mount surface.
  if (!(await E(hostAgent).has('sandbox-factory'))) {
    await E(hostAgent).makeUnconfined('@main', sandboxSpecifier, {
      powersName: '@agent',
      resultName: 'sandbox-factory',
    });
    console.log('Minted sandbox-factory');
  }

  // ── Provision the genie guest ──
  // Only create the guest on first run; on restart the guest already exists
  // and re-running provideGuest with introducedNames hits a daemon bug
  // where the handle formula lacks the write method.
  const hasGenie = await E(hostAgent).has('setup-genie');
  if (!hasGenie) {
    /** @type {Record<string, string>} */
    const introducedNames = { '@agent': 'host-agent' };
    if (await E(hostAgent).has('workspace-mount')) {
      introducedNames['workspace-mount'] = 'workspace';
    }
    if (await E(hostAgent).has('sandbox-factory')) {
      introducedNames['sandbox-factory'] = 'sandboxes';
    }
    await E(hostAgent).provideGuest('setup-genie', {
      introducedNames: harden(introducedNames),
      agentName: 'profile-for-genie',
    });
  }

  await E(hostAgent).makeUnconfined('@main', genieSpecifier, {
    powersName: 'profile-for-genie',
    resultName: 'controller-for-genie',
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
    // When `GENIE_WORKSPACE` was set, `workspace-mount` was minted
    // above and introduced into the genie guest as `workspace`; the
    // form value is the pet name so `spawnAgent` reuses the cap
    // instead of re-minting a per-agent host-path mount.  When unset,
    // submit the host cwd to keep the legacy direct-spawn path
    // working — there is no Mount cap to refer to by pet name.
    await E(hostAgent).submit(message.number, {
      name,
      model,
      workspace: workspace ? 'workspace' : process.cwd(),
    });
    console.log('Submitted.');
    return;
  }
};
harden(main);
