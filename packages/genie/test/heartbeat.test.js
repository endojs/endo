// @ts-check
/* global process */

/**
 * Regression test for the heartbeat module's host-view contract.
 *
 * Sub-task of
 * `TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`
 * § "Deliverables" — _Heartbeat / observer / reflector continuity_,
 * filed under
 * [`TODO/38_endo_genie_sandbox_heartbeat_continuity.md`](../../../TODO/38_endo_genie_sandbox_heartbeat_continuity.md).
 *
 * After Phase 3.5a wired the genie's tool spawn through a sandbox
 * slice, `main.js` rewrites `process.env.GENIE_WORKSPACE` to
 * `/workspace` (the slice-internal path) immediately after the slice
 * mint resolves — so a tool spawned inside the slice sees `/workspace`
 * for `GENIE_WORKSPACE`, while the worker's on-host code keeps using
 * the captured `workspaceDir` local sourced from the launcher's `env`
 * argument (the host path).
 *
 * `runHeartbeat` writes `.heartbeats.log` and reads `.git/` from
 * `workspaceDir`.  This test pins that those reads / writes hit the
 * **host** view (the `workspaceDir` parameter), not whatever
 * `process.env.GENIE_WORKSPACE` happens to be — i.e. the heartbeat
 * handler must never grow an implicit `process.env.GENIE_WORKSPACE`
 * dependency that would silently flip to the slice-internal path
 * after the rewrite.
 */

import '@endo/harden';
import test from 'ava';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { runHeartbeat } from '../src/heartbeat/index.js';

/**
 * Build a minimal `PiAgent`-shaped stub that drives `runAgentRound`
 * to completion without calling a real LLM.
 *
 * The stub:
 * - records the `subscribe` callback so `runAgentRound` can wire it.
 * - resolves `prompt` synchronously so the `agent_start` arrives.
 * - resolves `waitForIdle` synchronously so the `agent_end` arrives
 *   with the done flag set, terminating the event loop.
 *
 * The resulting event stream is empty (no assistant text), which
 * means `runHeartbeat` records a `failed` heartbeat — which is fine
 * for this test: we only care that the `.heartbeats.log` write lands
 * in the supplied `workspaceDir`, not at `process.env.GENIE_WORKSPACE`.
 */
const stubPiAgent = () => {
  return {
    /**
     * @param {(event: any) => void} _handler
     */
    subscribe: _handler => {},
    /**
     * @param {string} _prompt
     */
    prompt: async _prompt => {},
    waitForIdle: async () => {},
  };
};

test.serial(
  'runHeartbeat writes .heartbeats.log to the host workspaceDir, not process.env.GENIE_WORKSPACE',
  async t => {
    const tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'genie-heartbeat-host-view-'),
    );
    t.teardown(() => fs.rm(tmpRoot, { recursive: true, force: true }));

    // Simulate the post-3.5a state: `process.env.GENIE_WORKSPACE` has
    // been rewritten to the slice-internal `/workspace` path.  If
    // `runHeartbeat` (or its transitive callees) ever read this env
    // var instead of the `workspaceDir` parameter, the `.heartbeats.log`
    // write would land at `/workspace/.heartbeats.log` (and either fail
    // EACCES or pollute the slice's view).
    const previous = process.env.GENIE_WORKSPACE;
    process.env.GENIE_WORKSPACE = '/workspace';
    t.teardown(() => {
      if (previous === undefined) {
        delete process.env.GENIE_WORKSPACE;
      } else {
        process.env.GENIE_WORKSPACE = previous;
      }
    });

    const piAgent = /** @type {any} */ (stubPiAgent());

    // Drive runHeartbeat to completion.  The stub yields no events,
    // so the heartbeat records a `failed` status — that's fine; we
    // only care about *where* the status is recorded.
    // eslint-disable-next-line no-unused-vars
    for await (const _ of runHeartbeat({ workspaceDir: tmpRoot, piAgent })) {
      // drain
    }

    // Pinned host-view contract: the .heartbeats.log lands under the
    // supplied workspaceDir, not under /workspace (which is the
    // slice-internal value of process.env.GENIE_WORKSPACE).
    const hostLog = path.join(tmpRoot, '.heartbeats.log');
    const stat = await fs.stat(hostLog);
    t.true(stat.isFile(), '.heartbeats.log written to host workspaceDir');

    // Sanity: nothing written to /workspace (in case the test host
    // happens to have a writable /workspace, this catches an
    // accidental fallthrough).  We can't easily prove the negative
    // for an arbitrary host, but a stat of /workspace/.heartbeats.log
    // existing would be a strong signal of regression.
    let sliceLogStat;
    try {
      sliceLogStat = await fs.stat('/workspace/.heartbeats.log');
    } catch {
      sliceLogStat = null;
    }
    if (sliceLogStat) {
      t.fail(
        '/workspace/.heartbeats.log exists — runHeartbeat may have used process.env.GENIE_WORKSPACE',
      );
    } else {
      t.pass();
    }
  },
);
