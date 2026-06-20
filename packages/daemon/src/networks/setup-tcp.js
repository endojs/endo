// @ts-check
// Usage (installs the tcp-netstring network at NETS/tcp):
//   endo run --UNCONFINED packages/daemon/src/networks/setup-tcp.js \
//     --powers @agent -E ENDO_TCP_LISTEN=127.0.0.1:9100
//
// Requires --powers @agent because the script calls makeUnconfined()
// and storeValue(). The tcp-netstring service reads its listen address
// from the agent pet name `tcp-listen-addr`, so we store it first.

import { E } from '@endo/eventual-send';

const tcpSpecifier = new URL('tcp-netstring.js', import.meta.url).href;

/**
 * @param {import("@endo/eventual-send").ERef<any>} powers - HOST/@agent powers.
 * @param {object} [_context]
 * @param {object} [options]
 * @param {Record<string, string>} [options.env]
 */
export const main = async (powers, _context, { env = {} } = {}) => {
  const listen = env.ENDO_TCP_LISTEN || '127.0.0.1:0';
  await E(powers).storeValue(listen, 'tcp-listen-addr');

  await E(powers).makeUnconfined(undefined, tcpSpecifier, {
    powersName: '@agent',
    resultName: 'network-service-tcp',
  });

  await E(powers).move(['network-service-tcp'], ['@nets', 'tcp']);

  return `tcp network installed at @nets/tcp (listen ${listen})`;
};
harden(main);
