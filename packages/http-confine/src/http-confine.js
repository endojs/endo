// @ts-check
/* global AbortController, clearTimeout, setTimeout */

import { makeError, q, X } from '@endo/errors';

/**
 * @import {
 *   ConfinedRequest,
 *   ConfinedResponse,
 *   FetchLike,
 *   FetchLikeBodyReader,
 *   FetchLikeResponse,
 *   HttpConfinementPolicy,
 * } from './types.js'
 */

const freeze = /** @type {<T>(value: T) => T} */ (
  typeof harden === 'function' ? harden : Object.freeze
);

const DEFAULT_ALLOWED_METHODS = freeze(new Set(['GET', 'HEAD']));
const CONFINED_ALLOWED_METHODS = freeze(
  new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']),
);
const HTTP_SCHEMES = freeze(new Set(['http:', 'https:']));
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 60;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

const FORBIDDEN_HEADER_NAMES = freeze(
  new Set([
    'accept-charset',
    'accept-encoding',
    'access-control-request-headers',
    'access-control-request-method',
    'connection',
    'content-length',
    'cookie',
    'cookie2',
    'date',
    'dnt',
    'expect',
    'host',
    'keep-alive',
    'origin',
    'referer',
    'set-cookie',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'via',
  ]),
);

const HTTP_HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// eslint-disable-next-line no-control-regex
const HTTP_HEADER_VALUE = /^[\t\x20-\x7e\x80-\xff]*$/;
/** @type {WeakMap<AbortSignal, AbortController>} */
const signalToController = new WeakMap();

/**
 * @param {string} name
 * @returns {new (message?: string) => Error}
 */
const makeErrorConstructor = name => {
  /**
   * @this {Error}
   * @param {string} [message]
   */
  const TypedError = function HttpConfineTypedError(message = '') {
    const error = new Error(message);
    error.name = name;
    Object.setPrototypeOf(error, TypedError.prototype);
    return error;
  };
  TypedError.prototype = {
    __proto__: Error.prototype,
    constructor: TypedError,
  };
  return freeze(
    /** @type {new (message?: string) => Error} */ (
      /** @type {unknown} */ (TypedError)
    ),
  );
};

export const OriginNotAllowedError = makeErrorConstructor(
  'OriginNotAllowedError',
);
freeze(OriginNotAllowedError);

export const MethodNotAllowedError = makeErrorConstructor(
  'MethodNotAllowedError',
);
freeze(MethodNotAllowedError);

export const HeaderRejectedError = makeErrorConstructor('HeaderRejectedError');
freeze(HeaderRejectedError);

export const RateLimitError = makeErrorConstructor('RateLimitError');
freeze(RateLimitError);

export const RevokedError = makeErrorConstructor('RevokedError');
freeze(RevokedError);

/**
 * @param {string} name
 * @param {string} message
 * @returns {Error}
 */
const makeNamedError = (name, message) => {
  switch (name) {
    case 'OriginNotAllowedError':
      return new OriginNotAllowedError(message);
    case 'MethodNotAllowedError':
      return new MethodNotAllowedError(message);
    case 'HeaderRejectedError':
      return new HeaderRejectedError(message);
    case 'RateLimitError':
      return new RateLimitError(message);
    case 'RevokedError':
      return new RevokedError(message);
    default:
      return makeError(message);
  }
};

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
const validatePositiveInteger = (value, name) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw makeError(
      X`${name} must be a positive safe integer, got ${q(value)}`,
    );
  }
  return value;
};

/**
 * @param {string} url
 * @returns {URL}
 */
const parseHttpUrl = url => {
  if (typeof url !== 'string') {
    throw makeError(X`URL must be a string, got ${q(url)}`);
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    throw makeError(
      X`Invalid URL ${q(url)}: ${q(/** @type {Error} */ (err).message)}`,
    );
  }
  if (!HTTP_SCHEMES.has(parsed.protocol)) {
    throw makeError(X`Unsupported URL protocol ${q(parsed.protocol)}`);
  }
  return parsed;
};

/**
 * @param {string[]} entries
 * @returns {Set<string>}
 */
export const parseAllowedOrigins = entries => {
  if (!Array.isArray(entries)) {
    throw makeError(X`Allowed origins must be an array, got ${q(entries)}`);
  }
  const origins = new Set();
  for (const entry of entries) {
    origins.add(parseHttpUrl(entry).origin);
  }
  return freeze(origins);
};
freeze(parseAllowedOrigins);

