import { start, makeEndoClient } from '@endo/daemon';

/**
 * @template TBootstrap
 * @param {string} name
 * @param {string} sockPath
 * @param {Promise<void>} cancelled
 * @param {TBootstrap} [bootstrap]
 */
export const provideEndoClient = async (
  name,
  sockPath,
  cancelled,
  bootstrap,
) => {
  await null;
  try {
    // It is okay to fail to connect because the daemon is not running.
    return await makeEndoClient(name, sockPath, cancelled, bootstrap);
  } catch {
    console.error('Starting Endo daemon...');
    // It is also okay to fail the race to start.
    await start().catch(() => {});
    // But not okay to fail to connect after starting.
    // We are not going to contemplate reliably in the face of a worker getting
    // stopped the moment after it was started.
    // That is a bridge too far.
    return makeEndoClient(name, sockPath, cancelled, bootstrap);
  }
};
