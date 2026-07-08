// @ts-check
/* global clearTimeout, globalThis, setTimeout */

/**
 * HttpClient capability with structural origin confinement.
 *
 * The host owns the HttpClientControl facet and hands only the HttpClient
 * facet to a guest. Every request is parsed with the platform URL parser,
 * matched by exact origin, rate-limited, fetched with redirect following
 * disabled, and buffered only up to the configured response byte cap.
 *
 * The trust-on-first-bind adapter is opt-in. In strict mode, unknown origins
 * fail immediately. In TOFU modes, the adapter can pin a first-seen origin as
 * allow or deny, expose the binding table to the controller, and coalesce
 * concurrent first requests for the same origin into one policy decision.
 */

import harden from '@endo/harden';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeError, q, X } from '@endo/errors';
import {
  makeHttpConfinement,
  normalizeMethod,
  parseAllowedOrigins,
} from '@endo/http-confine';

/**
 * @import {
 *   AuditEntry,
 *   Binding,
 *   BindingState,
 *   FetchLike,
 *   FetchLikeResponse,
 *   FetchOptions,
 *   HttpClient,
 *   HttpClientControl,
 *   HttpResponse,
 *   NormalizedDecision,
 *   PolicyAuthority,
 *   PolicyMode,
 * } from './types.js'
 */

const DEFAULT_MAX_REQUESTS_PER_MINUTE = 60;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLICY_PROMPT_TIMEOUT_MS = 30_000;
const DEFAULT_AUDIT_LIMIT = 1024;
const DEFAULT_BINDING_LIMIT = 1024;

const FetchOptionsShape = M.splitRecord(
  {},
  {
    method: M.string(),
    headers: M.recordOf(M.string(), M.string()),
    body: M.any(),
  },
);

const HTTP_METHODS = harden([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'DELETE',
  'OPTIONS',
  'PATCH',
]);

const ListAuditOptionsShape = M.splitRecord(
  {},
  {
    since: M.number(),
    limit: M.number(),
  },
);

const BindingShape = M.splitRecord(
  {
    target: M.string(),
    state: M.string(),
    decidedAt: M.number(),
    decidedBy: M.string(),
    decisionMode: M.string(),
  },
  { note: M.string() },
);

const PolicyShape = M.splitRecord(
  {
    allowedOrigins: M.arrayOf(M.string()),
    maxRequestsPerMinute: M.number(),
    maxResponseBytes: M.number(),
    policyMode: M.string(),
    revoked: M.boolean(),
  },
  {},
);

const HttpResponseInterface = M.interface('HttpResponse', {
  status: M.call().returns(M.number()),
  statusText: M.call().returns(M.string()),
  ok: M.call().returns(M.boolean()),
  headers: M.call().returns(M.recordOf(M.string(), M.string())),
  url: M.call().returns(M.string()),
  truncated: M.call().returns(M.boolean()),
  maxResponseBytes: M.call().returns(M.number()),
  text: M.callWhen().returns(M.string()),
  json: M.callWhen().returns(M.any()),
  help: M.call().returns(M.string()),
});

const HttpClientInterface = M.interface('HttpClient', {
  fetch: M.callWhen(M.string())
    .optional(FetchOptionsShape)
    .returns(M.remotable()),
  allowedOrigins: M.call().returns(M.arrayOf(M.string())),
  help: M.call().returns(M.string()),
});

const HttpClientControlInterface = M.interface('HttpClientControl', {
  inspect: M.call().returns(PolicyShape),
  setAllowedOrigins: M.call(M.arrayOf(M.string())).returns(),
  addAllowedOrigin: M.call(M.string()).returns(),
  removeAllowedOrigin: M.call(M.string()).returns(),
  setMaxRequestsPerMinute: M.call(M.number()).returns(),
  setMaxResponseBytes: M.call(M.number()).returns(),
  revoke: M.call().returns(),
  isRevoked: M.call().returns(M.boolean()),
  listBindings: M.call().returns(M.arrayOf(BindingShape)),
  revokeBinding: M.call(M.string()).returns(),
  unpin: M.call(M.string()).returns(),
  setPolicyMode: M.call(M.string()).returns(),
  listAuditEntries: M.call()
    .optional(ListAuditOptionsShape)
    .returns(M.arrayOf(M.any())),
  help: M.call().returns(M.string()),
});

