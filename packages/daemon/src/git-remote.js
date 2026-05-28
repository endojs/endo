// @ts-check
/// <reference types="ses"/>

import { URL } from 'node:url';

import { q } from '@endo/errors';
import { makeExo } from '@endo/exo';
import { E } from '@endo/eventual-send';

import {
  GitRemoteInterface,
  GitRemoteControllerInterface,
} from './interfaces.js';
import { getGitBackend, isGitReadOnly } from './git.js';
import { assertGitCredentialForUrl } from './git-credential.js';

/**
 * @typedef {'fetch' | 'push'} GitDirection
 */

/**
 * @typedef {object} GitRemotePolicy
 * @property {string} url
 *   Host-controlled remote endpoint URL.  Guests cannot mutate this
 *   field at call time; only `GitRemoteController.revoke()` or future
 *   controller methods adjust the binding.
 * @property {GitDirection[]} allowedDirections
 * @property {string[]} fetchRefspecs
 * @property {string[]} pushRefspecs
 * @property {string[]} [allowedBranches]
 * @property {boolean} [allowForcePush]
 * @property {boolean} [allowTags]
 * @property {boolean} [allowDelete]
 * @property {boolean} [allowLocalFileTransport]
 */

/**
 * Audit-log entry shape.  Every entry carries `sequence` and `type`;
 * the additional fields are type-discriminated.  The union form below
 * narrows on `type` so consumers of `audit()` can branch without
 * casting.
 *
 * @typedef {object} GitRemoteAuditEventBase
 * @property {number} sequence
 */

/**
 * @typedef {GitRemoteAuditEventBase & {
 *   type: 'create' | 'revoke' | 'policy',
 *   policy: ReturnType<() => GitRemotePolicy & { name: string }>,
 *   revoked: boolean,
 *   method?: string,
 * }} GitRemotePolicyAuditEvent
 */

/**
 * @typedef {GitRemoteAuditEventBase & {
 *   type: 'fetch' | 'pull' | 'push',
 *   outcome: 'ok',
 *   updatedRefs?: unknown,
 *   integration?: 'up-to-date' | 'fast-forward' | 'merge' | 'rebase',
 *   head?: unknown,
 * }} GitRemoteOperationSuccessAuditEvent
 */

/**
 * `appliedLocally` records that the pull's local integration step
 * mutated HEAD before a later policy / credential / revoke event
 * forced the operation to throw.  Callers learn the operation failed;
 * the audit log names which side effect already landed on the
 * worktree.
 *
 * @typedef {GitRemoteAuditEventBase & {
 *   type: 'fetch' | 'pull' | 'push',
 *   outcome: 'error',
 *   message: string,
 *   appliedLocally?: boolean,
 * }} GitRemoteOperationFailureAuditEvent
 */

/**
 * @typedef {GitRemotePolicyAuditEvent
 *   | GitRemoteOperationSuccessAuditEvent
 *   | GitRemoteOperationFailureAuditEvent} GitRemoteAuditEvent
 */

const DEFAULT_POLICY = harden(
  /** @type {Required<Omit<GitRemotePolicy, 'allowedBranches' | 'url'>>} */ ({
    allowedDirections: harden(['fetch']),
    fetchRefspecs: harden([]),
    pushRefspecs: harden([]),
    allowForcePush: false,
    allowTags: false,
    allowDelete: false,
    allowLocalFileTransport: false,
  }),
);

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string}
 */
const requirePolicyString = (value, fieldName) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  if (value.includes('\0')) {
    throw new Error(`${fieldName} must not contain NUL bytes`);
  }
  return value;
};
harden(requirePolicyString);

/**
 * Coerce-free read of a policy `allow*` flag.  An omitted flag falls
 * back to its hardened default; a present flag must be a real boolean.
 * Any non-boolean (`'false'`, `0`, `1`, `{}`) is rejected rather than
 * truthiness-coerced, so a policy can never silently enable an
 * authority it spelled with the wrong type.  Fail closed.
 *
 * @param {unknown} value
 * @param {boolean} fallback
 * @param {string} fieldName
 * @returns {boolean}
 */
const requirePolicyBoolean = (value, fallback, fieldName) => {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean: ${q(value)}`);
  }
  return value;
};
harden(requirePolicyBoolean);

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string[]}
 */
const requirePolicyStringArray = (value, fieldName) => {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of strings`);
  }
  return value.map((item, index) =>
    requirePolicyString(item, `${fieldName}[${index}]`),
  );
};
harden(requirePolicyStringArray);

/**
 * @param {unknown} value
 * @param {boolean} [allowLocalFileTransport]
 * @returns {string}
 */
