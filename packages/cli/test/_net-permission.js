/* global process */
import { spawnSync } from 'child_process';

const script = `
  const net = require('net');
  const server = net.createServer();
  server.once('error', err => {
    process.exit(err && err.code === 'EPERM' ? 1 : 2);
  });
  server.listen(0, '127.0.0.1', () => {
    server.close(() => process.exit(0));
  });
`;

const { status } = spawnSync(process.execPath, ['-e', script], {
  stdio: 'ignore',
});

export const netListenAllowed = status === 0;
