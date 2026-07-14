// @ts-check

/**
 * The `@endo/fetch` service core. It composes the merged
 * `makeHttpClientAndControl` (`@endo/exo-http-client`, PR #566) over a durable
 * virtual-file-system store into a `FetchService` exo that hands out the two
 * facets, mirroring `ReminderService`:
 *
 * - `client()` - the guest-facing `HttpClient` facet, the only thing a confined
 *   agent ever holds. It can reach only allowlisted or pinned origins, under
 *   rate and byte caps, and never sees the plugin, the store, or ambient
 *   `fetch`.
 * - `control()` - the integration-facing `HttpClientControl` facet, retained by
 *   whoever provisioned the service.
 *
 * The core takes injectable `store`, `fetch`, and `now` seams, so tests run
 * against an in-memory filesystem, a fake transport, and a deterministic clock;
 * the plugin (`./index.js`) supplies the worker's ambient `fetch` and real
 * `now`. The durable store - not the `env` initials - is authoritative across
 * restarts: persisted policy and pins are adopted when present, and every
 * durable mutation (a control operation or a request-time trust-on-first-bind
 * pin) is written back through the `onPolicyChange` seam.
 */

import { Far } from '@endo/pass-style';
import { makeHttpClientAndControl } from '@endo/exo-http-client';

/** @import { FetchServicePowers, FetchService } from './types.js' */

const fetchServiceHelp = [
  'FetchService - a confined outbound-HTTP provider.',
  '',
  '  client()  -> HttpClient          (guest-facing)',
  '  control() -> HttpClientControl   (integration-facing)',
].join('\n');

/**
 * Create a fetch service capability pair over a durable store. Returns
 * `{ service, client, control }`: `service` is the exo the plugin returns (it
 * hands out the two facets), `client` is the guest-facing `HttpClient`, and
 * `control` is the integration-facing `HttpClientControl`.
 *
 * @param {FetchServicePowers} powers
 * @returns {Promise<FetchService>}
 */
export const makeFetchService = async powers => {
  const {
    store,
    fetch,
    now,
    allowedOrigins: envAllowedOrigins,
    maxRequestsPerMinute: envMaxRequestsPerMinute,
    maxResponseBytes: envMaxResponseBytes,
    policyMode: envPolicyMode,
    policyAuthority,
  } = powers;

  // The durable store is authoritative across restarts; the env-supplied values
  // are only the initial policy at first provisioning. Read both documents up
  // front and adopt persisted fields when present, otherwise fall through to the
  // env initials (and, for those the env omits, to the pair's own defaults).
  const persistedConfig = /** @type {any} */ (await store.readConfig());
  const persistedBindings = await store.readBindings();

  const pick = (persistedValue, envValue) =>
    persistedValue !== undefined ? persistedValue : envValue;

  const allowedOrigins =
    pick(
      persistedConfig && persistedConfig.allowedOrigins,
      envAllowedOrigins,
    ) || [];
  const maxRequestsPerMinute = pick(
    persistedConfig && persistedConfig.maxRequestsPerMinute,
    envMaxRequestsPerMinute,
  );
  const maxResponseBytes = pick(
    persistedConfig && persistedConfig.maxResponseBytes,
    envMaxResponseBytes,
  );
  const policyMode = pick(
    persistedConfig && persistedConfig.policyMode,
    envPolicyMode,
  );
  const revoked = Boolean(persistedConfig && persistedConfig.revoked);

  // Persist every durable mutation. Writes are serialized on a promise chain so
  // overlapping control operations and request-time pins cannot interleave, and
  // the snapshot is already an immutable capture from the seam, so a later
  // mutation cannot race the write that reads it. Best-effort: a failed write is
  // logged, never thrown into the request or control path.
  let writeChain = Promise.resolve();
  /** @param {import('@endo/exo-http-client').PolicySnapshot} snapshot */
  const persist = snapshot => {
    writeChain = writeChain
      .then(async () => {
        await store.writeConfig(snapshot.policy);
        await store.writeBindings(snapshot.bindings);
      })
      .catch(error => {
        console.error('[fetch] failed to persist policy:', error);
      });
  };

  const { client, control } = makeHttpClientAndControl({
    ...(fetch !== undefined ? { fetch } : {}),
    ...(now !== undefined ? { now } : {}),
    allowedOrigins,
    ...(maxRequestsPerMinute !== undefined ? { maxRequestsPerMinute } : {}),
    ...(maxResponseBytes !== undefined ? { maxResponseBytes } : {}),
    ...(policyMode !== undefined ? { policyMode } : {}),
    ...(policyAuthority !== undefined ? { policyAuthority } : {}),
    ...(persistedBindings !== undefined
      ? { initialBindings: persistedBindings }
      : {}),
    onPolicyChange: persist,
  });

  // A service persisted as revoked revives revoked: reapply the terminal flag
  // (which also re-persists it, harmlessly). Revocation is durable and permanent
  // by design.
  if (revoked) {
    control.revoke();
  }

  // Seed the store on first provisioning so it immediately reflects the initial
  // policy (config.json + bindings.json exist from the outset). Thereafter the
  // onPolicyChange seam keeps it current. On a restart the documents already
  // exist, so this is skipped and the persisted state stands.
  if (persistedConfig === undefined) {
    const inspected = control.inspect();
    persist(
      harden({
        policy: {
          allowedOrigins: [...inspected.allowedOrigins],
          maxRequestsPerMinute: inspected.maxRequestsPerMinute,
          maxResponseBytes: inspected.maxResponseBytes,
          policyMode: /** @type {import("@endo/exo-http-client").PolicyMode} */ (inspected.policyMode),
          revoked: inspected.revoked,
        },
        bindings: control.listBindings(),
      }),
    );
  }

  // The service exo hands out the two facets. It is what the plugin returns and
  // what an integration pins into `@pins` for wake-on-restart. There are no
  // live timers to tear down: the client is a stateless request/response
  // capability, so cancelling the caplet collapses the worker and with it the
  // guest's reference - no explicit cancellation revoke is needed (and one that
  // persisted `revoked` would wrongly revive the service revoked next boot).
  const service = Far('FetchService', {
    client: () => client,
    control: () => control,
    help: () => fetchServiceHelp,
  });

  return harden({ service, client, control });
};
harden(makeFetchService);
