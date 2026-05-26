// TODO: remove this local shim once `@libp2p/utils` ships its own
// `adaptive-timeout` typings (or re-exports `AdaptiveTimeout` from its
// package root). Trigger: a published `@libp2p/utils` whose own
// `types` field resolves the deep import without an ambient
// declaration. When that lands, bump the dependency and delete this
// file along with its tsconfig include.

declare module '@libp2p/utils/src/adaptive-timeout.js' {
  export const DEFAULT_TIMEOUT_MULTIPLIER: 1.2;
  export const DEFAULT_FAILURE_MULTIPLIER: 2;
  export const DEFAULT_MIN_TIMEOUT: 5000;
  export const DEFAULT_MAX_TIMEOUT: 60000;
  export const DEFAULT_INTERVAL: 5000;

  export interface AdaptiveTimeoutSignal extends AbortSignal {
    clear(): void;
    start: number;
    timeout: number;
  }

  export interface AdaptiveTimeoutInit {
    metricName?: string;
    metrics?: unknown;
    interval?: number;
    timeoutMultiplier?: number;
    failureMultiplier?: number;
    minTimeout?: number;
    maxTimeout?: number;
  }

  export interface GetTimeoutSignalOptions {
    timeoutFactor?: number;
    signal?: AbortSignal;
  }

  export class AdaptiveTimeout {
    constructor(init?: AdaptiveTimeoutInit);
    getTimeoutSignal(options?: GetTimeoutSignalOptions): AdaptiveTimeoutSignal;
    cleanUp(signal: AdaptiveTimeoutSignal): void;
  }
}