const normalizeRemoteUrl = (value, allowLocalFileTransport = false) => {
  const urlText = requirePolicyString(value, 'GitRemote policy.url');
  let parsed;
  try {
    parsed = new URL(urlText);
  } catch {
    throw new Error(`GitRemote policy.url is not a valid URL: ${q(urlText)}`);
  }
  if (
    parsed.protocol !== 'https:' &&
    !(allowLocalFileTransport && parsed.protocol === 'file:')
  ) {
    throw new Error(
      `GitRemote policy.url must use https: for the MVP transport: ${q(urlText)}`,
    );
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error(
      `GitRemote policy.url must not include embedded credentials: ${q(urlText)}`,
    );
  }
  return urlText;
};
harden(normalizeRemoteUrl);

/**
 * @param {unknown} value
 * @returns {GitDirection[]}
 */
const normalizeDirections = value => {
  const directions = requirePolicyStringArray(
    value || DEFAULT_POLICY.allowedDirections,
    'GitRemote policy.allowedDirections',
  );
  if (directions.length === 0) {
    throw new Error('GitRemote policy.allowedDirections must not be empty');
  }
  for (const direction of directions) {
    if (direction !== 'fetch' && direction !== 'push') {
      throw new Error(
        `GitRemote policy.allowedDirections contains invalid direction ${q(direction)}`,
      );
    }
  }
  return harden(/** @type {GitDirection[]} */ ([...new Set(directions)]));
};
harden(normalizeDirections);

/**
 * @param {string} ref
 * @param {string} fieldName
 */
const assertQualifiedRef = (ref, fieldName) => {
  if (!ref.startsWith('refs/')) {
    throw new Error(
      `${fieldName} must be fully qualified under refs/: ${q(ref)}`,
    );
  }
  if (
    ref.includes('..') ||
    ref.includes('\\') ||
    ref.includes('//') ||
    ref.endsWith('/') ||
    ref.includes('@{')
  ) {
    throw new Error(`${fieldName} contains an invalid git ref: ${q(ref)}`);
  }
};
harden(assertQualifiedRef);

/**
 * @param {string} ref
 */
const isTagRef = ref => ref.startsWith('refs/tags/');
harden(isTagRef);

/**
 * @param {string} ref
 */
const wildcardCount = ref => [...ref].filter(ch => ch === '*').length;
harden(wildcardCount);

/**
 * @param {string} src
 * @param {string} dst
 * @param {string} fieldName
 */
const assertWildcardShape = (src, dst, fieldName) => {
  const srcWildcards = wildcardCount(src);
  const dstWildcards = wildcardCount(dst);
  if (srcWildcards > 1 || dstWildcards > 1) {
    throw new Error(`${fieldName} may contain at most one wildcard per side`);
  }
  if (srcWildcards !== dstWildcards) {
    throw new Error(
      `${fieldName} wildcard source and destination must match: ${q(`${src}:${dst}`)}`,
    );
  }
  if (
    (srcWildcards === 1 && !src.endsWith('/*')) ||
    (dstWildcards === 1 && !dst.endsWith('/*'))
  ) {
    throw new Error(
      `${fieldName} wildcards must be rooted under a fixed parent: ${q(`${src}:${dst}`)}`,
    );
  }
};
harden(assertWildcardShape);

/**
 * @param {string} refspec
 * @param {string} fieldName
 * @returns {{ force: boolean, src: string, dst: string }}
 */
const parseRefspec = (refspec, fieldName) => {
  const raw = requirePolicyString(refspec, fieldName);
  const force = raw.startsWith('+');
  const body = force ? raw.slice(1) : raw;
  const colon = body.indexOf(':');
  if (colon < 0 || body.indexOf(':', colon + 1) >= 0) {
    throw new Error(
      `${fieldName} must be a single [ + ]<src>:<dst> refspec: ${q(raw)}`,
    );
  }
  const src = body.slice(0, colon);
  const dst = body.slice(colon + 1);
  if (dst === '') {
    throw new Error(`${fieldName} destination must not be empty: ${q(raw)}`);
  }
  return harden({ force, src, dst });
};
harden(parseRefspec);

/**
 * @param {string} refspec
 * @param {GitRemotePolicy} policy
 * @param {string} remoteName
 * @param {string} fieldName
 */
const validateFetchRefspec = (refspec, policy, remoteName, fieldName) => {
  const { src, dst } = parseRefspec(refspec, fieldName);
  assertQualifiedRef(dst, `${fieldName} destination`);
  if (!dst.startsWith(`refs/remotes/${remoteName}/`)) {
    throw new Error(
      `${fieldName} destination must stay under refs/remotes/${remoteName}/: ${q(dst)}`,
    );
  }
  if (src === '') {
    if (!policy.allowDelete) {
      throw new Error(`${fieldName} deletion requires allowDelete: true`);
    }
    if (dst.includes('*')) {
      throw new Error(`${fieldName} deletion refspecs must not use wildcards`);
    }
    return;
  }
  assertQualifiedRef(src, `${fieldName} source`);
  if ((isTagRef(src) || isTagRef(dst)) && !policy.allowTags) {
    throw new Error(`${fieldName} tag refs require allowTags: true`);
  }
  assertWildcardShape(src, dst, fieldName);
};
harden(validateFetchRefspec);

