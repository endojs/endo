/* global harden */
// @ts-check
// endo run --UNCONFINED packages/daemon/src/networks/setup-libp2p.js --powers HOST

import { E } from '@endo/eventual-send';

const libp2pSpecifier = new URL('libp2p.js', import.meta.url).href;

/**
 * Install the libp2p network module into the daemon and register it
 * under NETS/libp2p so the daemon discovers it as an active transport.
 *
 * @param {import('@endo/eventual-send').ERef<object>} powers
 */
export const main = async powers => {
  await E(powers).makeUnconfined(undefined, libp2pSpecifier, {
    powersName: 'AGENT',
    resultName: 'network-service-libp2p',
    workerTrustedShims: ['@libp2p/webrtc', './shims/async-generator-return.js'],
  });

  await E(powers).move(['network-service-libp2p'], ['NETS', 'libp2p']);

  return 'libp2p network installed at NETS/libp2p';
};
harden(main);