const httpClientHelp = `\
HttpClient - A confined fetch capability.

fetch(url, options) requests a URL only if its parsed origin is allowed by the
host policy. Redirect following is disabled, request rate is limited, and the
response body is truncated to the configured byte cap.`;

const httpResponseHelp = `\
HttpResponse - A bounded HTTP response.

Use status(), headers(), text(), json(), and truncated() to inspect the response.
The body is already capped by the HttpClient's maxResponseBytes setting.`;

const httpClientControlHelp = `\
HttpClientControl - The host-side companion to an HttpClient.

Lets the host change allowed origins, adjust request and response limits,
inspect or revoke trust-on-first-bind policy bindings, and revoke the client.`;

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
 * @param {string} urlString
 * @returns {URL}
 */
const parseHttpUrl = urlString => {
  if (typeof urlString !== 'string') {
    throw makeError(X`URL must be a string, got ${q(urlString)}`);
  }
  parseAllowedOrigins([urlString]);
  return new URL(urlString);
};

/**
 * @param {string} origin
 * @returns {string}
 */
const validateOrigin = origin => {
  if (typeof origin !== 'string') {
    throw makeError(X`Allowed origin must be a string, got ${q(origin)}`);
  }
  const [parsed] = parseAllowedOrigins([origin]);
  if (parsed !== origin) {
    throw makeError(
      X`Allowed origin ${q(origin)} must be exactly the origin (no path, query, or fragment); expected ${q(parsed)}`,
    );
  }
  return origin;
};

/**
 * @param {ReadonlyArray<string>} origins
 * @returns {ReadonlyArray<string>}
 */
const validateOrigins = origins => {
  if (!Array.isArray(origins)) {
    throw makeError(X`Allowed origins must be an array, got ${q(origins)}`);
  }
  return harden([...new Set(origins.map(validateOrigin))]);
};

/**
 * @param {string} urlString
 * @returns {string}
 */
const originOf = urlString => parseHttpUrl(urlString).origin;

/**
 * @param {unknown} mode
 * @returns {PolicyMode}
 */
const validatePolicyMode = mode => {
  if (
    mode !== 'strict' &&
    mode !== 'tofu-auto' &&
    mode !== 'tofu-prompt' &&
    mode !== 'tofu-attenuator'
  ) {
    throw makeError(X`Unsupported policy mode ${q(mode)}`);
  }
  return mode;
};

/**
 * @param {unknown} decision
 * @returns {NormalizedDecision}
 */
const normalizeDecision = decision => {
  if (decision === 'allow' || decision === 'deny') {
    return harden({ decision });
  }
  if (
    decision &&
    typeof decision === 'object' &&
    (Object.hasOwn(decision, 'decision') || Object.hasOwn(decision, 'allow'))
  ) {
    const record =
      /** @type {{ decision?: unknown, allow?: unknown, decidedBy?: unknown, note?: unknown }} */ (
        decision
      );
    const value = Object.hasOwn(record, 'decision')
      ? record.decision
      : record.allow === true
        ? 'allow'
        : record.allow === false
          ? 'deny'
          : undefined;
    if (value !== 'allow' && value !== 'deny') {
      throw makeError(X`Policy decision must be "allow" or "deny"`);
    }
    return harden({
      decision: value,
      decidedBy:
        typeof record.decidedBy === 'string' ? record.decidedBy : undefined,
      note: typeof record.note === 'string' ? record.note : undefined,
    });
  }
  throw makeError(X`Policy decision must be "allow" or "deny"`);
};

/**
 * @param {object} args
 * @param {PolicyMode} [args.policyMode]
 * @param {PolicyAuthority} [args.policyAuthority]
 * @param {() => number} [args.now]
 * @param {number} [args.policyPromptTimeoutMs]
 * @param {number} [args.auditLimit]
 * @param {number} [args.bindingLimit]
 */
