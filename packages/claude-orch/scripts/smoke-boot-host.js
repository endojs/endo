// @ts-nocheck
/* eslint-disable import/order */
/* global process, setTimeout */
//
// Host-side responder for `scripts/smoke-boot.sh`.
//
// Replaces the previous inline Node heredoc that rolled its own 9P
// responder. We now use the real `@endo/claude-container` 9P
// bridge (closing R1) backed by an `@endo/remote-fs` in-memory
// `Filesystem` populated with a single greeting file. The kernel
// inside QEMU mounts the bridge via 9P-trans=fd through the
// socketpair relay (see bootstrap-init).
//
// argv:
//   smoke-boot-host.js <BUILD_DIR> <hello-out-path> <ready-out-path>
//
// Writes `hello.json` when ctl.sock receives a Hello; writes
// `agent-ready.json` when agent.sock receives a Ready. Exits 0
// after 30s no matter what — the shell script reads those two
// files to decide PASS/FAIL.

import '@endo/init/debug.js';

import net from 'node:net';
import fs from 'node:fs';

import { E } from '@endo/eventual-send';

import { makeInMemoryFilesystem } from '@endo/remote-fs/src/in-memory.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { makeFsBridge9p } from '@endo/9p-server';

const [, , dir, helloFile, readyFile] = process.argv;
if (!dir || !helloFile || !readyFile) {
  console.error(
    'usage: smoke-boot-host.js <BUILD_DIR> <hello-out> <ready-out>',
  );
  process.exit(2);
}

// ---------- workspace FS ----------
//
// Populate a tiny in-memory remote-fs Filesystem with content the
// guest can read via 9P. The bridge below serves this FS to QEMU's
// 9P chardev.
const workspaceFs = makeInMemoryFilesystem();

const populate = async () => {
  const root = await E(workspaceFs).root();
  const greet = await E(root).create('hello.txt', {});
  const w = iterateBytesWriter(await E(greet).write(0n));
  await w.next(new TextEncoder().encode('hello from remote-fs\n'));
  await w.return();
  await E(greet).close();
};

const main = async () => {
  await populate();

  // ---------- ctl.sock: receive Hello, send BootConfig ----------
  net
    .createServer(conn => {
      let buf = '';
      conn.on('data', d => {
        buf += d.toString('utf8');
        const i = buf.indexOf('\n');
        if (i >= 0) {
          fs.writeFileSync(helloFile, buf.slice(0, i));
          conn.write(
            `${JSON.stringify({
              type: 'boot_config',
              credentials: { apiKey: 'k' },
              fsMountTag: 'workspace',
              workspaceUidGid: [1000, 1000],
              envExtra: {},
              agentControlPort: 'agent',
            })}\n`,
          );
        }
      });
      conn.on('error', () => {});
    })
    .listen(`${dir}/ctl.sock`);

  // ---------- fs.sock: real 9P bridge over remote-fs ----------
  const bridge = makeFsBridge9p({
    fs: workspaceFs,
    socketPath: `${dir}/fs.sock`,
  });
  await E(bridge).start();

  // ---------- agent.sock: receive Ready ----------
  net
    .createServer(c => {
      let buf = '';
      c.on('data', d => {
        buf += d.toString('utf8');
        let i;
        // eslint-disable-next-line no-cond-assign
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'ready') {
              fs.writeFileSync(readyFile, JSON.stringify(msg));
            }
          } catch {
            // ignore non-JSON
          }
        }
      });
      c.on('error', () => {});
    })
    .listen(`${dir}/agent.sock`);

  console.log('[smoke-boot-host] listening on ctl/fs/agent sockets');
};

main().catch(e => {
  console.error('[smoke-boot-host] fatal', e);
  process.exit(1);
});

// Self-terminate after 30s — the shell script reads the output
// files; this process should not outlive QEMU.
setTimeout(() => process.exit(0), 30000);
