// @ts-check

/**
 * @file Configuration parsing for `@endo/gateway`.
 *
 * The gateway's configuration has three sources, later wins:
 *
 *   1. Built-in defaults in {@link defaultGatewayConfig}.
 *   2. The `config` argument to `makeGateway({ ... })`, which
 *      `mergeGatewayConfig` blends with the defaults.
 *   3. Environment variables: `ENDO_HTTP_ADDR` for the bind, and
 *      a future `ENDO_GATEWAY_*` family for the rest.
 *
 * The bind-address parser is the one bit with platform-shaped
 * pitfalls: port `0` is falsy in JavaScript, and an IPv6 address
 * needs bracket-stripping when extracting the host. Both are
 * handled here so callers do not have to.
 */

import { makeError, q, X } from '@endo/errors';

/** @import { BindAddress, FeatureToggles, GatewayConfig } from '../types.d.ts' */

/**
 * The default bind address per `designs/gateway-package.md` §
 * Bind Shape. `0.0.0.0` is the public-network IPv4 wildcard;
 * `8920` preserves the daemon HTTP port while leaving `3469`
 * available for a future CBOR-frame transport.
 */
export const DEFAULT_BIND_ADDRESS = '0.0.0.0:8920';
harden(DEFAULT_BIND_ADDRESS);

/**
 * The default per-feature toggle map, matching the system-service
 * deployment per the design's Configuration Model § Per-feature
 * toggles. `relay.enabled` is `false` (opt-in) because the public
 * relay is not appropriate without an explicit operator decision;
 * everything else is on.
 */
export const defaultFeatureToggles = harden({
  /** Feature 1: Chat hosting + payment-token enhancement. */
  chatHosting: true,
  /** Feature 2: virtual hosting (Host header to Weblet formula). */
  virtualHosting: true,
  /** Feature 3: Git over HTTP, formula-identifier bearer-token. */
  gitHttp: true,
  /** Feature 4: UDS bootstrap for local CapTP relay registration. */
  udsBootstrap: true,
  /** Feature 6: public CapTP relay (opt-in). */
  captpRelay: false,
  /** Feature 7: admin daemon (UDS-only). */
  adminDaemon: true,
  /** Feature 8: `/ocapn-cbor-np` WebSocket subprotocol. */
  ocapnWebSocket: true,
});

/**
 * Defaults for every `makeGateway` configuration field.
 */
export const defaultGatewayConfig = harden({
  bindAddress: DEFAULT_BIND_ADDRESS,
  enableFeatures: defaultFeatureToggles,
  trustedProxyCidrs: harden([]),
  maxProxyHops: 1,
});

/**
 * Parse an `ENDO_HTTP_ADDR`-shaped `host:port` string.
 *
 * Returns a normalized {@link BindAddress}. Throws on malformed
 * input. Notably correct:
 *
 *   - IPv6: `[::1]:8920` -> { host: '::1', kind: 'ipv6', port: 8920 }
 *   - OS-assigned port: `127.0.0.1:0` keeps port `0`, not `8920`.
 *     The naive `Number(port) || default` collapses `0` to the
 *     default (see `project/AGENTS.md` § Familiar), so the parser
 *     uses the `port !== '' ? Number(port) : default` rule.
 *
 * @param {string} input
 * @returns {BindAddress}
 */