/**
 * @param {string} url
 * @param {Set<string>} origins
 */
export const checkOriginAllowed = (url, origins) => {
  const origin = parseHttpUrl(url).origin;
  if (!origins.has(origin)) {
    throw makeNamedError(
      'OriginNotAllowedError',
      `Origin ${origin} is not in the allowed-origin list`,
    );
  }
};
freeze(checkOriginAllowed);

/**
 * @param {string} [method]
 * @param {{ allowedMethods?: Set<string> }} [opts]
 * @returns {string}
 */
export const normalizeMethod = (
  method = 'GET',
  { allowedMethods = DEFAULT_ALLOWED_METHODS } = {},
) => {
  const normalized = typeof method === 'string' ? method.toUpperCase() : '';
  if (!allowedMethods.has(normalized)) {
    throw makeNamedError(
      'MethodNotAllowedError',
      `Unsupported HTTP method ${String(method)}`,
    );
  }
  return normalized;
};
freeze(normalizeMethod);

/**
 * @param {Record<string, string>} [headers]
 */
export const assertHeadersSafe = headers => {
  if (headers === undefined) {
    return;
  }
  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase();
    if (
      !HTTP_HEADER_NAME.test(name) ||
      FORBIDDEN_HEADER_NAMES.has(lowerName) ||
      lowerName.startsWith('proxy-') ||
      lowerName.startsWith('sec-')
    ) {
      throw makeNamedError(
        'HeaderRejectedError',
        `Invalid HTTP header name ${name}`,
      );
    }
    if (typeof value !== 'string' || !HTTP_HEADER_VALUE.test(value)) {
      throw makeNamedError(
        'HeaderRejectedError',
        `Invalid HTTP header value for ${name}`,
      );
    }
  }
};
freeze(assertHeadersSafe);

/**
 * @param {{ maxPerMinute: number, now: () => number }} opts
 */
export const makeRateLimiter = ({ maxPerMinute, now }) => {
  const max = validatePositiveInteger(maxPerMinute, 'maxPerMinute');
  /** @type {number[]} */
  const requestTimes = [];
  const prune = () => {
    const cutoff = now() - 60_000;
    while (requestTimes.length > 0 && requestTimes[0] <= cutoff) {
      requestTimes.shift();
    }
  };
  const limiter = freeze({
    take: () => {
      prune();
      if (requestTimes.length >= max) {
        throw makeNamedError(
          'RateLimitError',
          `HttpClient rate limit exceeded: ${max} requests per minute`,
        );
      }
      requestTimes.push(now());
    },
    remaining: () => {
      prune();
      return Math.max(0, max - requestTimes.length);
    },
  });
  return limiter;
};
freeze(makeRateLimiter);

/**
 * @param {unknown} chunk
 * @returns {Uint8Array}
 */
const chunkToBytes = chunk => {
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(chunk);
  }
  if (typeof chunk === 'string') {
    return new TextEncoder().encode(chunk);
  }
  throw makeError(X`Unsupported response body chunk ${q(chunk)}`);
};

/**
 * @param {{ getReader: () => FetchLikeBodyReader } | null | undefined} source
 * @param {{ maxBytes: number, signal?: AbortSignal }} opts
 * @returns {{ stream: Promise<Uint8Array>, truncated: () => boolean }}
 */
