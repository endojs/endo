// @ts-check
/* global process, setTimeout */

/**
 * Endo interop client for a Guile-hosted Goblin Chat room over Tor onion.
 */

import '@endo/init';

/**
 * @import { SwissNum } from '@endo/ocapn'
 */

import { makeClient } from '@endo/ocapn';
import { makeTorNetLayer } from '@endo/ocapn/src/netlayers/tor.js';
import { parseOcapnUri } from '../../src/uri-parse.js';
import { runChatParticipant } from '../../src/interop-driver.js';

const DEFAULT_CAPTP_VERSION = '1.0';
const DEFAULT_GUILE_MESSAGE = 'hello from Guile CI';
const DEFAULT_ENDO_MESSAGE = 'hello from Endo OCapN';
const DEFAULT_TOR_CONTROL_SOCKET_PATH =
  '/tmp/ocapn-guile-interop/tor-control-sock';
const DEFAULT_TOR_SOCKS_SOCKET_PATH = '/tmp/ocapn-guile-interop/tor-socks-sock';
const DEFAULT_TOR_OCAPN_SOCKET_DIR = '/tmp/ocapn-guile-interop/ocapn-sockets';

/**
 * @param {string} sturdyrefUri
 * @returns {{ location: import('@endo/ocapn').OcapnLocation, swissNum: SwissNum }}
 */
const parseSturdyrefUri = sturdyrefUri => {
  const parsed = parseOcapnUri(sturdyrefUri);
  if (parsed.kind !== 'sturdyref' || !parsed.swissNum) {
    throw Error(`Expected sturdyref URI, got: ${sturdyrefUri}`);
  }
  return { location: parsed.location, swissNum: parsed.swissNum };
};

/**
 * Install signal handlers that synchronously close the OCapN client before
 * process exit. Returning 0 after the exchange has already completed avoids
 * spurious CI failures from late SIGHUP delivery.
 *
 * @param {() => void} shutdownClient
 * @param {() => boolean} isInteropComplete
 * @returns {() => void}
 */
const installSignalShutdown = (shutdownClient, isInteropComplete) => {
  const signals = /** @type {const} */ (['SIGINT', 'SIGTERM', 'SIGHUP']);
  let shutdownStarted = false;

  /** @param {NodeJS.Signals} signal */
  const onSignal = signal => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;
    try {
      shutdownClient();
    } catch (error) {
      console.error('Failed to shutdown Endo Tor interop client', error);
    }
    process.exit(isInteropComplete() ? 0 : 1);
  };

  for (const signal of signals) {
    process.once(signal, onSignal);
  }
  return () => {
    for (const signal of signals) {
      process.off(signal, onSignal);
    }
  };
};

const main = async () => {
  const sturdyrefUri = process.argv[2];
  if (!sturdyrefUri) {
    throw Error('Usage: node index-tor.js <guile-chatroom-sturdyref-uri>');
  }

  const expectedGuileMessage =
    process.env.OCAPN_INTEROP_GUILE_MESSAGE || DEFAULT_GUILE_MESSAGE;
  const endoMessage =
    process.env.OCAPN_INTEROP_ENDO_MESSAGE || DEFAULT_ENDO_MESSAGE;
  const controlSocketPath =
    process.env.OCAPN_TOR_CONTROL_PATH ||
    process.env.OCAPN_TOR_CONTROL_SOCKET_PATH ||
    process.env.TOR_CONTROL_PATH ||
    DEFAULT_TOR_CONTROL_SOCKET_PATH;
  const socksSocketPath =
    process.env.OCAPN_TOR_SOCKS_PATH ||
    process.env.OCAPN_TOR_SOCKS_SOCKET_PATH ||
    process.env.TOR_SOCKS_PATH ||
    DEFAULT_TOR_SOCKS_SOCKET_PATH;
  const ocapnSocketDir =
    process.env.OCAPN_TOR_OCAPN_SOCKS_DIR ||
    process.env.OCAPN_TOR_OCAPN_SOCKET_DIR ||
    process.env.TOR_OCAPN_SOCKS_DIR ||
    DEFAULT_TOR_OCAPN_SOCKET_DIR;

  const { location, swissNum } = parseSturdyrefUri(sturdyrefUri);
  const captpVersion = process.env.OCAPN_CAPTP_VERSION || DEFAULT_CAPTP_VERSION;
  const client = makeClient({ verbose: true, captpVersion });
  let interopComplete = false;
  const removeSignalShutdownHandlers = installSignalShutdown(
    () => client.shutdown(),
    () => interopComplete,
  );
  await null;
  try {
    await client.registerNetlayer((handlers, logger) =>
      makeTorNetLayer({
        handlers,
        logger,
        controlSocketPath,
        socksSocketPath,
        ocapnSocketDir,
      }),
    );
    const sturdyRef = client.makeSturdyRef(location, swissNum);
    const chatroom = await client.enlivenSturdyRef(sturdyRef);
    await runChatParticipant({
      chatroom,
      name: 'endo-interop-ocapn-tor',
      localMessage: endoMessage,
      expectedRemoteMessage: expectedGuileMessage,
      log: line => console.log(`*** ${line}`),
    });
    interopComplete = true;
    // Give the Guile side a short window to observe the final message/ack path
    // before this process tears down its connection.
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('*** Endo Tor interop completed');
  } finally {
    removeSignalShutdownHandlers();
    client.shutdown();
  }
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
