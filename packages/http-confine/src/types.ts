export type FetchLikeBodyReader = {
  read: () => Promise<{ done?: boolean; value?: unknown }>;
  cancel?: (reason?: unknown) => Promise<void>;
  releaseLock?: () => void;
};

export type FetchLikeResponse = {
  body?: {
    getReader: () => FetchLikeBodyReader;
  } | null;
  status?: number;
  statusText?: string;
  ok?: boolean;
  headers?: Headers | Record<string, string> | Iterable<[string, string]>;
  url?: string;
};

export type FetchLikeRequestOptions = {
  redirect: 'manual';
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
};

export type FetchLike = (
  url: string,
  options?: FetchLikeRequestOptions,
) => Promise<FetchLikeResponse> | FetchLikeResponse;

export type HttpConfinementPolicy = {
  allowedOrigins?: string[] | (() => string[]);
  maxRequestsPerMinute?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  allowedMethods?: Set<string>;
};

export type ConfinedRequest = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  cancellation?: Promise<never>;
};

export type ConfinedResponse = {
  response: FetchLikeResponse;
  bytes: Uint8Array;
  truncated: boolean;
  maxResponseBytes: number;
};