export const limitResponseBytes = (source, { maxBytes, signal }) => {
  const max = validatePositiveInteger(maxBytes, 'maxBytes');
  let wasTruncated = false;

  const stream = (async () => {
    await null;
    if (source === null) {
      return freeze(new Uint8Array(0));
    }
    if (!source || typeof source.getReader !== 'function') {
      throw makeError(
        X`Fetch response body must support streaming getReader() to enforce maxResponseBytes`,
      );
    }
    const reader = source.getReader();
    let aborted = false;
    /** @type {(reason?: unknown) => void} */
    let rejectAborted = () => {};
    const abortedP = new Promise((_, reject) => {
      rejectAborted = reject;
    });
    const abort = () => {
      aborted = true;
      rejectAborted(
        makeNamedError('RevokedError', 'HttpClient has been revoked'),
      );
      if (typeof reader.cancel === 'function') {
        void Promise.resolve(reader.cancel('HttpClient revoked')).catch(
          () => {},
        );
      }
    };
    if (signal) {
      if (signal.aborted) {
        abort();
      } else {
        signal.addEventListener('abort', abort, { once: true });
      }
    }
    /** @type {Uint8Array[]} */
    const chunks = [];
    let total = 0;
    try {
      while (!wasTruncated) {
        if (aborted) {
          throw makeNamedError('RevokedError', 'HttpClient has been revoked');
        }
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await Promise.race([reader.read(), abortedP]);
        if (aborted) {
          throw makeNamedError('RevokedError', 'HttpClient has been revoked');
        }
        if (done) {
          break;
        }
        const chunk = chunkToBytes(value);
        if (chunk.byteLength > 0) {
          const remaining = max - total;
          if (chunk.byteLength >= remaining) {
            chunks.push(chunk.slice(0, Math.max(remaining, 0)));
            total = max;
            wasTruncated = true;
            break;
          }
          chunks.push(chunk);
          total += chunk.byteLength;
        }
      }
      if (wasTruncated && typeof reader.cancel === 'function') {
        await Promise.resolve(reader.cancel('maxResponseBytes exceeded')).catch(
          () => {},
        );
      }
    } finally {
      if (signal) {
        signal.removeEventListener('abort', abort);
      }
      if (typeof reader.releaseLock === 'function') {
        reader.releaseLock();
      }
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return freeze(bytes);
  })();

  return freeze({ stream, truncated: () => wasTruncated });
};
freeze(limitResponseBytes);

/**
 * @param {FetchLikeResponse} response
 * @param {Set<string>} origins
 * @returns {'follow' | 'reject'}
 */
export const resolveRedirect = (response, origins) => {
  const status = Number(response.status || 0);
  if (status < 300 || status >= 400) {
    return 'follow';
  }
  const headers = response.headers || {};
  let location;
  if (typeof (/** @type {Headers} */ (headers).get) === 'function') {
    location = /** @type {Headers} */ (headers).get('location');
  } else {
    for (const [name, value] of Object.entries(
      /** @type {Record<string, string>} */ (headers),
    )) {
      if (name.toLowerCase() === 'location') {
        location = value;
      }
    }
  }
  if (!location) {
    return 'reject';
  }
  const baseUrl = String(response.url || '');
  const redirectUrl = new URL(String(location), baseUrl).href;
  try {
    checkOriginAllowed(redirectUrl, origins);
  } catch (_err) {
    return 'reject';
  }
  return 'follow';
};
freeze(resolveRedirect);

/**
 * @param {{ timeoutMs: number, cancellation?: Promise<never> }} opts
 * @returns {{ signal: AbortSignal, dispose: () => void }}
 */
export const makeRequestSignal = ({ timeoutMs, cancellation }) => {
  const timeout = validatePositiveInteger(timeoutMs, 'timeoutMs');
  const controller = new AbortController();
  signalToController.set(controller.signal, controller);
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  if (cancellation) {
    void cancellation.then(
      () => controller.abort(),
      () => controller.abort(),
    );
  }
  return Object.freeze({
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeoutId);
    },
  });
};
freeze(makeRequestSignal);

/**
 * If `policy.allowedOrigins` is an array, this confinement owns the normalized
 * allowlist and its origin mutators update that internal copy.
 * If it is a thunk, the caller owns the authority; the thunk is resolved for
 * each request-time origin check and redirect decision, and origin mutators
 * throw.
 *
 * @param {HttpConfinementPolicy} policy
 * @param {{ fetch: FetchLike, now: () => number }} seams
 */