export const parseBindAddress = input => {
  if (typeof input !== 'string' || input.length === 0) {
    throw makeError(
      X`Bind address must be a non-empty string, got ${q(input)}`,
    );
  }

  if (input.startsWith('[')) {
    const closeBracket = input.indexOf(']');
    if (closeBracket < 0) {
      throw makeError(
        X`IPv6 bind address missing closing bracket: ${q(input)}`,
      );
    }
    const rest = input.slice(closeBracket + 1);
    if (!rest.startsWith(':')) {
      throw makeError(
        X`IPv6 bind address must have port after bracket: ${q(input)}`,
      );
    }
  } else {
    const lastColon = input.lastIndexOf(':');
    if (lastColon < 0) {
      throw makeError(X`Bind address must include host:port: ${q(input)}`);
    }
    const hostPart = input.slice(0, lastColon);
    if (hostPart.includes(':')) {
      throw makeError(
        X`Bare IPv6 bind address is ambiguous, use bracket notation: ${q(input)}`,
      );
    }
  }

  // Per `project/AGENTS.md` § Familiar: port 0 is falsy in JS, so
  // the conditional has to test the string, not the number.
  const portString = input.slice(input.lastIndexOf(':') + 1);
  if (portString === '') {
    throw makeError(X`Bind address port cannot be empty: ${q(input)}`);
  }
  if (!/^[0-9]+$/.test(portString)) {
    throw makeError(X`Bind address port must be numeric: ${q(input)}`);
  }
  const port = Number(portString);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw makeError(
      X`Bind address port must be 0..65535, got ${q(portString)}`,
    );
  }

  /** @type {URL} */
  let parsed;
  try {
    parsed = new URL(`http://${input}`);
  } catch {
    throw makeError(X`Malformed bind address: ${q(input)}`);
  }
  if (
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw makeError(X`Bind address must be a bare host:port: ${q(input)}`);
  }

  const host = parsed.hostname.replace(/^\[(.*)\]$/, '$1');
  if (host.length === 0) {
    throw makeError(X`Bind address host cannot be empty: ${q(input)}`);
  }

  /** @type {'ipv4' | 'ipv6' | 'hostname'} */
  const kind = input.startsWith('[')
    ? 'ipv6'
    : /^[0-9]+(\.[0-9]+){3}$/.test(host)
      ? 'ipv4'
      : 'hostname';

  return harden({ host, port, kind });
};
harden(parseBindAddress);

/**
 * Validate the inter-feature dependency graph spelled out in the
 * design's Configuration Model § Dependencies between features.
 * A misconfiguration is a startup error.
 *
 * @param {FeatureToggles} features
 */
const validateFeatureDependencies = features => {
  if (features.captpRelay && !features.ocapnWebSocket) {
    throw makeError(
      X`captpRelay depends on ocapnWebSocket for the wire surface; both must be enabled`,
    );
  }
  if (features.captpRelay && !features.udsBootstrap) {
    throw makeError(
      X`captpRelay depends on udsBootstrap for registration; both must be enabled`,
    );
  }
  if (features.adminDaemon && !features.udsBootstrap) {
    throw makeError(
      X`adminDaemon depends on udsBootstrap for its access channel; both must be enabled`,
    );
  }
  if (features.chatHosting && !features.virtualHosting) {
    throw makeError(
      X`chatHosting depends on virtualHosting for the Chat weblet's bind; both must be enabled`,
    );
  }
};

/**
 * Merge a partial caller-supplied gateway config with the
 * defaults, validate the result, and return a hardened
 * {@link GatewayConfig}.
 *
 * @param {Partial<GatewayConfig>} [config]
 * @returns {GatewayConfig}
 */
export const mergeGatewayConfig = (config = {}) => {
  const enableFeatures = harden({
    ...defaultFeatureToggles,
    ...(config.enableFeatures ?? {}),
  });
  validateFeatureDependencies(enableFeatures);

  /** @type {GatewayConfig} */
  const merged = harden({
    bindAddress: config.bindAddress ?? defaultGatewayConfig.bindAddress,
    enableFeatures,
    trustedProxyCidrs: harden([
      ...(config.trustedProxyCidrs ?? defaultGatewayConfig.trustedProxyCidrs),
    ]),
    maxProxyHops: config.maxProxyHops ?? defaultGatewayConfig.maxProxyHops,
  });

  // Validate the bind address now so a malformed value fails at
  // configuration time rather than at start time.
  parseBindAddress(merged.bindAddress);

  return merged;
};
harden(mergeGatewayConfig);

/**
 * Read the bind address from an environment-shaped map, falling
 * back to the configured value. `ENDO_HTTP_ADDR` is the canonical
 * environment variable per the design's Bind Shape section.
 *
 * @param {{[name: string]: string | undefined}} env
 * @param {string} [configured]
 * @returns {string}
 */
export const bindAddressFromEnv = (env, configured = DEFAULT_BIND_ADDRESS) => {
  const fromEnv = env.ENDO_HTTP_ADDR;
  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv;
  }
  return configured;
};
harden(bindAddressFromEnv);
