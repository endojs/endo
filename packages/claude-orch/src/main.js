// @ts-check
/* global setTimeout, clearTimeout */
/**
 * @import {
 *   BootConfigMessage,
 *   CreateSessionRequest,
 *   OrchestratorConfig,
 *   Session,
 * } from '../protocol.types.d.ts'
 */

import process from 'node:process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { makeSessionManager } from './sessions/session-manager.js';
import { makeNetworkController } from './network/index.js';
import { spawnVm } from './qemu/spawner.js';
import { awaitHello } from './bootstrap/rpc-server.js';
import { makeAgentLink } from './agent/rpc-server.js';
import { makeBrokerClient } from './broker-client/index.js';
import { makeApiServer } from './api/server.js';
import { makeStdioMux } from './stdio/mux.js';

/**
 * Build the orchestrator config from environment with sane defaults.
 *
 * @returns {OrchestratorConfig}
 */
export const configFromEnv = () => {
  const env = process.env;
  return harden({
    socketPath: env.CLAUDE_ORCH_SOCKET || '/run/claude-orch/api.sock',
    imageDir: env.CLAUDE_ORCH_IMAGE_DIR || '/opt/claude-orch/share/images',
    sessionDir: env.CLAUDE_ORCH_SESSION_DIR || '/run/claude-orch/sessions',
    brokerSocketPath:
      env.CLAUDE_ORCH_BROKER_SOCKET || '/run/claude-orch/broker.sock',
    defaults: {
      arch: process.arch === 'arm64' ? 'aarch64' : 'x86_64',
      vcpus: Number(env.CLAUDE_ORCH_DEFAULT_VCPUS || 2),
      memMB: Number(env.CLAUDE_ORCH_DEFAULT_MEM_MB || 2048),
    },
    bootDeadlineMs: Number(env.CLAUDE_ORCH_BOOT_DEADLINE_MS || 30_000),
    heartbeatTimeoutMs: Number(env.CLAUDE_ORCH_HEARTBEAT_TIMEOUT_MS || 60_000),
  });
};
harden(configFromEnv);

/**
 * Build and start the orchestrator. Returns a stop() function for graceful
 * shutdown (used by tests and the bin/claude-orch entry point).
 *
 * @param {{ config?: OrchestratorConfig }} [opts]
 */
