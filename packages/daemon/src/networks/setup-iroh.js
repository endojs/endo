// @ts-check
// endo run --UNCONFINED packages/daemon/src/networks/setup-iroh.js --powers @agent

import { E } from '@endo/eventual-send';

/** @import { ERef } from '@endo/eventual-send' */

const irohSpecifier = new URL('iroh.js', import.meta.url).href;

/**
 * Install the iroh network module into the daemon and register it under
 * NETS/iroh so the daemon discovers it as an active transport.
 *
 * @param {ERef<any>} powers
 */
export const main = async powers => {
  await E(powers).makeUnconfined(undefined, irohSpecifier, {
    powersName: '@agent',
    resultName: 'network-service-iroh',
  });

  await E(powers).move(['network-service-iroh'], ['@nets', 'iroh']);

  return 'iroh network installed at @nets/iroh';
};
harden(main);
