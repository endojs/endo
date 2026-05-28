// @ts-check
/// <reference types="ses"/>

import { q } from '@endo/errors';
import { makeExo } from '@endo/exo';

import {
  BasicCredentialInterface,
  BearerCredentialInterface,
  GitCredentialControllerInterface,
} from './interfaces.js';

/**
 * @typedef {'bearer' | 'basic'} GitCredentialKind
 */

/**
 * @typedef {{ token: string } | { username: string, password: string } | { unavailable: true }} GitCredentialMaterial
 */

/**
 * @typedef {object} GitCredentialRecord
 * @property {GitCredentialKind} kind
 * @property {string} audience
 * @property {() => GitCredentialMaterial} getMaterial
 * @property {() => number} getVersion
 * @property {() => boolean} isRevoked
 * @property {(listener: () => void) => (() => void)} watchChange
 * @property {(material: GitCredentialMaterial) => void} rotate
 * @property {() => void} revoke
 */

/**
 * @type {WeakMap<object, GitCredentialRecord>}
 */
const credentialRecords = new WeakMap();

/**
 * @type {WeakMap<object, object>}
 */
const credentialControllers = new WeakMap();

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string}
 */
const requireCredentialString = (value, fieldName) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  if (value.includes('\0')) {
    throw new Error(`${fieldName} must not contain NUL bytes`);
  }
  return value;
};
harden(requireCredentialString);

/**
 * @param {GitCredentialKind} kind
 * @param {Record<string, unknown>} material
 * @param {string} label
 * @returns {GitCredentialMaterial}
 */
const normalizeMaterial = (kind, material, label) => {
  if (kind === 'bearer') {
    return harden({
      token: requireCredentialString(material.token, `${label} token`),
    });
  }
  if (kind === 'basic') {
    return harden({
      username: requireCredentialString(material.username, `${label} username`),
      password: requireCredentialString(material.password, `${label} password`),
    });
  }
  throw new Error(`GitCredential kind must be bearer or basic: ${q(kind)}`);
};
harden(normalizeMaterial);

/**
 * @param {GitCredentialRecord} record
 */
const makeGitCredentialController = record =>
  makeExo('GitCredentialController', GitCredentialControllerInterface, {
    async inspect() {
      return harden({
        kind: record.kind,
        audience: record.audience,
        available: !Object.hasOwn(record.getMaterial(), 'unavailable'),
        revoked: record.isRevoked(),
      });
    },

    async rotate(material) {
      record.rotate(
        normalizeMaterial(
          record.kind,
          /** @type {Record<string, unknown>} */ (material),
          'GitCredentialController.rotate',
        ),
      );
    },

    async revoke() {
      record.revoke();
    },
  });
harden(makeGitCredentialController);

/**
 * @param {object} credential
 * @param {GitCredentialRecord} record
 */
const registerCredential = (credential, record) => {
  const durableRecord = harden(record);
  credentialRecords.set(credential, durableRecord);
  credentialControllers.set(
    credential,
    makeGitCredentialController(durableRecord),
  );
  return credential;
};
harden(registerCredential);

const makeChangeNotifier = () => {
  /** @type {Set<() => void>} */
  const listeners = new Set();
  return harden({
    watchChange: listener => {
      listeners.add(listener);
      return harden(() => {
        listeners.delete(listener);
      });
    },
    notifyChange: () => {
      for (const listener of [...listeners]) {
        listener();
      }
    },
  });
};
harden(makeChangeNotifier);

/**
 * @param {object} credential
 * @param {string} expectedAudience
 * @param {object} [options]
 * @param {boolean} [options.allowRevoked]
 * @returns {GitCredentialRecord}
 */
export const assertGitCredentialForUrl = (
  credential,
  expectedAudience,
  options = {},
) => {
  const record = credentialRecords.get(credential);
  if (record === undefined) {
    throw new Error('GitRemote requires a daemon-minted Git credential cap');
  }
  if (record.audience !== expectedAudience) {
    throw new Error(
      `Git credential audience ${q(record.audience)} does not match remote origin ${q(expectedAudience)}`,
    );
  }
  if (!options.allowRevoked && record.isRevoked()) {
    throw new Error(
      `Git credential for ${q(record.audience)} has been revoked`,
    );
  }
  return record;
};
harden(assertGitCredentialForUrl);

/**
 * Host-private revocation helper for tests and low-level call sites. The
 * public host surface normally uses GitCredentialController.revoke().
 *
 * @param {object} credential
 */
export const revokeGitCredential = credential => {
  const record = credentialRecords.get(credential);
  if (record === undefined) {
    throw new Error('Cannot revoke a non-daemon Git credential cap');
  }
  record.revoke();
};
harden(revokeGitCredential);

/**
 * @param {unknown} credential
 */
export const getGitCredentialController = credential =>
  credentialControllers.get(/** @type {object} */ (credential));
harden(getGitCredentialController);