export const makeHttpConfinement = (policy, { fetch, now }) => {
  if (typeof fetch !== 'function') {
    throw makeError(X`fetch is required`);
  }
  if (typeof now !== 'function') {
    throw makeError(X`now is required`);
  }

  const allowedOriginSource = policy.allowedOrigins || [];
  const hasInjectedAllowedOrigins = typeof allowedOriginSource === 'function';
  /** @type {Set<string>} */
  let allowed =
    typeof allowedOriginSource === 'function'
      ? parseAllowedOrigins([])
      : parseAllowedOrigins(allowedOriginSource);
  let rateLimiter = makeRateLimiter({
    maxPerMinute:
      policy.maxRequestsPerMinute ?? DEFAULT_MAX_REQUESTS_PER_MINUTE,
    now,
  });
  let maxResponseBytes = validatePositiveInteger(
    policy.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    'maxResponseBytes',
  );
  let timeoutMs = validatePositiveInteger(
    policy.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    'timeoutMs',
  );
  let requestLimit =
    policy.maxRequestsPerMinute ?? DEFAULT_MAX_REQUESTS_PER_MINUTE;
  const allowedMethods = policy.allowedMethods || CONFINED_ALLOWED_METHODS;
  let revoked = false;
  /** @type {Set<AbortController>} */
  const controllers = new Set();

  const assertNotRevoked = () => {
    if (revoked) {
      throw makeNamedError('RevokedError', 'HttpClient has been revoked');
    }
  };

  const assertOwnsAllowedOrigins = () => {
    if (hasInjectedAllowedOrigins) {
      throw makeError(
        X`Allowed origins are externally owned in injected-authority mode`,
      );
    }
  };

  const getAllowedOrigins = () =>
    typeof allowedOriginSource === 'function'
      ? parseAllowedOrigins(allowedOriginSource())
      : allowed;

  /**
   * @param {ConfinedRequest} request
   * @returns {Promise<ConfinedResponse>}
   */
  const request = async ({
    url,
    method: rawMethod,
    headers,
    body,
    cancellation,
  }) => {
    assertNotRevoked();
    rateLimiter.take();
    const method = normalizeMethod(rawMethod, { allowedMethods });
    assertHeadersSafe(headers);
    checkOriginAllowed(url, getAllowedOrigins());

    const { signal, dispose } = makeRequestSignal({ timeoutMs, cancellation });
    const controller = signalToController.get(signal);
    if (controller) {
      controllers.add(controller);
    }
    await null;
    try {
      const response = await Promise.resolve(
        fetch(url, {
          redirect: 'manual',
          method,
          ...(headers === undefined ? {} : { headers }),
          ...(body === undefined ? {} : { body }),
          signal,
        }),
      );
      assertNotRevoked();
      if (resolveRedirect(response, getAllowedOrigins()) === 'reject') {
        throw makeNamedError(
          'OriginNotAllowedError',
          `Redirect target is not in the allowed-origin list`,
        );
      }
      const limited = limitResponseBytes(response.body, {
        maxBytes: maxResponseBytes,
        signal,
      });
      const bytes = await limited.stream;
      assertNotRevoked();
      return freeze({
        response,
        bytes,
        truncated: limited.truncated(),
        maxResponseBytes,
      });
    } finally {
      if (controller) {
        controllers.delete(controller);
      }
      dispose();
    }
  };

  return freeze({
    request,
    allowedOrigins: () => freeze([...getAllowedOrigins()]),
    /**
     * @param {string[]} origins
     */
    setAllowedOrigins: origins => {
      assertNotRevoked();
      assertOwnsAllowedOrigins();
      allowed = parseAllowedOrigins(origins);
    },
    /**
     * @param {string} origin
     */
    addAllowedOrigin: origin => {
      assertNotRevoked();
      assertOwnsAllowedOrigins();
      allowed = freeze(new Set([...allowed, ...parseAllowedOrigins([origin])]));
    },
    /**
     * @param {string} origin
     */
    removeAllowedOrigin: origin => {
      assertNotRevoked();
      assertOwnsAllowedOrigins();
      const [normalized] = parseAllowedOrigins([origin]);
      allowed = freeze(
        new Set([...allowed].filter(item => item !== normalized)),
      );
    },
    /**
     * @param {number} n
     */
    setMaxRequestsPerMinute: n => {
      assertNotRevoked();
      requestLimit = validatePositiveInteger(n, 'maxRequestsPerMinute');
      rateLimiter = makeRateLimiter({ maxPerMinute: n, now });
    },
    /**
     * @param {number} n
     */
    setMaxResponseBytes: n => {
      assertNotRevoked();
      maxResponseBytes = validatePositiveInteger(n, 'maxResponseBytes');
    },
    /**
     * @param {number} n
     */
    setTimeoutMs: n => {
      assertNotRevoked();
      timeoutMs = validatePositiveInteger(n, 'timeoutMs');
    },
    revoke: () => {
      revoked = true;
      for (const controller of controllers) {
        controller.abort();
      }
      controllers.clear();
    },
    isRevoked: () => revoked,
    inspect: () =>
      freeze({
        allowedOrigins: freeze([...getAllowedOrigins()]),
        maxRequestsPerMinute: requestLimit,
        maxResponseBytes,
        timeoutMs,
        revoked,
      }),
  });
};
freeze(makeHttpConfinement);
