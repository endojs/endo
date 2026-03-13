/* global harden */
// @ts-check
// Usage:
//   endo eval --UNCONFINED \
//     'E(powers).makeUnconfined(undefined, specifier, {
//       powersName: "AGENT",
//       resultName: "network-service-ws-relay",
//       env: { WS_RELAY_URL: "wss://endo-relay.fly.dev", WS_RELAY_DOMAIN: "endo-relay.fly.dev" },
//     })' specifier:ws-relay-specifier powers:SELF
//   endo mv network-service-ws-relay NETS.ws-relay

import { E } from '@endo/eventual-send';

const wsRelaySpecifier = new URL('ws-relay.js', import.meta.url).href;

/**
 * Install the ws-relay network module into the daemon and register it
 * under NETS/ws-relay so the daemon discovers it as an active transport.
 *
 * The relay URL and domain are passed via the `env` argument so that they
 * are persisted in the formula itself rather than looked up from the pet store
 * at boot time (which would fail on reincarnation).
 *
 * @param {import('@endo/eventual-send').ERef<object>} powers
 * @param {object} _context
 * @param {object} options
 * @param {Record<string, string>} options.env
 */
export const main = async (powers, _context, { env = {} } = {}) => {
  const relayUrl = env.WS_RELAY_URL || 'wss://endo-relay.fly.dev';
  const relayDomain = env.WS_RELAY_DOMAIN || new URL(relayUrl).hostname;

  await E(powers).makeUnconfined(undefined, wsRelaySpecifier, {
    powersName: 'AGENT',
    resultName: 'network-service-ws-relay',
    env: {
      WS_RELAY_URL: relayUrl,
      WS_RELAY_DOMAIN: relayDomain,
    },
  });

  await E(powers).move(['network-service-ws-relay'], ['NETS', 'ws-relay']);

  return `ws-relay network installed at NETS/ws-relay (relay: ${relayUrl})`;
};
harden(main);