/**
 * @param {string} refspec
 * @param {GitRemotePolicy} policy
 * @param {string} fieldName
 */
const validatePushRefspec = (refspec, policy, fieldName) => {
  const { force, src, dst } = parseRefspec(refspec, fieldName);
  if (force && !policy.allowForcePush) {
    throw new Error(`${fieldName} force-push refspec requires allowForcePush`);
  }
  assertQualifiedRef(dst, `${fieldName} destination`);
  if (src === '') {
    if (!policy.allowDelete) {
      throw new Error(`${fieldName} deletion requires allowDelete: true`);
    }
    if (dst.includes('*')) {
      throw new Error(`${fieldName} deletion refspecs must not use wildcards`);
    }
    return;
  }
  assertQualifiedRef(src, `${fieldName} source`);
  if (!src.startsWith('refs/heads/') && !src.startsWith('refs/tags/')) {
    throw new Error(
      `${fieldName} source must be a local branch or tag ref: ${q(src)}`,
    );
  }
  if ((isTagRef(src) || isTagRef(dst)) && !policy.allowTags) {
    throw new Error(`${fieldName} tag refs require allowTags: true`);
  }
  assertWildcardShape(src, dst, fieldName);
};
harden(validatePushRefspec);

/**
 * @param {string} branch
 * @param {string} fieldName
 * @returns {string}
 */
const branchRefFromAllowedBranch = (branch, fieldName) => {
  const value = requirePolicyString(branch, fieldName);
  if (
    value.startsWith('+') ||
    value.includes(':') ||
    value.includes('\\') ||
    value.includes('..') ||
    value.includes('//') ||
    value.includes('@{') ||
    value.startsWith('/') ||
    value.endsWith('/')
  ) {
    throw new Error(`${fieldName} is not a valid branch selector: ${q(value)}`);
  }
  if (value.startsWith('refs/') && !value.startsWith('refs/heads/')) {
    throw new Error(`${fieldName} must be rooted under refs/heads/`);
  }
  if (value.includes('*') && !value.startsWith('refs/heads/')) {
    throw new Error(
      `${fieldName} wildcard branches must be rooted under refs/heads/`,
    );
  }
  const ref = value.startsWith('refs/heads/') ? value : `refs/heads/${value}`;
  assertQualifiedRef(ref, fieldName);
  if (wildcardCount(ref) > 1 || (ref.includes('*') && !ref.endsWith('/*'))) {
    throw new Error(
      `${fieldName} wildcard must be rooted under a fixed parent: ${q(value)}`,
    );
  }
  return ref;
};
harden(branchRefFromAllowedBranch);

/**
 * @param {string[]} branches
 * @returns {string[]}
 */
const derivePushRefspecsFromBranches = branches =>
  branches.map((branch, index) => {
    const ref = branchRefFromAllowedBranch(
      branch,
      `GitRemote policy.allowedBranches[${index}]`,
    );
    return `${ref}:${ref}`;
  });
harden(derivePushRefspecsFromBranches);

/**
 * @param {object} args
 * @param {string} args.name
 * @param {GitRemotePolicy} args.policy
 * @returns {GitRemotePolicy}
 */