export const makeTrustOnFirstBindPolicyAdapter = ({
  policyMode = 'strict',
  policyAuthority,
  now = Date.now,
  policyPromptTimeoutMs = DEFAULT_POLICY_PROMPT_TIMEOUT_MS,
  auditLimit = DEFAULT_AUDIT_LIMIT,
  bindingLimit = DEFAULT_BINDING_LIMIT,
} = {}) => {
  /** @type {PolicyMode} */
  let mode = validatePolicyMode(policyMode);
  const promptTimeoutMs = validatePositiveInteger(
    policyPromptTimeoutMs,
    'policyPromptTimeoutMs',
  );
  const maxAuditEntries = validatePositiveInteger(auditLimit, 'auditLimit');
  const maxBindings = validatePositiveInteger(bindingLimit, 'bindingLimit');

  /** @type {Map<string, Binding>} */
  const bindings = new Map();
  /** @type {Map<string, Promise<Binding>>} */
  const pending = new Map();
  /** @type {AuditEntry[]} */
  const audit = [];

  /**
   * @param {AuditEntry} entry
   */
  const appendAudit = entry => {
    audit.push(harden(entry));
    if (audit.length > maxAuditEntries) {
      audit.splice(0, audit.length - maxAuditEntries);
    }
  };

  /**
   * @param {string} target
   * @param {'Unknown' | 'Pending' | BindingState} fromState
   * @param {Binding} binding
   * @param {{ method?: string, userAgentNote?: string }} [context]
   */
  const setBinding = (target, fromState, binding, context = {}) => {
    if (!bindings.has(target) && bindings.size >= maxBindings) {
      throw makeError(
        X`Policy binding limit exceeded: ${q(maxBindings)} bindings`,
      );
    }
    bindings.set(target, harden(binding));
    appendAudit(
      harden({
        at: binding.decidedAt,
        target,
        fromState,
        toState: binding.state,
        decisionMode: binding.decisionMode,
        decidedBy: binding.decidedBy,
        context: harden({ ...context }),
      }),
    );
  };

  /**
   * @param {string} target
   * @param {{ method?: string, userAgentNote?: string }} context
   * @returns {Promise<Binding>}
   */
  const decide = async (target, context) => {
    await null;
    if (mode === 'strict') {
      throw makeError(X`Origin ${q(target)} is not in the allowed-origin list`);
    }

    /** @type {NormalizedDecision} */
    let normalized;
    if (mode === 'tofu-auto') {
      normalized = harden({
        decision: 'allow',
        decidedBy: 'tofu-auto',
      });
    } else {
      if (!policyAuthority || typeof policyAuthority.decide !== 'function') {
        throw makeError(
          X`Policy mode ${q(mode)} requires a policy authority with decide()`,
        );
      }
      let timeoutId;
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(makeError(X`Policy decision timed out for ${q(target)}`)),
          promptTimeoutMs,
        );
      });
      try {
        const rawDecision = await Promise.race([
          policyAuthority.decide({
            kind: 'http-origin',
            target,
            context: harden({ ...context }),
          }),
          timeout,
        ]);
        normalized = normalizeDecision(rawDecision);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    /** @type {BindingState} */
    const state =
      normalized.decision === 'allow' ? 'Pinned-Allow' : 'Pinned-Deny';
    /** @type {Binding} */
    const binding = harden({
      target,
      state,
      decidedAt: now(),
      decidedBy:
        normalized.decidedBy ||
        (mode === 'tofu-prompt' ? 'tofu-prompt' : 'tofu-attenuator'),
      decisionMode: mode,
      ...(normalized.note === undefined ? {} : { note: normalized.note }),
    });
    const current = bindings.get(target);
    if (current && current.state === 'Revoked') {
      return current;
    }
    setBinding(target, 'Pending', binding, context);
    return binding;
  };

  /**
   * @param {string} target
   * @param {{ method?: string, userAgentNote?: string }} [context]
   */
  const assertAllowed = async (target, context = {}) => {
    await null;
    const binding = bindings.get(target);
    if (binding) {
      if (binding.state === 'Pinned-Allow') {
        return;
      }
      throw makeError(X`Policy refuses origin ${q(target)}`);
    }
    const existing = pending.get(target);
    if (existing) {
      const resolved = await existing;
      if (resolved.state !== 'Pinned-Allow') {
        throw makeError(X`Policy refuses origin ${q(target)}`);
      }
      return;
    }
    if (bindings.size + pending.size >= maxBindings) {
      throw makeError(
        X`Policy binding limit exceeded: ${q(maxBindings)} bindings`,
      );
    }
    appendAudit(
      harden({
        at: now(),
        target,
        fromState: 'Unknown',
        toState: 'Pending',
        decisionMode: mode,
        decidedBy: 'pending',
        context: harden({ ...context }),
      }),
    );
    const decisionP = decide(target, context);
    pending.set(target, decisionP);
    let resolved;
    try {
      resolved = await decisionP;
    } catch (err) {
      appendAudit(
        harden({
          at: now(),
          target,
          fromState: 'Pending',
          toState: 'Unknown',
          decisionMode: mode,
          decidedBy: 'timeout-or-error',
          context: harden({ ...context }),
        }),
      );
      throw err;
    } finally {
      pending.delete(target);
    }
    if (resolved.state !== 'Pinned-Allow') {
      throw makeError(X`Policy refuses origin ${q(target)}`);
    }
  };

  /**
   * @param {string} target
   * @param {string} decidedBy
   */
  const pinAllowed = (target, decidedBy = 'controller') => {
    const previous = bindings.get(target);
    /** @type {Binding} */
    const binding = harden({
      target,
      state: 'Pinned-Allow',
      decidedAt: now(),
      decidedBy,
      decisionMode: mode,
    });
    setBinding(target, previous ? previous.state : 'Unknown', binding);
  };

  const adapter = harden({
    assertAllowed,
    pinAllowed,
    listBindings: () => harden([...bindings.values()]),
    /**
     * @param {string} target
     */
    revokeBinding: target => {
      const origin = validateOrigin(target);
      const previous = bindings.get(origin);
      /** @type {Binding} */
      const binding = harden({
        target: origin,
        state: 'Revoked',
        decidedAt: now(),
        decidedBy: 'controller',
        decisionMode: mode,
      });
      setBinding(origin, previous ? previous.state : 'Unknown', binding);
    },
    /**
     * @param {string} target
     */
    unpin: target => {
      const origin = validateOrigin(target);
      const previous = bindings.get(origin);
      if (!previous) {
        return;
      }
      bindings.delete(origin);
      appendAudit(
        harden({
          at: now(),
          target: origin,
          fromState: previous.state,
          toState: 'Unknown',
          decisionMode: mode,
          decidedBy: 'controller',
        }),
      );
    },
    /**
     * @param {PolicyMode} nextMode
     */
    setPolicyMode: nextMode => {
      mode = validatePolicyMode(nextMode);
    },
    getPolicyMode: () => mode,
    /**
     * @param {{ since?: number, limit?: number }} [options]
     */
    listAuditEntries: (options = {}) => {
      const since = options.since === undefined ? 0 : options.since;
      const limit =
        options.limit === undefined
          ? maxAuditEntries
          : validatePositiveInteger(options.limit, 'limit');
      return harden(audit.filter(entry => entry.at >= since).slice(-limit));
    },
  });
  return adapter;
};
harden(makeTrustOnFirstBindPolicyAdapter);

