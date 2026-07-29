// @ts-check
/* eslint-disable no-await-in-loop */
/**
 * The user-mode fallback backend for the `EndoRegistry` capability.
 *
 * It reads npm packument metadata and package tarballs over HTTP from the
 * configured registry, verifies each tarball against the registry's
 * published `dist.integrity`, and checks the tarball contents into the
 * daemon content store as a `readable-tree` capability. This is the default
 * backend that ships with the Node daemon; a platform-native daemon can
 * substitute a backend behind the same
 * `RegistryBackend` shape (see designs/registry-capability.md § Two
 * backends, one shape).
 *
 * Platform-specific operations are supplied as powers by
 * `registry-node-powers.js`. The constructor performs no I/O, so
 * incarnating the `@registry` slot never blocks daemon start.
 *
 * @import { RegistryBackend } from './registry.js'
 */

import { makeError, q, X } from '@endo/errors';
import { encodeBase64 } from '@endo/base64';
import { decodeHex } from '@endo/hex';
import { bytesFromText } from '@endo/bytes/from-string.js';
import { readTarEntries, tarPathSegments } from '@endo/tar/reader.js';
import { makeRegistryMissingPackageError } from './registry.js';

/**
 * @param {Uint8Array} bytes
 * @returns {AsyncIterableIterator<Uint8Array>}
 */
async function* singleChunk(bytes) {
  yield bytes;
}

/**
 * @param {AsyncIterable<Uint8Array> | Uint8Array} source
 * @returns {AsyncIterableIterator<Uint8Array>}
 */
async function* asAsyncBytes(source) {
  if (source instanceof Uint8Array) {
    yield source;
    return;
  }
  yield* source;
}

/**
 * @param {{
 *   contentStore: { store: (readable: AsyncIterable<Uint8Array>) => Promise<string> },
 *   makeReadableTree: (sha256: string) => unknown,
 *   sha256Hex: (text: string) => string,
 *   registryUrl: string,
 *   fetch: (url: string) => Promise<{ ok: boolean, status: number, json: () => Promise<any>, arrayBuffer: () => Promise<ArrayBuffer> }>,
 *   gunzip: (bytes: Uint8Array) => Promise<Uint8Array>,
 *   verifyIntegrity: (bytes: Uint8Array, integrity: string, nameVersion: string) => Promise<void>,
 * }} powers
 * @returns {RegistryBackend}
 */