/**
 * @param {object} args
 * @param {string} args.audience  URL origin this bearer token may be used for.
 * @param {string} args.token  Non-extractable bearer token secret.
 * @param {(material: GitCredentialMaterial) => void} [args.onRotate]
 * @param {() => void} [args.onRevoke]
 */
export const makeBearerCredential = ({
  audience,
  token,
  onRotate,
  onRevoke,
}) => {
  const normalizedAudience = requireCredentialString(
    audience,
    'BearerCredential audience',
  );
  const tokenText = requireCredentialString(token, 'BearerCredential token');
  /** @type {GitCredentialMaterial} */
  let currentMaterial = harden({ token: tokenText });
  let version = 0;
  let revoked = false;
  const changeNotifier = makeChangeNotifier();
  const credential = makeExo('BearerCredential', BearerCredentialInterface, {
    audience() {
      return normalizedAudience;
    },
  });
  return registerCredential(credential, {
    kind: 'bearer',
    audience: normalizedAudience,
    getMaterial: () => currentMaterial,
    getVersion: () => version,
    isRevoked: () => revoked,
    watchChange: changeNotifier.watchChange,
    rotate: material => {
      currentMaterial = material;
      version += 1;
      revoked = false;
      onRotate?.(material);
      changeNotifier.notifyChange();
    },
    revoke: () => {
      revoked = true;
      currentMaterial = harden({ unavailable: true });
      version += 1;
      onRevoke?.();
      changeNotifier.notifyChange();
    },
  });
};
harden(makeBearerCredential);

/**
 * @param {object} args
 * @param {string} args.audience  URL origin this basic credential may be used for.
 * @param {string} args.username  Non-extractable username.
 * @param {string} args.password  Non-extractable password.
 * @param {(material: GitCredentialMaterial) => void} [args.onRotate]
 * @param {() => void} [args.onRevoke]
 */
export const makeBasicCredential = ({
  audience,
  username,
  password,
  onRotate,
  onRevoke,
}) => {
  const normalizedAudience = requireCredentialString(
    audience,
    'BasicCredential audience',
  );
  const usernameText = requireCredentialString(
    username,
    'BasicCredential username',
  );
  const passwordText = requireCredentialString(
    password,
    'BasicCredential password',
  );
  /** @type {GitCredentialMaterial} */
  let currentMaterial = harden({
    username: usernameText,
    password: passwordText,
  });
  let version = 0;
  let revoked = false;
  const changeNotifier = makeChangeNotifier();
  const credential = makeExo('BasicCredential', BasicCredentialInterface, {
    audience() {
      return normalizedAudience;
    },
  });
  return registerCredential(credential, {
    kind: 'basic',
    audience: normalizedAudience,
    getMaterial: () => currentMaterial,
    getVersion: () => version,
    isRevoked: () => revoked,
    watchChange: changeNotifier.watchChange,
    rotate: material => {
      currentMaterial = material;
      version += 1;
      revoked = false;
      onRotate?.(material);
      changeNotifier.notifyChange();
    },
    revoke: () => {
      revoked = true;
      currentMaterial = harden({ unavailable: true });
      version += 1;
      onRevoke?.();
      changeNotifier.notifyChange();
    },
  });
};
harden(makeBasicCredential);

/**
 * Reconstitute a credential formula when the daemon no longer has the
 * process-local secret material.  The cap remains identifiable and
 * inspectable by audience, but any transport use fails closed until the
 * operator reprovisions the secret.
 *
 * @param {object} args
 * @param {GitCredentialKind} args.kind
 * @param {string} args.audience
 * @param {(material: GitCredentialMaterial) => void} [args.onRotate]
 * @param {() => void} [args.onRevoke]
 */
export const makeUnavailableGitCredential = ({
  kind,
  audience,
  onRotate,
  onRevoke,
}) => {
  const normalizedAudience = requireCredentialString(
    audience,
    'GitCredential audience',
  );
  if (kind !== 'bearer' && kind !== 'basic') {
    throw new Error(`GitCredential kind must be bearer or basic: ${q(kind)}`);
  }
  const Interface =
    kind === 'bearer' ? BearerCredentialInterface : BasicCredentialInterface;
  const credential = makeExo(
    kind === 'bearer' ? 'BearerCredential' : 'BasicCredential',
    Interface,
    {
      audience() {
        return normalizedAudience;
      },
    },
  );
  /** @type {GitCredentialMaterial} */
  let currentMaterial = harden({ unavailable: true });
  let version = 0;
  let revoked = true;
  const changeNotifier = makeChangeNotifier();
  return registerCredential(credential, {
    kind,
    audience: normalizedAudience,
    getMaterial: () => currentMaterial,
    getVersion: () => version,
    isRevoked: () => revoked,
    watchChange: changeNotifier.watchChange,
    rotate: material => {
      currentMaterial = material;
      version += 1;
      revoked = false;
      onRotate?.(material);
      changeNotifier.notifyChange();
    },
    revoke: () => {
      revoked = true;
      currentMaterial = harden({ unavailable: true });
      version += 1;
      onRevoke?.();
      changeNotifier.notifyChange();
    },
  });
};
harden(makeUnavailableGitCredential);