const normalizePolicy = ({ name, policy }) => {
  const allowLocalFileTransport = requirePolicyBoolean(
    policy.allowLocalFileTransport,
    DEFAULT_POLICY.allowLocalFileTransport,
    'GitRemote policy.allowLocalFileTransport',
  );
  const url = normalizeRemoteUrl(policy && policy.url, allowLocalFileTransport);
  const allowedDirections = normalizeDirections(policy.allowedDirections);
  const fetchRefspecs = requirePolicyStringArray(
    policy.fetchRefspecs || DEFAULT_POLICY.fetchRefspecs,
    'GitRemote policy.fetchRefspecs',
  );
  const explicitPushRefspecs = requirePolicyStringArray(
    policy.pushRefspecs || DEFAULT_POLICY.pushRefspecs,
    'GitRemote policy.pushRefspecs',
  );
  const allowedBranches =
    policy.allowedBranches === undefined
      ? []
      : requirePolicyStringArray(
          policy.allowedBranches,
          'GitRemote policy.allowedBranches',
        );
  if (allowedBranches.length > 0 && explicitPushRefspecs.length > 0) {
    throw new Error(
      'GitRemote policy must choose allowedBranches or pushRefspecs, not both',
    );
  }
  const pushRefspecs =
    allowedBranches.length > 0
      ? derivePushRefspecsFromBranches(allowedBranches)
      : explicitPushRefspecs;
  const normalized = harden({
    url,
    allowedDirections,
    fetchRefspecs: harden(fetchRefspecs),
    pushRefspecs: harden(pushRefspecs),
    allowForcePush: requirePolicyBoolean(
      policy.allowForcePush,
      DEFAULT_POLICY.allowForcePush,
      'GitRemote policy.allowForcePush',
    ),
    allowTags: requirePolicyBoolean(
      policy.allowTags,
      DEFAULT_POLICY.allowTags,
      'GitRemote policy.allowTags',
    ),
    allowDelete: requirePolicyBoolean(
      policy.allowDelete,
      DEFAULT_POLICY.allowDelete,
      'GitRemote policy.allowDelete',
    ),
    allowLocalFileTransport,
  });
  for (const [index, refspec] of normalized.fetchRefspecs.entries()) {
    validateFetchRefspec(
      refspec,
      normalized,
      name,
      `GitRemote policy.fetchRefspecs[${index}]`,
    );
  }
  for (const [index, refspec] of normalized.pushRefspecs.entries()) {
    validatePushRefspec(
      refspec,
      normalized,
      `GitRemote policy.pushRefspecs[${index}]`,
    );
  }
  if (
    normalized.allowedDirections.includes('push') &&
    normalized.pushRefspecs.length === 0
  ) {
    throw new Error(
      'GitRemote policy allows push but has no pushRefspecs or allowedBranches',
    );
  }
  return normalized;
};
harden(normalizePolicy);

/**
 * Host-private map from a remote exo to its controller exo.  The
 * controller is a companion accessed through a daemon-side host method
 * (`getGitRemoteController`); its durable state lives on the remote
 * formula rather than a separate top-level formula.
 *
 * @type {WeakMap<object, object>}
 */
const remoteControllers = new WeakMap();
const AUDIT_LIMIT = 128;

/**
 * Host-private accessor: returns the controller exo paired with a
 * daemon-minted remote exo, or undefined for spoofs / fakes.
 *
 * @param {unknown} remote
 * @returns {object | undefined}
 */
export const getGitRemoteController = remote =>
  remoteControllers.get(/** @type {object} */ (remote));
harden(getGitRemoteController);

/**
 * Mint a paired (guest-held, host-held) facet for one remote endpoint.
 *
 * This facet is the policy gate for remote use.  It validates endpoint,
 * direction, and refspec policy before delegating to the local Git
 * backend's bounded native data plane.
 *
 * @param {object} args
 * @param {object} args.git  The local `Git` capability this remote is
 *   bound to.  Guest operations on the remote always compose with this
 *   Git; revoking the local Git collects the remote too.
 * @param {string} args.name  Remote name (typically 'origin').
 * @param {GitRemotePolicy} args.policy
 * @param {boolean} [args.revoked]
 * @param {object} [args.credential]
 * @param {(state: { policy: GitRemotePolicy, revoked: boolean }) => Promise<void> | void} [args.onStateChange]
 * @returns {{ remote: object, controller: object }}
 */