export const start = async ({ config = configFromEnv() } = {}) => {
  await mkdir(path.dirname(config.socketPath), {
    recursive: true,
    mode: 0o750,
  });
  await mkdir(config.sessionDir, { recursive: true, mode: 0o750 });

  const sessions = makeSessionManager({ config });
  const network = makeNetworkController();
  await network.initialize();

  const broker = makeBrokerClient({ socketPath: config.brokerSocketPath });

  // Track running VMs so terminate can find and kill them.
  /** @type {Map<string, import('./qemu/spawner.js').VmHandle>} */
  const vms = new Map();
  /** @type {Map<string, import('./agent/rpc-server.js').AgentLink>} */
  const agents = new Map();
  /** @type {Map<string, () => Promise<void>>} */
  const netCleanups = new Map();
  /** @type {Map<string, ReturnType<typeof makeStdioMux>>} */
  const stdioMuxes = new Map();

  /**
   * @param {CreateSessionRequest} request
   * @returns {Promise<Session>}
   */
  const createSession = async request => {
    const record = await sessions.createSession(request);
    return sessions.toSession(record);
  };

  /**
   * @param {string} sessionId
   */
  const markReady = async sessionId => {
    const record = sessions.getRecord(sessionId);
    if (!record) throw new Error(`Unknown session ${sessionId}`);
    if (record.state !== 'pending') {
      throw new Error(
        `Session ${sessionId} is ${record.state}, expected pending.`,
      );
    }

    // Caller has bound the fs.sock; spawn QEMU now.
    const arch = resolveArch(record.request, config);
    const netAttachment = await network.attachSession(record.id, {
      mode: record.request.network,
    });
    netCleanups.set(sessionId, netAttachment.cleanup);
    sessions.setState(sessionId, 'booting', { netAttachment });

    // Boot-phase RPCs in parallel: bootstrap Hello on ctl.sock and the
    // agent link on agent.sock. QEMU will connect to both shortly after
    // launch.
    const helloPromise = awaitHello({
      ctlSocketPath: record.ctlSocketPath,
      sessionId,
      consumeNonce: (sid, nonce) => sessions.consumeBootNonce(sid, nonce),
      buildBootConfig: async () => buildBootConfigForSession(sessionId),
      deadlineMs: config.bootDeadlineMs,
    });

    const agentPromise = makeAgentLink({
      agentSocketPath: record.agentSocketPath,
    });

    const vm = spawnVm({
      arch,
      record,
      config,
      netArgs: netAttachment.qemuArgs,
    });
    vms.set(sessionId, vm);

    // If the VM dies before Ready, surface the failure.
    vm.exitCode
      .then(code => {
        const cur = sessions.getRecord(sessionId);
        if (!cur) return;
        if (cur.state === 'ready' || cur.state === 'unhealthy') {
          sessions.setState(sessionId, 'terminated', {
            failureReason: `qemu exited ${code}`,
          });
        } else if (cur.state !== 'terminated') {
          sessions.setState(sessionId, 'boot_failed', {
            failureReason: `qemu exited ${code} before ready`,
          });
        }
      })
      .catch(() => {});

    try {
      await helloPromise;
      const link = await agentPromise;
      agents.set(sessionId, link);
      await link.ready();

      // Start the stdio multiplexer if the caller asked for an attach stream.
      if (record.request.attachMode === 'stream') {
        const mux = makeStdioMux({
          stdioSocketPath: record.stdioSocketPath,
          attachSocketPath: record.attachSocketPath,
          onError: e => {
            // eslint-disable-next-line no-console
            console.error(`[stdio-mux ${sessionId}]`, e);
          },
        });
        stdioMuxes.set(sessionId, mux);
        await mux.start();
        // Tell the agent to begin attach framing on its end.
        link.send({ type: 'attach', streamId: 'default0' });
      }

      sessions.setState(sessionId, 'ready', { vmPid: vm.child.pid });
    } catch (e) {
      sessions.setState(sessionId, 'boot_failed', {
        failureReason: /** @type {Error} */ (e).message,
      });
      vm.kill('SIGTERM');
      await teardownSession(sessionId).catch(() => {});
      throw e;
    }
  };

  /**
   * @param {string} sessionId
   * @returns {Promise<BootConfigMessage>}
   */
  const buildBootConfigForSession = async sessionId => {
    const record = sessions.getRecord(sessionId);
    if (!record) throw new Error(`Unknown session ${sessionId}`);
    const credentials = await broker.issue(sessionId);
    return harden({
      type: /** @type {'boot_config'} */ ('boot_config'),
      credentials,
      fsMountTag: 'workspace',
      workspaceUidGid: /** @type {[number, number]} */ ([1000, 1000]),
      envExtra: record.request.envExtra ?? {},
      initialPrompt: record.request.initialPrompt,
      agentControlPort: '/dev/virtio-ports/agent',
    });
  };

  /**
   * @param {string} sessionId
   */
  const terminateSession = async sessionId => {
    const link = agents.get(sessionId);
    if (link) {
      try {
        link.send({ type: 'terminate', graceMs: 5000 });
      } catch {
        // Best-effort.
      }
    }
    const vm = vms.get(sessionId);
    if (vm) {
      vm.kill('SIGTERM');
      const killer = setTimeout(() => vm.kill('SIGKILL'), 5000);
      await vm.exitCode.catch(() => {});
      clearTimeout(killer);
    }
    await teardownSession(sessionId);
    sessions.setState(sessionId, 'terminated');
    await broker.revoke(sessionId).catch(() => {});
    await sessions.forget(sessionId);
  };

  /**
   * @param {string} sessionId
   */
  const teardownSession = async sessionId => {
    const mux = stdioMuxes.get(sessionId);
    if (mux) {
      await mux.stop().catch(() => {});
      stdioMuxes.delete(sessionId);
    }
    if (agents.has(sessionId)) {
      agents.get(sessionId)?.close();
      agents.delete(sessionId);
    }
    if (vms.has(sessionId)) {
      vms.delete(sessionId);
    }
    const cleanup = netCleanups.get(sessionId);
    if (cleanup) {
      await cleanup().catch(() => {});
      netCleanups.delete(sessionId);
    }
  };

  const api = makeApiServer({
    socketPath: config.socketPath,
    handlers: {
      createSession,
      listSessions: () => sessions.listSessions(),
      getSession: id => sessions.getSession(id),
      markReady,
      terminateSession,
    },
  });
  const server = await api.listen();

  return harden({
    server,
    async stop() {
      const ids = sessions.listSessions().map(s => s.id);
      await Promise.allSettled(ids.map(id => terminateSession(id)));
      await api.close();
      await network.shutdown();
    },
  });
};
harden(start);

/**
 * @param {CreateSessionRequest} request
 * @param {OrchestratorConfig} config
 * @returns {import('../protocol.types.d.ts').Arch}
 */
const resolveArch = (request, config) => request.arch ?? config.defaults.arch;
