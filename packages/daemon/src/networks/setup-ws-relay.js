/* global harden */
// @ts-check
// Usage (installs the ws-relay network caplet at NETS/ws-relay):
//   endo run --UNCONFINED packages/daemon/src/networks/setup-ws-relay.js --powers @agent
//
// Requires --powers @agent because the script calls makeUnconfined().
// Edit the defaults below to target a different relay server.

import { E } from '@endo/eventual-send';

const wsRelaySpecifier = new URL('ws-relay.js', import.meta.url).href;

/**
 * Install the ws-relay network module into the daemon and register it
 * under NETS/ws-relay so the daemon discovers it as an active transport.
 *
 * The relay URL and domain default to the public relay at
 * wss://endo-relay.fly.dev. The resolved values are persisted in the
 * formula env so they survive reincarnation without a pet-store lookup
 * at boot time.
 *
 * @param {import('@endo/eventual-send').ERef<object>} powers - HOST powers
 * (requires `makeUnconfined`; use `--powers @agent`).
 * @param {object} [_context]
 * @param {object} [options]
 * @param {Record<string, string>} [options.env]
 */
export const main = async (powers, _context, { env = {} } = {}) => {
  const relayUrl = env.WS_RELAY_URL || 'wss://endo-relay.fly.dev';
  const relayDomain = env.WS_RELAY_DOMAIN || new URL(relayUrl).hostname;

  await E(powers).makeUnconfined(undefined, wsRelaySpecifier, {
    powersName: '@agent',
    resultName: 'network-service-ws-relay',
    env: {
      WS_RELAY_URL: relayUrl,
      WS_RELAY_DOMAIN: relayDomain,
    },
  });

  await E(powers).move(['network-service-ws-relay'], ['@nets', 'ws-relay']);

  return `ws-relay network installed at NETS/ws-relay (relay: ${relayUrl})`;
};
harden(main);