export const makeGitRemote = ({
  git,
  name,
  policy,
  revoked: initialRevoked = false,
  credential,
  onStateChange,
}) => {
  if (isGitReadOnly(git)) {
    throw new Error('GitRemote cannot be constructed from a read-only Git');
  }
  const backend = getGitBackend(git);
  if (backend === undefined) {
    throw new Error('GitRemote requires a daemon-minted Git cap');
  }
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('GitRemote name must be a non-empty string');
  }
  if (
    !policy ||
    typeof policy !== 'object' ||
    typeof policy.url !== 'string' ||
    policy.url.length === 0
  ) {
    throw new Error('GitRemote policy must include a non-empty url');
  }

  // The policy record is mutable through the controller; we keep a
  // mutable struct here and freeze each read view we hand out.
  /** @type {GitRemotePolicy} */
  let currentPolicy = normalizePolicy({ name, policy });
  const url = new URL(currentPolicy.url);
  const requiresCredential = url.protocol === 'https:';
  const credentialRecord =
    credential === undefined
      ? undefined
      : assertGitCredentialForUrl(credential, url.origin, {
          allowRevoked: true,
        });
  if (requiresCredential && credentialRecord === undefined) {
    throw new Error('GitRemote HTTPS remotes require a Git credential cap');
  }

  let revoked = initialRevoked;
  let operationEpoch = 0;
  /** @type {'policy' | 'revoke' | undefined} */
  let operationInvalidation;
  /** @type {Set<AbortController>} */
  const activeOperationControllers = new Set();

  const abortActiveOperations = () => {
    for (const abortController of [...activeOperationControllers]) {
      abortController.abort();
    }
  };

  const invalidateOperations = reason => {
    operationEpoch += 1;
    operationInvalidation = reason;
    abortActiveOperations();
  };

  const beginOperation = () => {
    const abortController = new AbortController();
    activeOperationControllers.add(abortController);
    return {
      signal: abortController.signal,
      finish: () => {
        activeOperationControllers.delete(abortController);
      },
    };
  };

  if (credentialRecord !== undefined) {
    credentialRecord.watchChange(abortActiveOperations);
  }

  const persistState = async (nextPolicy, nextRevoked) => {
    await null;
    if (onStateChange !== undefined) {
      await onStateChange(harden({ policy: nextPolicy, revoked: nextRevoked }));
    }
  };

  const ensureLive = () => {
    if (revoked) {
      throw new Error(`GitRemote ${q(name)} has been revoked`);
    }
  };

  const ensureDirection = direction => {
    ensureLive();
    if (!currentPolicy.allowedDirections.includes(direction)) {
      throw new Error(
        `GitRemote ${q(name)} does not permit ${q(direction)} (allowed: ${currentPolicy.allowedDirections.join(', ')})`,
      );
    }
  };

  const ensureCredentialUsable = () => {
    if (requiresCredential) {
      const record = assertGitCredentialForUrl(
        /** @type {object} */ (credential),
        url.origin,
      );
      return harden({ kind: record.kind, material: record.getMaterial() });
    }
    return undefined;
  };

  const captureOperationFence = () =>
    harden({
      epoch: operationEpoch,
      credentialVersion:
        requiresCredential && credentialRecord !== undefined
          ? credentialRecord.getVersion()
          : undefined,
    });

  const assertOperationFence = (operation, fence) => {
    if (operationEpoch !== fence.epoch) {
      if (revoked || operationInvalidation === 'revoke') {
        throw new Error(`GitRemote ${q(name)} was revoked during ${operation}`);
      }
      throw new Error(
        `GitRemote ${q(name)} policy changed during ${operation}`,
      );
    }
    if (requiresCredential && credentialRecord !== undefined) {
      const currentCredentialRecord = assertGitCredentialForUrl(
        /** @type {object} */ (credential),
        url.origin,
        { allowRevoked: true },
      );
      if (currentCredentialRecord.getVersion() !== fence.credentialVersion) {
        if (currentCredentialRecord.isRevoked()) {
          throw new Error(
            `Git credential for ${q(currentCredentialRecord.audience)} was revoked during ${operation}`,
          );
        }
        throw new Error(
          `Git credential for ${q(currentCredentialRecord.audience)} changed during ${operation}`,
        );
      }
    }
  };

  const operationError = (operation, fence, err) => {
    try {
      assertOperationFence(operation, fence);
    } catch (fenceErr) {
      return fenceErr;
    }
    return err;
  };

  const snapshotPolicy = () =>
    harden({
      name,
      url: currentPolicy.url,
      allowedDirections: harden([...currentPolicy.allowedDirections]),
      fetchRefspecs: harden([...currentPolicy.fetchRefspecs]),
      pushRefspecs: harden([...currentPolicy.pushRefspecs]),
      allowForcePush: currentPolicy.allowForcePush,
      allowTags: currentPolicy.allowTags,
      allowDelete: currentPolicy.allowDelete,
      allowLocalFileTransport: currentPolicy.allowLocalFileTransport,
    });

  /** @type {GitRemoteAuditEvent[]} */
  const auditLog = [];
  let auditSequence = 0;
  const recordAudit = event => {
    auditSequence += 1;
    auditLog.push(
      harden({
        sequence: auditSequence,
        ...event,
      }),
    );
    // Preserve the `'create'` entry across rolling shifts past
    // `AUDIT_LIMIT` so the audit log always names the policy the
    // remote was constructed against.  The shift removes the second
    // entry (the oldest non-`'create'` event) when the head is the
    // sentinel.
    if (auditLog.length > AUDIT_LIMIT) {
      const headIsCreate =
        /** @type {{ type?: string }} */ (auditLog[0])?.type === 'create';
      if (headIsCreate && auditLog.length > 1) {
        auditLog.splice(1, 1);
      } else {
        auditLog.shift();
      }
    }
  };

  recordAudit({ type: 'create', policy: snapshotPolicy(), revoked });

  /**
   * @param {string} type
   * @param {unknown} result
   */
  const recordOperationSuccess = (type, result) => {
    const record =
      /** @type {{ updatedRefs?: unknown, fetch?: { updatedRefs?: unknown }, integration?: unknown, head?: unknown }} */ (
        result
      );
    const updatedRefs =
      type === 'pull' ? record.fetch?.updatedRefs : record.updatedRefs;
    recordAudit({
      type,
      outcome: 'ok',
      ...(updatedRefs === undefined ? {} : { updatedRefs }),
      ...(record.integration === undefined
        ? {}
        : { integration: record.integration }),
      ...(record.head === undefined ? {} : { head: record.head }),
    });
  };

  /**
   * @param {string} type
   * @param {unknown} err
   * @param {{ appliedLocally?: boolean }} [extra]
   */
  const recordOperationFailure = (type, err, extra = {}) => {
    recordAudit({
      type,
      outcome: 'error',
      message:
        /** @type {{ message?: string }} */ (err)?.message || String(err),
      ...(extra.appliedLocally ? { appliedLocally: true } : {}),
    });
  };

  /**
   * @param {unknown} value
   * @param {string} fieldName
   */
  const normalizeRefArg = (value, fieldName) => {
    const raw =
      typeof value === 'string'
        ? value
        : /** @type {{ name?: unknown }} */ (value || {}).name;
    const ref = requirePolicyString(raw, fieldName);
    if (ref.startsWith('-')) {
      throw new Error(`${fieldName} must not start with "-"`);
    }
    return ref.startsWith('refs/') ? ref : `refs/heads/${ref}`;
  };

  /**
   * @param {string} ref
   * @param {string} pattern
   * @returns {string | undefined}
   */
  const refPatternCapture = (ref, pattern) => {
    if (!pattern.includes('*')) {
      return ref === pattern ? '' : undefined;
    }
    const [prefix, suffix] = pattern.split('*');
    if (!ref.startsWith(prefix) || !ref.endsWith(suffix)) {
      return undefined;
    }
    return ref.slice(
      prefix.length,
      suffix.length === 0 ? undefined : -suffix.length,
    );
  };

  /**
   * @param {{ src: string, dst: string }} parsed
   * @param {{ src: string, dst: string }} policyRefspec
   */
  const refspecMatchesPattern = (parsed, policyRefspec) => {
    const srcCapture = refPatternCapture(parsed.src, policyRefspec.src);
    if (srcCapture === undefined) {
      return false;
    }
    const dstCapture = refPatternCapture(parsed.dst, policyRefspec.dst);
    if (dstCapture === undefined) {
      return false;
    }
    const policyHasWildcard =
      policyRefspec.src.includes('*') || policyRefspec.dst.includes('*');
    return !policyHasWildcard || srcCapture === dstCapture;
  };

  /**
   * Runtime gate for caller-supplied push overrides (`source` /
   * `destination` on `push()` options).  Policy refspecs are
   * shape-validated at construction by `normalizePolicy`; this runtime
   * check covers the override path only.  The default push (no
   * override) ships `currentPolicy.pushRefspecs` directly without
   * passing through this gate.
   *
   * @param {string} candidate
   */
  const assertPushRefspecAllowed = candidate => {
    const parsed = parseRefspec(candidate, 'GitRemote push refspec');
    if (parsed.force && !currentPolicy.allowForcePush) {
      throw new Error('GitRemote push force requires allowForcePush');
    }
    const allowed = currentPolicy.pushRefspecs.some(refspec => {
      const policyRefspec = parseRefspec(
        refspec,
        'GitRemote policy.pushRefspecs[]',
      );
      return refspecMatchesPattern(parsed, policyRefspec);
    });
    if (!allowed) {
      throw new Error(
        `GitRemote ${q(name)} push refspec is outside policy: ${q(candidate)}`,
      );
    }
  };

  /**
   * @param {unknown} options
   */
  const pushRefspecsFromOptions = options => {
    const opts =
      /** @type {{ source?: unknown, destination?: unknown, force?: boolean, setUpstream?: boolean }} */ (
        options || {}
      );
    if (opts.source === undefined && opts.destination === undefined) {
      if (opts.setUpstream) {
        throw new Error(
          'GitRemote.push setUpstream requires an explicit source and destination',
        );
      }
      return harden({
        refspecs: harden([...currentPolicy.pushRefspecs]),
        setUpstream: false,
      });
    }
    const source = normalizeRefArg(opts.source, 'GitRemote.push source');
    const destination = normalizeRefArg(
      opts.destination ?? source,
      'GitRemote.push destination',
    );
    const refspec = `${opts.force ? '+' : ''}${source}:${destination}`;
    assertPushRefspecAllowed(refspec);
    return harden({
      refspecs: harden([refspec]),
      setUpstream: !!opts.setUpstream,
    });
  };

  /**
   * @param {unknown} branch
   */
  const normalizePullBranch = branch => {
    if (branch !== undefined) {
      const ref = normalizeRefArg(branch, 'GitRemote.pull branch');
      // The local merge / rebase integration step may only target a ref
      // the fetch policy is allowed to populate — i.e. the destination
      // of one of `currentPolicy.fetchRefspecs`.  Without this, a holder
      // whose policy only fetches `refs/remotes/origin/main` could ask
      // to integrate an unrelated existing local ref (`refs/heads/private`),
      // gaining local-integration authority outside the remote policy.
      // Reuse the same `refPatternCapture` matcher the fetch path uses
      // (via `refspecMatchesPattern`) rather than a parallel matcher.
      const withinFetchPolicy = currentPolicy.fetchRefspecs.some(refspec => {
        const { dst } = parseRefspec(refspec, 'GitRemote.pull fetchRefspec');
        return refPatternCapture(ref, dst) !== undefined;
      });
      if (!withinFetchPolicy) {
        throw new Error(
          `GitRemote ${q(name)} pull branch is outside fetch policy: ${q(ref)}`,
        );
      }
      return ref;
    }
    const concreteFetch = currentPolicy.fetchRefspecs.find(
      refspec => !refspec.includes('*') && parseRefspec(refspec, 'fetch').src,
    );
    if (concreteFetch === undefined) {
      throw new Error(
        'GitRemote.pull requires a branch when fetchRefspecs are empty or wildcarded',
      );
    }
    return parseRefspec(concreteFetch, 'GitRemote.pull fetchRefspec').dst;
  };

  /**
   * @param {unknown} options
   */
  const fetchOptionsFromOptions = options => {
    const opts = /** @type {{ prune?: boolean, tags?: boolean }} */ (
      options || {}
    );
    if (opts.tags && !currentPolicy.allowTags) {
      throw new Error('GitRemote fetch tags require allowTags: true');
    }
    if (opts.prune && !currentPolicy.allowDelete) {
      throw new Error('GitRemote fetch prune requires allowDelete: true');
    }
    return harden({ prune: !!opts.prune, tags: !!opts.tags });
  };

  const remote = makeExo('GitRemote', GitRemoteInterface, {
    async inspect() {
      ensureLive();
      return snapshotPolicy();
    },

    async fetch(options = {}) {
      await null;
      let fence;
      try {
        ensureDirection('fetch');
        const fetchOptions = fetchOptionsFromOptions(options);
        fence = captureOperationFence();
        const transportCredential = ensureCredentialUsable();
        const activeOperation = beginOperation();
        let result;
        try {
          result = await backend.remoteFetch({
            url: currentPolicy.url,
            refspecs: currentPolicy.fetchRefspecs,
            prune: fetchOptions.prune,
            tags: fetchOptions.tags,
            credential: transportCredential,
            signal: activeOperation.signal,
          });
        } finally {
          activeOperation.finish();
        }
        assertOperationFence('fetch', fence);
        recordOperationSuccess('fetch', result);
        return result;
      } catch (err) {
        const finalErr =
          fence === undefined ? err : operationError('fetch', fence, err);
        recordOperationFailure('fetch', finalErr);
        throw finalErr;
      }
    },

    async pull(options = {}) {
      await null;
      let fence;
      let appliedLocally = false;
      try {
        ensureDirection('fetch');
        const fetchOptions = fetchOptionsFromOptions(options);
        fence = captureOperationFence();
        const transportCredential = ensureCredentialUsable();
        const opts =
          /** @type {{ branch?: unknown, strategy?: 'merge' | 'rebase' | 'ff-only' }} */ (
            options
          );
        const activeOperation = beginOperation();
        let fetch;
        try {
          fetch = await backend.remoteFetch({
            url: currentPolicy.url,
            refspecs: currentPolicy.fetchRefspecs,
            prune: fetchOptions.prune,
            tags: fetchOptions.tags,
            credential: transportCredential,
            signal: activeOperation.signal,
          });
        } finally {
          activeOperation.finish();
        }
        assertOperationFence('pull', fence);
        const branch = normalizePullBranch(opts.branch);
        /** @type {'merge' | 'rebase' | 'ff-only'} */
        const strategy = opts.strategy || 'ff-only';
        const headBefore = await E(git).revParse('HEAD');
        switch (strategy) {
          case 'ff-only':
            await E(git).merge(branch, { fastForwardOnly: true });
            break;
          case 'merge':
            await E(git).merge(branch);
            break;
          case 'rebase':
            await E(git).rebase({ mode: 'start', upstream: branch });
            break;
          default:
            throw new Error(
              'GitRemote.pull strategy must be merge, rebase, or ff-only',
            );
        }
        const head = await E(git).revParse('HEAD');
        const headOidBefore =
          /** @type {{ oid?: string }} */ (headBefore).oid || '';
        const headOid = /** @type {{ oid?: string }} */ (head).oid || '';
        /** @type {'up-to-date' | 'fast-forward' | 'merge' | 'rebase'} */
        let integration;
        if (headOidBefore === headOid) {
          integration = 'up-to-date';
        } else {
          appliedLocally = true;
          switch (strategy) {
            case 'ff-only':
              integration = 'fast-forward';
              break;
            case 'merge':
              integration = 'merge';
              break;
            case 'rebase':
              integration = 'rebase';
              break;
            default:
              throw new Error(
                'GitRemote.pull strategy must be merge, rebase, or ff-only',
              );
          }
        }
        const result = harden({ fetch, integration, head });
        assertOperationFence('pull', fence);
        recordOperationSuccess('pull', result);
        return result;
      } catch (err) {
        const finalErr =
          fence === undefined ? err : operationError('pull', fence, err);
        recordOperationFailure('pull', finalErr, { appliedLocally });
        throw finalErr;
      }
    },

    async push(options = {}) {
      await null;
      let fence;
      try {
        ensureDirection('push');
        fence = captureOperationFence();
        const transportCredential = ensureCredentialUsable();
        const { refspecs, setUpstream } = pushRefspecsFromOptions(options);
        const activeOperation = beginOperation();
        let result;
        try {
          result = await backend.remotePush({
            url: currentPolicy.url,
            refspecs,
            setUpstream,
            credential: transportCredential,
            signal: activeOperation.signal,
          });
        } finally {
          activeOperation.finish();
        }
        assertOperationFence('push', fence);
        recordOperationSuccess('push', result);
        return result;
      } catch (err) {
        const finalErr =
          fence === undefined ? err : operationError('push', fence, err);
        recordOperationFailure('push', finalErr);
        throw finalErr;
      }
    },
  });

  const recordPolicyChange = method => {
    recordAudit({
      type: 'policy',
      method,
      policy: snapshotPolicy(),
      revoked,
    });
  };

  const controller = makeExo(
    'GitRemoteController',
    GitRemoteControllerInterface,
    {
      async inspect() {
        return harden({ ...snapshotPolicy(), revoked });
      },

      async audit() {
        return harden([...auditLog]);
      },

      async setAllowedDirections(directions) {
        const nextPolicy = normalizePolicy({
          name,
          policy: {
            ...currentPolicy,
            allowedDirections: /** @type {GitDirection[]} */ (directions),
          },
        });
        await persistState(nextPolicy, revoked);
        currentPolicy = nextPolicy;
        invalidateOperations('policy');
        recordPolicyChange('setAllowedDirections');
      },

      async setFetchRefspecs(refspecs) {
        const nextPolicy = normalizePolicy({
          name,
          policy: { ...currentPolicy, fetchRefspecs: refspecs },
        });
        await persistState(nextPolicy, revoked);
        currentPolicy = nextPolicy;
        invalidateOperations('policy');
        recordPolicyChange('setFetchRefspecs');
      },

      async setPushRefspecs(refspecs) {
        const nextPolicy = normalizePolicy({
          name,
          policy: { ...currentPolicy, pushRefspecs: refspecs },
        });
        await persistState(nextPolicy, revoked);
        currentPolicy = nextPolicy;
        invalidateOperations('policy');
        recordPolicyChange('setPushRefspecs');
      },

      async setAllowedBranches(branches) {
        const nextPolicy = normalizePolicy({
          name,
          policy: {
            ...currentPolicy,
            pushRefspecs: [],
            allowedBranches: branches,
          },
        });
        await persistState(nextPolicy, revoked);
        currentPolicy = nextPolicy;
        invalidateOperations('policy');
        recordPolicyChange('setAllowedBranches');
      },

      async setAllowForcePush(flag) {
        const nextPolicy = normalizePolicy({
          name,
          policy: { ...currentPolicy, allowForcePush: !!flag },
        });
        await persistState(nextPolicy, revoked);
        currentPolicy = nextPolicy;
        invalidateOperations('policy');
        recordPolicyChange('setAllowForcePush');
      },

      async setAllowTags(flag) {
        const nextPolicy = normalizePolicy({
          name,
          policy: { ...currentPolicy, allowTags: !!flag },
        });
        await persistState(nextPolicy, revoked);
        currentPolicy = nextPolicy;
        invalidateOperations('policy');
        recordPolicyChange('setAllowTags');
      },

      async setAllowDelete(flag) {
        const nextPolicy = normalizePolicy({
          name,
          policy: { ...currentPolicy, allowDelete: !!flag },
        });
        await persistState(nextPolicy, revoked);
        currentPolicy = nextPolicy;
        invalidateOperations('policy');
        recordPolicyChange('setAllowDelete');
      },

      async revoke() {
        revoked = true;
        invalidateOperations('revoke');
        recordAudit({ type: 'revoke', policy: snapshotPolicy(), revoked });
        await persistState(currentPolicy, true);
      },
    },
  );

  // Register the controller in the host-private companion map.
  remoteControllers.set(remote, controller);

  return harden({ remote, controller });
};
harden(makeGitRemote);
