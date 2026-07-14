// @ts-check

/**
 * Node powers for the `EndoRegistry` backend. Keeping Node modules and
 * ambient fetch at this perimeter lets the daemon core remain platform-neutral.
 */

import { makeError, q, X } from '@endo/errors';
import { makeRegistryTamperedError } from './registry.js';
import { makeRegistryBackend } from './registry-node.js';

/**
 * @param {{
 *   fetchImplementation: (url: string) => Promise<any>,
 *   gunzip: (bytes: Uint8Array) => Promise<Uint8Array>,
 *   createHash: (algorithm: string) => { update: (bytes: Uint8Array) => unknown, digest: (encoding: 'base64') => string },
 *   registryUrl?: string,
 * }} powers
 */
export const makeRegistryNodePowers = ({
  fetchImplementation,
  gunzip,
  createHash,
  registryUrl = 'https://registry.npmjs.org',
}) => {
  const verifyIntegrity = async (bytes, integrity, nameVersion) => {
    if (typeof integrity !== 'string' || integrity === '') return;
    const [first] = integrity.trim().split(/\s+/);
    const dashIndex = first.indexOf('-');
    if (dashIndex <= 0) {
      throw makeRegistryTamperedError(
        X`registry: tarball for ${q(nameVersion)} carries a malformed integrity ${q(first)}`,
      );
    }
    const algorithm = first.slice(0, dashIndex);
    const expected = first.slice(dashIndex + 1);
    if (!['sha512', 'sha256', 'sha1'].includes(algorithm)) {
      throw makeRegistryTamperedError(
        X`registry: tarball for ${q(nameVersion)} declares unsupported integrity algorithm ${q(algorithm)}`,
      );
    }
    const hash = createHash(algorithm);
    hash.update(bytes);
    const actual = hash.digest('base64');
    if (actual !== expected) {
      throw makeRegistryTamperedError(
        X`registry: tarball for ${q(nameVersion)} does not match published ${q(algorithm)} integrity`,
      );
    }
  };

  return harden({
    registryUrl,
    makeRegistryBackend: powers =>
      makeRegistryBackend({
        ...powers,
        fetchImplementation,
        gunzip,
        verifyIntegrity,
      }),
  });
};

/**
 * The web daemon retains the registry shape but has no transport.
 * @param {string} [registryUrl]
 */
export const makeRegistryStubPowers = (
  registryUrl = 'https://registry.npmjs.org',
) => {
  const unavailable = () => {
    throw makeError(
      X`registry: no registry transport is available on this platform`,
    );
  };
  return harden({
    registryUrl,
    makeRegistryBackend: powers =>
      makeRegistryBackend({
        ...powers,
        fetchImplementation: unavailable,
        gunzip: unavailable,
        verifyIntegrity: unavailable,
      }),
  });
};

harden(makeRegistryNodePowers);
harden(makeRegistryStubPowers);