export const makeRegistryBackend = ({
  contentStore,
  makeReadableTree,
  sha256Hex,
  registryUrl,
  fetch,
  gunzip,
  verifyIntegrity,
}) => {
  const base = registryUrl.replace(/\/+$/, '');

  /** @type {Map<string, any>} */
  const packumentCache = new Map();
  /** @type {WeakMap<object, Uint8Array>} */
  const packageJsonByTree = new WeakMap();

  /**
   * npm's packument endpoint expects the package name as one encoded path
   * segment. `encodeURIComponent` encodes scoped-name slashes as `%2F`;
   * npm accepts that spelling as equivalent to its documented `%2f` form.
   *
   * @param {string} name
   */
  const packumentUrl = name => `${base}/${encodeURIComponent(name)}`;

  /**
   * Fetch (and cache) a package's packument.
   *
   * @param {string} name
   * @returns {Promise<any | undefined>} undefined when the package is absent
   */
  const fetchPackument = async name => {
    const cached = packumentCache.get(name);
    if (cached !== undefined) return cached;
    const response = await fetch(packumentUrl(name));
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw makeError(
        X`registry: ${q(name)} fetch failed with status ${q(response.status)}`,
      );
    }
    const packument = await response.json();
    packumentCache.set(name, packument);
    return packument;
  };

  /**
   * Check a gunzipped tar into the content store, stripping the npm
   * `package/` prefix, and return the root tree-JSON manifest sha256.  The
   * manifest format mirrors `tar-checkin.js` so `snapshotTreeMethods` reads
   * it back.
   *
   * @param {Uint8Array} tarBytes
   * @returns {Promise<{ sha256: string, packageJsonBytes: Uint8Array | undefined }>}
   */
  const checkinPackageTar = async tarBytes => {
    /** @typedef {{ type: 'tree', entries: Map<string, any> } | { type: 'blob', sha256: string }} Node */
    /** @type {{ type: 'tree', entries: Map<string, any> }} */
    const root = { type: 'tree', entries: new Map() };
    let packageJsonBytes;

    /** @param {string[]} segments */
    const ensureDirectory = segments => {
      let node = root;
      for (const segment of segments) {
        let child = node.entries.get(segment);
        if (child === undefined || child.type !== 'tree') {
          child = { type: 'tree', entries: new Map() };
          node.entries.set(segment, child);
        }
        node = child;
      }
      return node;
    };

    for await (const entry of readTarEntries(asAsyncBytes(tarBytes))) {
      // The tar reader is stateful: each entry's content must be drained
      // before the next iteration, so collect it up front.
      const chunks = [];
      for await (const chunk of entry.content) {
        chunks.push(chunk);
      }

      // npm tarballs place everything under a leading `package/` directory
      // (occasionally a differently-named single root); strip the first
      // path segment so the tree root is the package itself.  A bare root
      // entry (`rawSegments.length <= 1`) has nothing to place.
      const rawSegments = tarPathSegments(entry.path);
      const segments = rawSegments.slice(1);

      if (segments.length >= 1 && entry.type === 'file') {
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        if (segments.length === 1 && segments[0] === 'package.json') {
          packageJsonBytes = bytes;
        }
        const sha256 = await contentStore.store(singleChunk(bytes));
        const parent = ensureDirectory(segments.slice(0, -1));
        parent.entries.set(segments[segments.length - 1], {
          type: 'blob',
          sha256,
        });
      } else if (segments.length >= 1 && entry.type === 'directory') {
        ensureDirectory(segments);
      }
      // Symlinks and other entry kinds are not represented in package trees.
    }

    /** @param {{ type: 'tree', entries: Map<string, any> }} tree */
    const storeTree = async tree => {
      /** @type {Array<[string, string, string]>} */
      const entries = [];
      for (const [name, child] of tree.entries) {
        if (child.type === 'tree') {
          entries.push([name, 'tree', await storeTree(child)]);
        } else {
          entries.push([name, 'blob', child.sha256]);
        }
      }
      entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      const json = bytesFromText(JSON.stringify(entries));
      return contentStore.store(singleChunk(json));
    };

    const sha256 = await storeTree(root);
    return { sha256, packageJsonBytes };
  };

  return harden({
    fetchVersions: async name => {
      const packument = await fetchPackument(name);
      if (packument === undefined || typeof packument.versions !== 'object') {
        return undefined;
      }
      return Object.keys(packument.versions);
    },

    provideTree: async (name, version) => {
      const packument = await fetchPackument(name);
      const versionRecord = packument?.versions?.[version];
      if (versionRecord === undefined) {
        throw makeRegistryMissingPackageError(
          X`registry: ${q(`${name}@${version}`)} is not published on ${q(
            registryUrl,
          )}`,
        );
      }
      const dist = versionRecord.dist ?? {};
      const tarballUrl = dist.tarball;
      if (typeof tarballUrl !== 'string') {
        throw makeRegistryMissingPackageError(
          X`registry: ${q(`${name}@${version}`)} has no tarball URL`,
        );
      }
      const response = await fetch(tarballUrl);
      if (!response.ok) {
        throw makeError(
          X`registry: tarball fetch for ${q(`${name}@${version}`)} failed with status ${q(
            response.status,
          )}`,
        );
      }
      const gz = new Uint8Array(await response.arrayBuffer());
      const integrity =
        typeof dist.integrity === 'string'
          ? dist.integrity
          : typeof dist.shasum === 'string'
            ? `sha1-${encodeBase64(decodeHex(dist.shasum))}`
            : '';
      await verifyIntegrity(gz, integrity, `${name}@${version}`);
      const tar = await gunzip(gz);
      const { sha256, packageJsonBytes } = await checkinPackageTar(tar);
      const treeRef = makeReadableTree(sha256);
      if (packageJsonBytes !== undefined) {
        packageJsonByTree.set(
          /** @type {object} */ (treeRef),
          packageJsonBytes,
        );
      }
      return harden({ treeRef, integrity });
    },

    readPackageJson: async treeRef => {
      const cached = packageJsonByTree.get(/** @type {object} */ (treeRef));
      if (cached !== undefined) {
        return cached;
      }
      // Fall back to reading `package.json` out of the live tree capability.
      const blob = await /** @type {any} */ (treeRef).lookup('package.json');
      const text = await blob.text();
      return bytesFromText(text);
    },

    sha256Hex,
  });
};

harden(makeRegistryBackend);