/**
 * @param {Headers | Record<string, string> | Iterable<[string, string]>} headers
 * @returns {Record<string, string>}
 */
const headersToRecord = headers => {
  /** @type {Record<string, string>} */
  const record = {};
  /**
   * @param {string} key
   * @param {string} value
   */
  const setHeader = (key, value) => {
    Object.defineProperty(record, key.toLowerCase(), {
      value: String(value),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  };
  if (
    headers &&
    typeof (
      /** @type {Iterable<[string, string]>} */ (headers)[Symbol.iterator]
    ) === 'function'
  ) {
    for (const [key, value] of /** @type {Iterable<[string, string]>} */ (
      headers
    )) {
      setHeader(key, value);
    }
    return harden(record);
  }
  if (
    headers &&
    typeof (/** @type {Headers} */ (headers).forEach) === 'function'
  ) {
    /** @type {Headers} */ (headers).forEach((value, key) => {
      setHeader(key, value);
    });
    return harden(record);
  }
  for (const [key, value] of Object.entries(headers || {})) {
    setHeader(key, value);
  }
  return harden(record);
};

/**
 * @param {object} args
 * @param {FetchLikeResponse} args.response
 * @param {number} args.maxResponseBytes
 * @param {Uint8Array} args.bytes
 * @param {boolean} args.truncated
 */
const makeHttpResponse = ({ response, maxResponseBytes, bytes, truncated }) => {
  const headers = headersToRecord(response.headers || {});
  const text = new TextDecoder().decode(bytes);
  const responseUrl = String(response.url || '');
  const status = Number(response.status || 0);
  const statusText = String(response.statusText || '');
  const ok = Boolean(response.ok);

  return makeExo('HttpResponse', HttpResponseInterface, {
    status: () => status,
    statusText: () => statusText,
    ok: () => ok,
    headers: () => headers,
    url: () => responseUrl,
    truncated: () => truncated,
    maxResponseBytes: () => maxResponseBytes,
    text: async () => text,
    json: async () => {
      try {
        return harden(JSON.parse(text));
      } catch (err) {
        if (err instanceof SyntaxError) {
          throw SyntaxError(
            `Cannot parse JSON from ${responseUrl}, ${err.message}`,
          );
        }
        throw err;
      }
    },
    help: () => httpResponseHelp,
  });
};

/**
 * Create a paired HttpClient / HttpClientControl capability.
 *
 * @param {object} args
 * @param {FetchLike} [args.fetch]
 * @param {ReadonlyArray<string>} [args.allowedOrigins]
 * @param {number} [args.maxRequestsPerMinute]
 * @param {number} [args.maxResponseBytes]
 * @param {PolicyMode} [args.policyMode]
 * @param {PolicyAuthority} [args.policyAuthority]
 * @param {number} [args.policyPromptTimeoutMs]
 * @param {number} [args.auditLimit]
 * @param {number} [args.bindingLimit]
 * @param {() => number} [args.now]
 * @returns {{ client: HttpClient, control: HttpClientControl }}
 *
 * Rate accounting is delegated to the underlying HTTP confinement and occurs
 * after TOFU policy decisions. Denied origins and still-prompting requests do
 * not consume the request budget; prompt floods are bounded by prompt
 * coalescing and the binding limit.
 */
export const makeHttpClientAndControl = ({
  fetch = /** @type {FetchLike} */ (globalThis.fetch),
  allowedOrigins = [],
  maxRequestsPerMinute = DEFAULT_MAX_REQUESTS_PER_MINUTE,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  policyMode = 'strict',
  policyAuthority,
  policyPromptTimeoutMs = DEFAULT_POLICY_PROMPT_TIMEOUT_MS,
  auditLimit = DEFAULT_AUDIT_LIMIT,
  bindingLimit = DEFAULT_BINDING_LIMIT,
  now = Date.now,
} = {}) => {
  if (typeof fetch !== 'function') {
    throw makeError(X`fetch is required`);
  }

  /** @type {ReadonlyArray<string>} */
  let allowed = validateOrigins(allowedOrigins);
  const requestLimit = validatePositiveInteger(
    maxRequestsPerMinute,
    'maxRequestsPerMinute',
  );
  const responseByteLimit = validatePositiveInteger(
    maxResponseBytes,
    'maxResponseBytes',
  );
  const policy = makeTrustOnFirstBindPolicyAdapter({
    policyMode,
    policyAuthority,
    now,
    policyPromptTimeoutMs,
    auditLimit,
    bindingLimit,
  });

  for (const origin of allowed) {
    policy.pinAllowed(origin, 'constructor');
  }

  const effectiveAllowedOrigins = () =>
    harden([
      ...new Set([
        ...allowed,
        ...policy
          .listBindings()
          .filter(binding => binding.state === 'Pinned-Allow')
          .map(binding => binding.target),
      ]),
    ]);

  const confinement = makeHttpConfinement(
    {
      allowedOrigins: effectiveAllowedOrigins,
      maxRequestsPerMinute: requestLimit,
      maxResponseBytes: responseByteLimit,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      allowedMethods: new Set(HTTP_METHODS),
    },
    { fetch, now },
  );

  const assertNotRevoked = () => {
    if (confinement.isRevoked()) {
      throw makeError(X`HttpClient has been revoked`);
    }
  };

  /**
   * @param {string} url
   * @param {FetchOptions} [options]
   */
  const fetchBounded = async (url, options = {}) => {
    assertNotRevoked();
    await null;
    const origin = originOf(url);
    // The method reaches TOFU policy context, so normalize it before asking
    // an authority that may be a human prompt or an attenuator capability.
    const method = normalizeMethod(options.method, {
      allowedMethods: new Set(HTTP_METHODS),
    });
    await policy.assertAllowed(origin, { method });
    const confined = await confinement.request({
      url,
      method,
      ...(options.headers === undefined ? {} : { headers: options.headers }),
      ...(options.body === undefined ? {} : { body: options.body }),
    });
    return makeHttpResponse({
      response: confined.response,
      maxResponseBytes: confined.maxResponseBytes,
      bytes: confined.bytes,
      truncated: confined.truncated,
    });
  };

  const client = makeExo('HttpClient', HttpClientInterface, {
    fetch: fetchBounded,
    allowedOrigins: effectiveAllowedOrigins,
    help: () => httpClientHelp,
  });

  const control = makeExo('HttpClientControl', HttpClientControlInterface, {
    inspect: () => {
      const confinementPolicy = confinement.inspect();
      return harden({
        // Report the EFFECTIVE reachable set (static allowlist plus TOFU
        // Pinned-Allow bindings), matching client.allowedOrigins(); the
        // control facet must not under-report what the client can reach. The
        // static-vs-pinned breakdown remains available via listBindings().
        allowedOrigins: effectiveAllowedOrigins(),
        maxRequestsPerMinute: confinementPolicy.maxRequestsPerMinute,
        maxResponseBytes: confinementPolicy.maxResponseBytes,
        policyMode: policy.getPolicyMode(),
        revoked: confinementPolicy.revoked,
      });
    },
    setAllowedOrigins: origins => {
      assertNotRevoked();
      const nextAllowed = validateOrigins(origins);
      for (const origin of allowed) {
        if (!nextAllowed.includes(origin)) {
          policy.unpin(origin);
        }
      }
      allowed = nextAllowed;
      for (const origin of allowed) {
        policy.pinAllowed(origin, 'controller');
      }
    },
    addAllowedOrigin: origin => {
      assertNotRevoked();
      const validated = validateOrigin(origin);
      if (!allowed.includes(validated)) {
        allowed = harden([...allowed, validated]);
      }
      policy.pinAllowed(validated, 'controller');
    },
    removeAllowedOrigin: origin => {
      assertNotRevoked();
      const validated = validateOrigin(origin);
      allowed = harden(allowed.filter(item => item !== validated));
      policy.revokeBinding(validated);
    },
    setMaxRequestsPerMinute: n => {
      assertNotRevoked();
      confinement.setMaxRequestsPerMinute(
        validatePositiveInteger(n, 'maxRequestsPerMinute'),
      );
    },
    setMaxResponseBytes: n => {
      assertNotRevoked();
      confinement.setMaxResponseBytes(
        validatePositiveInteger(n, 'maxResponseBytes'),
      );
    },
    revoke: () => {
      confinement.revoke();
    },
    isRevoked: () => confinement.isRevoked(),
    listBindings: () => policy.listBindings(),
    revokeBinding: origin => {
      assertNotRevoked();
      policy.revokeBinding(origin);
      allowed = harden(allowed.filter(item => item !== validateOrigin(origin)));
    },
    unpin: origin => {
      assertNotRevoked();
      policy.unpin(origin);
      allowed = harden(allowed.filter(item => item !== validateOrigin(origin)));
    },
    setPolicyMode: mode => {
      assertNotRevoked();
      policy.setPolicyMode(validatePolicyMode(mode));
    },
    listAuditEntries: options => policy.listAuditEntries(options),
    help: () => httpClientControlHelp,
  });

  return harden({ client, control });
};
harden(makeHttpClientAndControl);

export const makeHttpClientKit = makeHttpClientAndControl;
harden(makeHttpClientKit);
