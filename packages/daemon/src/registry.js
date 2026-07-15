// @ts-check
/* eslint-disable no-await-in-loop */

/**
 * JS reference implementation of the `EndoRegistry` daemon capability.
 *
 * `EndoRegistry` brokers npm-style package resolution and tarball fetch
 * against the content-addressed store (CAS).  It is exposed on every host
 * as the `@registry` special name (mirroring `@node`).
 *
 * This module is the JS reference backend from
 * `designs/registry-capability.md` and implements the Go-like Minimum
 * Version Selection walk from `designs/mvs-resolver.md`.  The side-effecting
 * operations (registry HTTP, tarball → CAS check-in, reading a
 * `package.json` back out of a tree) are injected as the `RegistryBackend` so the
 * pure resolution algorithm is exercised in CI without a network or a live
 * daemon, and so the eventual Rust-backed backend can drop in behind the
 * same shape.
 */

import { makeExo } from '@endo/exo';
import { makeError, q, X } from '@endo/errors';
import { bytesToText } from '@endo/bytes/to-string.js';
import { RegistryInterface } from './interfaces.js';

// #region Structured errors
//
// `EndoRegistry.resolve`/`fetch` reject with `@endo/errors` errors tagged by
// failure class so callers can branch on `err.name` across both backends
// (the tag survives marshalling across the worker boundary), per
// `designs/registry-capability.md` § Failure surface.

/** The error name a tampered-tarball rejection carries. */
export const RegistryTamperedErrorName = 'RegistryTamperedError';
/** The error name a missing-package rejection carries. */
export const RegistryMissingPackageErrorName = 'RegistryMissingPackageError';
/** The error name a transit-failure rejection carries. */
export const RegistryNetworkErrorName = 'RegistryNetworkError';
/** The error name an offline-mode miss rejection carries. */
export const RegistryOfflineErrorName = 'RegistryOfflineError';

/**
 * Build an error whose `.name` is the given failure class.  `@endo/errors`'
 * `errorName` option only sets an internal display tag (via `tagError`), not
 * the readable `.name` callers branch on, so we compute the redacted message
 * with `makeError` and then set the name on a fresh error.  Across a CapTP
 * boundary a custom name collapses to `Error` (a pass-style limitation);
 * the message still carries the class, and in-process callers see the name.
 *
 * @param {import('ses').Details} details
 * @param {string} errorName
 * @param {{ cause?: unknown }} [options]
 */
const makeTaggedError = (details, errorName, { cause } = {}) => {
  const base = makeError(details);
  const message =
    cause instanceof Error && typeof cause.message === 'string'
      ? `${base.message}: ${cause.message}`
      : base.message;
  const error = new Error(message);
  error.name = errorName;
  return harden(error);
};

/** @param {import('ses').Details} details */
export const makeRegistryTamperedError = details =>
  makeTaggedError(details, RegistryTamperedErrorName);

/** @param {import('ses').Details} details */
export const makeRegistryMissingPackageError = details =>
  makeTaggedError(details, RegistryMissingPackageErrorName);

/**
 * @param {import('ses').Details} details
 * @param {{ cause?: unknown }} [options]
 */
export const makeRegistryNetworkError = (details, options) =>
  makeTaggedError(details, RegistryNetworkErrorName, options);

/** @param {import('ses').Details} details */
export const makeRegistryOfflineError = details =>
  makeTaggedError(details, RegistryOfflineErrorName);

// #endregion

// #region Minimal semver
//
// A deliberately small subset of npm semver sufficient for the reference
// MVS walk: exact versions, caret (`^`), tilde (`~`), `x`/`*` wildcards, and
// bare comparators.  Prerelease identifiers are compared but the resolver
// does not select a prerelease unless a comparator's own version carries
// one, matching npm's default `includePrerelease: false` stance closely
// enough for the reference lane.  A production backend may swap a full
// semver; the capability shape does not change.

/**
 * @typedef {object} SemverVersion
 * @property {number} major
 * @property {number} minor
 * @property {number} patch
 * @property {string[]} prerelease
 * @property {string} raw
 */

const numberPattern = /^(0|[1-9]\d*)$/;

/**
 * @param {string} identifier
 * @returns {number | undefined}
 */
const asNumericIdentifier = identifier =>
  numberPattern.test(identifier) ? Number(identifier) : undefined;

/**
 * @param {string} versionString
 * @returns {SemverVersion | undefined}
 */
export const parseVersion = versionString => {
  if (typeof versionString !== 'string') {
    return undefined;
  }
  const trimmed = versionString.trim().replace(/^[v=]+/, '');
  const match = trimmed.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?$/,
  );
  if (match === null) {
    return undefined;
  }
  const [, major, minor, patch, prerelease] = match;
  return harden({
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease === undefined ? [] : prerelease.split('.'),
    raw: trimmed,
  });
};

/**
 * Compare two prerelease identifier lists per semver §11.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number}
 */
const comparePrerelease = (a, b) => {
  // A version with a prerelease has lower precedence than one without.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const ai = asNumericIdentifier(a[i]);
    const bi = asNumericIdentifier(b[i]);
    if (ai !== undefined && bi !== undefined) {
      if (ai !== bi) return ai < bi ? -1 : 1;
    } else if (ai !== undefined) {
      return -1; // numeric identifiers have lower precedence than alphanumeric
    } else if (bi !== undefined) {
      return 1;
    } else if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1;
    }
  }
  if (a.length === b.length) return 0;
  return a.length < b.length ? -1 : 1;
};

/**
 * @param {SemverVersion} a
 * @param {SemverVersion} b
 * @returns {number} -1, 0, or 1
 */
export const compareVersions = (a, b) => {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return comparePrerelease(a.prerelease, b.prerelease);
};

/**
 * A single comparator: a lower bound and an upper bound (exclusive when
 * `upperExclusive`).  `undefined` bounds are open.
 *
 * @typedef {object} Comparator
 * @property {SemverVersion} [lower]
 * @property {boolean} [lowerExclusive]
 * @property {SemverVersion} [upper]
 * @property {boolean} [upperExclusive]
 */

/**
 * Parse a single (already whitespace-normalized) simple range into a
 * comparator pair.  Handles `^`, `~`, exact, `x`/`*` wildcards, and the
 * comparison operators `>= > <= < =`.
 *
 * @param {string} simple
 * @returns {Comparator[] | undefined} undefined if unparseable
 */
const parseSimpleRange = simple => {
  const token = simple.trim();
  if (token === '' || token === '*' || token === 'x' || token === 'X') {
    return [{}];
  }

  const caretOrTilde = token.match(/^([\^~])\s*(.+)$/);
  if (caretOrTilde !== null) {
    const [, operator, rest] = caretOrTilde;
    const parts = rest.replace(/^[v=]+/, '').split('.');
    const major = asNumericIdentifier(parts[0] ?? '0') ?? 0;
    const minorRaw = parts[1];
    const patchRaw = parts[2];
    const minor =
      minorRaw === undefined || /^[xX*]$/.test(minorRaw)
        ? 0
        : (asNumericIdentifier(minorRaw) ?? 0);
    const patch =
      patchRaw === undefined || /^[xX*]$/.test(patchRaw)
        ? 0
        : (asNumericIdentifier(patchRaw) ?? 0);
    const lower = parseVersion(`${major}.${minor}.${patch}`);
    if (lower === undefined) return undefined;
    /** @type {SemverVersion | undefined} */
    let upper;
    if (operator === '^') {
      // `^` allows changes that do not modify the left-most non-zero element.
      if (major !== 0) {
        upper = parseVersion(`${major + 1}.0.0`);
      } else if (minor !== 0) {
        upper = parseVersion(`0.${minor + 1}.0`);
      } else {
        upper = parseVersion(`0.0.${patch + 1}`);
      }
    } else {
      // `~` allows patch-level changes if a minor version is specified.
      upper =
        minorRaw === undefined
          ? parseVersion(`${major + 1}.0.0`)
          : parseVersion(`${major}.${minor + 1}.0`);
    }
    return [{ lower, upper, upperExclusive: true }];
  }

  const operatorMatch = token.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
  if (operatorMatch === null) return undefined;
  const [, operator = '=', versionText] = operatorMatch;
  const partial = versionText.replace(/^[v=]+/, '').split('.');
  const hasWildcard = partial.some(p => /^[xX*]$/.test(p) || p === '');
  const major = asNumericIdentifier(partial[0] ?? '') ?? 0;

  if (hasWildcard || partial.length < 3) {
    // `1`, `1.x`, `1.2.x` style: a range spanning the specified prefix.
    const minorSpecified =
      partial[1] !== undefined &&
      !/^[xX*]$/.test(partial[1]) &&
      partial[1] !== '';
    const minor = minorSpecified ? (asNumericIdentifier(partial[1]) ?? 0) : 0;
    if (operator === '=' || operator === undefined) {
      const lower = parseVersion(`${major}.${minor}.0`);
      if (lower === undefined) return undefined;
      const upper = minorSpecified
        ? parseVersion(`${major}.${minor + 1}.0`)
        : parseVersion(`${major + 1}.0.0`);
      return [{ lower, upper, upperExclusive: true }];
    }
  }

  const version = parseVersion(versionText);
  if (version === undefined) return undefined;
  switch (operator) {
    case '>':
      return [{ lower: version, lowerExclusive: true }];
    case '>=':
      return [{ lower: version }];
    case '<':
      return [{ upper: version, upperExclusive: true }];
    case '<=':
      return [{ upper: version }];
    case '=':
    default:
      return [{ lower: version, upper: version }];
  }
};

/**
 * Parse a full range string (space-separated comparators intersected,
 * `||`-separated ranges unioned) into a disjunction of comparator lists.
 *
 * @param {string} rangeString
 * @returns {Comparator[][] | undefined}
 */
export const parseRange = rangeString => {
  if (typeof rangeString !== 'string') return undefined;
  const unions = rangeString.trim().split(/\s*\|\|\s*/);
  /** @type {Comparator[][]} */
  const result = [];
  for (const union of unions) {
    // Hyphen ranges (`1.2.3 - 2.3.4`) are uncommon in dependency
    // declarations; treat the whole clause as a wildcard if we see one
    // rather than mis-parse it.
    if (/\s-\s/.test(union)) {
      result.push([{}]);
      // eslint-disable-next-line no-continue
      continue;
    }
    /** @type {Comparator[]} */
    const comparators = [];
    const simples = union.split(/\s+/).filter(part => part !== '');
    if (simples.length === 0) {
      comparators.push({});
    }
    for (const simple of simples) {
      const parsed = parseSimpleRange(simple);
      if (parsed === undefined) return undefined;
      comparators.push(...parsed);
    }
    result.push(comparators);
  }
  return result;
};

/**
 * @param {SemverVersion} version
 * @param {Comparator} comparator
 * @returns {boolean}
 */
const satisfiesComparator = (version, comparator) => {
  const { lower, lowerExclusive, upper, upperExclusive } = comparator;
  if (lower !== undefined) {
    const cmp = compareVersions(version, lower);
    if (lowerExclusive ? cmp <= 0 : cmp < 0) return false;
  }
  if (upper !== undefined) {
    const cmp = compareVersions(version, upper);
    if (upperExclusive ? cmp >= 0 : cmp > 0) return false;
  }
  // Do not select a prerelease version unless a bound is itself a
  // prerelease of the same tuple (npm's default stance).
  if (version.prerelease.length > 0) {
    const boundHasSameTuplePrerelease = [lower, upper].some(
      bound =>
        bound !== undefined &&
        bound.prerelease.length > 0 &&
        bound.major === version.major &&
        bound.minor === version.minor &&
        bound.patch === version.patch,
    );
    if (!boundHasSameTuplePrerelease) return false;
  }
  return true;
};

/**
 * @param {string} versionString
 * @param {string} rangeString
 * @returns {boolean}
 */
export const satisfies = (versionString, rangeString) => {
  const version = parseVersion(versionString);
  if (version === undefined) return false;
  const range = parseRange(rangeString);
  if (range === undefined) return false;
  return range.some(comparators =>
    comparators.every(comparator => satisfiesComparator(version, comparator)),
  );
};

/**
 * The MVS-relevant major key for a range.  MVS tracks one selection per
 * `(name, major)`, so two importers requiring incompatible majors of the
 * same package both land in the resolution.
 *
 * @param {string} rangeString
 * @returns {number}
 */
export const rangeMajor = rangeString => {
  const range = parseRange(rangeString);
  if (range !== undefined) {
    for (const comparators of range) {
      for (const comparator of comparators) {
        if (comparator.lower !== undefined) {
          return comparator.lower.major;
        }
      }
    }
  }
  // Fall back to a best-effort digit scrape for unparseable ranges.
  const digits = String(rangeString).match(/(\d+)/);
  return digits === null ? 0 : Number(digits[1]);
};

/**
 * Select the least published version in `versions` that satisfies
 * `rangeString`. This preserves MVS's property that newly-published versions
 * cannot alter an existing resolution.
 *
 * @param {string[]} versions
 * @param {string} rangeString
 * @returns {string | undefined}
 */
export const minSatisfying = (versions, rangeString) => {
  /** @type {SemverVersion | undefined} */
  let best;
  for (const candidate of versions) {
    const parsed = satisfies(candidate, rangeString)
      ? parseVersion(candidate)
      : undefined;
    if (
      parsed !== undefined &&
      (best === undefined || compareVersions(parsed, best) < 0)
    ) {
      best = parsed;
    }
  }
  return best?.raw;
};

// #endregion

// #region Registry table (LRU-bounded working set)

/**
 * @typedef {object} RegistryTreeEntry
 * @property {string} name
 * @property {string} version
 * @property {unknown} treeRef  A CAS readable-tree capability.
 * @property {string} integrity
 */

/**
 * @typedef {object} RegistryTable
 * @property {(name: string, version: string) => RegistryTreeEntry | undefined} getTree
 * @property {(entry: RegistryTreeEntry) => void} putTree
 * @property {(name: string) => string[] | undefined} getManifest  cached published versions
 * @property {(name: string, versions: string[]) => void} putManifest
 * @property {(prefix?: string) => Array<{ name: string, version: string }>} list
 */

/**
 * A bounded `(name, version) -> tree` and `name -> published-versions`
 * cache.  `maxEntries` of `0` (the first-cut default) means no LRU eviction;
 * byte-level bounded growth is delegated to the CAS per
 * `designs/registry-capability.md` § Caching and retention.
 *
 * @param {{ maxEntries?: number }} [options]
 * @returns {RegistryTable}
 */
export const makeRegistryTable = ({ maxEntries = 0 } = {}) => {
  /**
   * @param {string} name
   * @param {string} version
   */
  const treeKey = (name, version) => `${name}@${version}`;
  /** @type {Map<string, RegistryTreeEntry>} */
  const trees = new Map();
  /** @type {Map<string, string[]>} */
  const manifests = new Map();

  /** @param {string} key */
  const touch = key => {
    const entry = trees.get(key);
    if (entry !== undefined) {
      // Re-insert to mark most-recently-used (Map preserves insertion order).
      trees.delete(key);
      trees.set(key, entry);
    }
  };

  const evictIfNeeded = () => {
    if (maxEntries <= 0) return;
    while (trees.size > maxEntries) {
      const oldest = trees.keys().next().value;
      if (oldest === undefined) break;
      trees.delete(oldest);
    }
  };

  return harden({
    getTree: (name, version) => {
      const key = treeKey(name, version);
      const entry = trees.get(key);
      if (entry !== undefined) touch(key);
      return entry;
    },
    putTree: entry => {
      const key = treeKey(entry.name, entry.version);
      trees.delete(key);
      trees.set(key, harden({ ...entry }));
      evictIfNeeded();
    },
    getManifest: name => manifests.get(name),
    putManifest: (name, versions) => {
      manifests.set(name, harden([...versions]));
    },
    list: prefix => {
      const results = [];
      for (const entry of trees.values()) {
        if (prefix === undefined || entry.name.startsWith(prefix)) {
          results.push({ name: entry.name, version: entry.version });
        }
      }
      results.sort((a, b) =>
        treeKey(a.name, a.version) < treeKey(b.name, b.version) ? -1 : 1,
      );
      return results;
    },
  });
};

// #endregion

// #region MVS resolver + EndoRegistry exo

/**
 * The side-effecting operations the resolver depends on.  The JS backend
 * (`makeDaemonRegistryBackend`) wires these to registry HTTP + tarball → CAS
 * check-in; test doubles wire them to an in-memory registry.
 *
 * @typedef {object} RegistryBackend
 * @property {(name: string) => Promise<string[] | undefined>} fetchVersions
 *   Published versions for a package, or `undefined` if the package is not
 *   on the configured registry.  May reject with a network error.
 * @property {(name: string, version: string) => Promise<{ treeRef: unknown, integrity: string }>} provideTree
 *   Fetch the exact `(name, version)` tarball, verify its bytes against the
 *   registry's published integrity, check it into the CAS, and return the
 *   readable-tree capability.  Rejects with a tampered/network error.
 * @property {(treeRef: unknown) => Promise<Uint8Array>} readPackageJson
 *   Read the `package.json` bytes out of a resolved tree.
 * @property {(workspaceRoot: unknown, name: string) => Promise<Uint8Array | undefined>} [readWorkspaceMemberPackageJson]
 *   Read a workspace member's `package.json` from the enclosing workspace
 *   root, or `undefined` when the member is absent.
 * @property {(text: string) => string} sha256Hex
 *   Content hash used to derive `resolutionHash`.
 */

/**
 * @param {Uint8Array | string} bytesOrText
 * @returns {any}
 */
const parsePackageJson = bytesOrText => {
  const text =
    typeof bytesOrText === 'string' ? bytesOrText : bytesToText(bytesOrText);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const cause = /** @type {Error} */ (err);
    throw makeError(X`registry: package.json is not valid JSON`, undefined, {
      cause,
    });
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw makeError(X`registry: package.json must be an object`);
  }
  return parsed;
};

const WORKSPACE_PREFIX = 'workspace:';

/** @param {string} range */
const isWorkspaceSpecifier = range =>
  typeof range === 'string' && range.startsWith(WORKSPACE_PREFIX);

/**
 * Walk a `package.json`'s dependency maps.  `dependencies` and
 * `optionalDependencies` become resolvable frontier edges;
 * `peerDependencies` become requirements the resolved closure must later
 * satisfy but are *not* themselves installed (npm's peer semantics).
 *
 * @param {Array<{ name: string, range: string, source: string, importer: string }>} frontier
 * @param {Array<{ importer: string, name: string, range: string }>} peerRequirements
 * @param {any} packageJson
 * @param {string} importer
 */
const enqueueAllDependencies = (
  frontier,
  peerRequirements,
  packageJson,
  importer,
) => {
  const optional = packageJson.optionalDependencies ?? {};
  /** @type {Array<[string, string]>} */
  const installSources = [
    ['dependencies', 'dependencies'],
    ['optionalDependencies', 'optionalDependencies'],
  ];
  for (const [field, source] of installSources) {
    const deps = packageJson[field];
    if (typeof deps === 'object' && deps !== null) {
      for (const [name, range] of Object.entries(deps)) {
        // An entry that also appears under optionalDependencies is optional
        // regardless of which map we are walking (npm's own rule).
        const effectiveSource =
          field === 'dependencies' && Object.hasOwn(optional, name)
            ? 'optionalDependencies'
            : source;
        const rangeText = /** @type {string} */ (range);
        frontier.push({
          name,
          range: rangeText,
          source: effectiveSource,
          importer,
        });
      }
    }
  }
  const peers = packageJson.peerDependencies;
  if (typeof peers === 'object' && peers !== null) {
    for (const [name, range] of Object.entries(peers)) {
      const rangeText = /** @type {string} */ (range);
      peerRequirements.push({
        importer,
        name,
        range: rangeText,
      });
    }
  }
};

/**
 * Construct the `EndoRegistry` exo over a backend and a table.
 *
 * @param {RegistryBackend} backend
 * @param {{ table?: RegistryTable, registryUrl?: string }} [options]
 */
export const makeEndoRegistry = (backend, options = {}) => {
  const {
    table = makeRegistryTable(),
    registryUrl = 'https://registry.npmjs.org',
  } = options;

  /**
   * Published versions for a package, consulting the table first.
   *
   * @param {string} name
   * @param {boolean} offline
   * @returns {Promise<string[]>}
   */
  const versionsFor = async (name, offline) => {
    const cached = table.getManifest(name);
    if (cached !== undefined) return cached;
    if (offline) {
      throw makeRegistryOfflineError(
        X`registry: offline and no cached versions for ${q(name)}`,
      );
    }
    let versions;
    try {
      versions = await backend.fetchVersions(name);
    } catch (cause) {
      throw makeRegistryNetworkError(
        X`registry: failed to fetch versions for ${q(name)} from ${q(
          registryUrl,
        )}`,
        { cause },
      );
    }
    if (versions === undefined) {
      throw makeRegistryMissingPackageError(
        X`registry: package ${q(name)} is not published on ${q(registryUrl)}`,
      );
    }
    table.putManifest(name, versions);
    return versions;
  };

  /**
   * Resolve `(name, version)` to a CAS tree, consulting the table first.
   * A table hit is a cache hit; a miss re-fetches (transparent refetch).
   *
   * @param {string} name
   * @param {string} version
   * @param {boolean} offline
   * @returns {Promise<RegistryTreeEntry>}
   */
  const provideTree = async (name, version, offline) => {
    const cached = table.getTree(name, version);
    if (cached !== undefined) return cached;
    if (offline) {
      throw makeRegistryOfflineError(
        X`registry: offline and ${q(`${name}@${version}`)} is not in the table`,
      );
    }
    let result;
    try {
      result = await backend.provideTree(name, version);
    } catch (cause) {
      // A tampered-tarball rejection is already tagged; propagate it as-is
      // so callers see `RegistryTamperedError` rather than a network wrap.
      if (cause instanceof Error && cause.name === RegistryTamperedErrorName) {
        throw cause;
      }
      throw makeRegistryNetworkError(
        X`registry: failed to fetch ${q(`${name}@${version}`)} from ${q(
          registryUrl,
        )}`,
        { cause },
      );
    }
    /** @type {RegistryTreeEntry} */
    const entry = harden({
      name,
      version,
      treeRef: result.treeRef,
      integrity: result.integrity,
    });
    table.putTree(entry);
    return entry;
  };

  /**
   * @param {string | Uint8Array} packageJson  UTF-8/JSON text (the passable
   *   capability-boundary shape) or bytes (accepted for in-process callers).
   * @param {{ offline?: boolean, workspaceRoot?: unknown }} [resolveOptions]
   */
  const resolve = async (packageJson, resolveOptions = {}) => {
    const { offline = false, workspaceRoot } = resolveOptions;
    const root = parsePackageJson(packageJson);
    const rootName = typeof root.name === 'string' ? root.name : '<entry>';

    /** @type {Array<{ name: string, range: string, source: string, importer: string }>} */
    const frontier = [];
    /** @type {Array<{ importer: string, name: string, range: string }>} */
    const peerRequirements = [];
    enqueueAllDependencies(frontier, peerRequirements, root, rootName);

    /** @type {Map<string, Map<number, RegistryTreeEntry>>} */
    const resolved = new Map();
    /** @type {Array<{ importer: string, name: string, range: string }>} */
    const unmetOptionals = [];
    /** @type {Array<{ importer: string, name: string, version: string, range: string }>} */
    const diagnostics = [];

    /**
     * @param {string} name
     * @param {number} major
     * @param {RegistryTreeEntry} entry
     */
    const upsert = (name, major, entry) => {
      let byMajor = resolved.get(name);
      if (byMajor === undefined) {
        byMajor = new Map();
        resolved.set(name, byMajor);
      }
      byMajor.set(major, entry);
    };

    /**
     * Resolve one frontier edge, mutating `resolved` / `frontier` /
     * `peerRequirements` / diagnostics.  Early returns stand in for the
     * `continue` the house style forbids.
     *
     * @param {{ name: string, range: string, source: string, importer: string }} edge
     */
    const processEdge = async edge => {
      const { name, range, source, importer } = edge;

      if (isWorkspaceSpecifier(range)) {
        if (backend.readWorkspaceMemberPackageJson === undefined) {
          throw makeError(
            X`registry: workspace dependency ${q(
              name,
            )} declared but this backend cannot read workspace members`,
          );
        }
        const memberBytes = await backend.readWorkspaceMemberPackageJson(
          workspaceRoot,
          name,
        );
        if (memberBytes === undefined) {
          throw makeRegistryMissingPackageError(
            X`registry: workspace dependency ${q(
              name,
            )} not found in the enclosing workspace root`,
          );
        }
        const memberPj = parsePackageJson(memberBytes);
        const memberVersion =
          typeof memberPj.version === 'string' ? memberPj.version : '0.0.0';
        // Workspace members carry no version segment and short-circuit
        // version selection; the on-disk member always wins.  Flag a
        // diagnostic when it does not satisfy the importer's declared range.
        const specifierRange = range.slice(WORKSPACE_PREFIX.length);
        if (
          specifierRange !== '' &&
          specifierRange !== '*' &&
          specifierRange !== '^' &&
          specifierRange !== '~' &&
          !satisfies(memberVersion, specifierRange)
        ) {
          diagnostics.push({ importer, name, version: memberVersion, range });
        }
        // A workspace member is keyed under its own major but pins the
        // on-disk version regardless of predicates from other importers.
        const memberMajor = parseVersion(memberVersion)?.major ?? 0;
        if (resolved.get(name)?.get(memberMajor) === undefined) {
          upsert(
            name,
            memberMajor,
            harden({
              name,
              version: memberVersion,
              treeRef: undefined,
              integrity: '',
            }),
          );
          enqueueAllDependencies(frontier, peerRequirements, memberPj, name);
        }
        return;
      }

      const major = rangeMajor(range);
      const existing = resolved.get(name)?.get(major);

      /** @type {string | undefined} */
      let candidateVersion;
      try {
        const versions = await versionsFor(name, offline);
        candidateVersion = minSatisfying(versions, range);
        if (candidateVersion === undefined) {
          throw makeRegistryMissingPackageError(
            X`registry: no published version of ${q(name)} satisfies ${q(
              range,
            )} (required by ${q(importer)})`,
          );
        }
      } catch (err) {
        if (source === 'optionalDependencies') {
          // Optional misses are silent at the graph level.
          unmetOptionals.push({ importer, name, range });
          return;
        }
        throw err;
      }

      const candidate = parseVersion(candidateVersion);
      if (
        existing !== undefined &&
        candidate !== undefined &&
        compareVersions(
          parseVersion(existing.version) ?? candidate,
          candidate,
        ) >= 0
      ) {
        // A greater-or-equal selection for this major already stands; MVS
        // keeps it.
        return;
      }

      const entry = await provideTree(name, candidateVersion, offline);
      upsert(name, major, entry);

      const childBytes = await backend.readPackageJson(entry.treeRef);
      const childPj = parsePackageJson(childBytes);
      enqueueAllDependencies(
        frontier,
        peerRequirements,
        childPj,
        `${name}@${entry.version}`,
      );
    };

    while (frontier.length > 0) {
      const edge = /** @type {(typeof frontier)[number]} */ (frontier.shift());
      await processEdge(edge);
    }

    // Peer cross-check: every recorded peer requirement must be satisfied by
    // some entry in the resolved closure within its declared range.
    for (const { importer, name, range } of peerRequirements) {
      const byMajor = resolved.get(name);
      const satisfied =
        byMajor !== undefined &&
        [...byMajor.values()].some(entry => satisfies(entry.version, range));
      if (!satisfied) {
        throw makeRegistryMissingPackageError(
          X`registry: ${q(importer)} declares unmet peer dependency ${q(
            name,
          )}@${q(range)}`,
        );
      }
    }

    return buildRegistryResolution(resolved, {
      unmetOptionals,
      diagnostics,
      sha256Hex: backend.sha256Hex,
    });
  };

  const help = () =>
    [
      'EndoRegistry brokers npm-style package resolution and tarball fetch',
      'against the content-addressed store.  Methods:',
      '  resolve(packageJson, options?) -> RegistryResolution',
      '  fetch(name, version) -> readable-tree capability',
      '  lookup(name, version) -> readable-tree capability | undefined',
      '  list(prefix?) -> [{ name, version }]',
      `Configured registry: ${registryUrl}`,
    ].join('\n');

  const registry = makeExo(
    'EndoRegistry',
    RegistryInterface,
    /** @type {any} */ ({
      resolve: (packageJson, resolveOptions) =>
        resolve(packageJson, resolveOptions),
      fetch: async (name, version) => {
        const entry = await provideTree(name, version, false);
        return entry.treeRef;
      },
      lookup: async (name, version) => {
        const entry = table.getTree(name, version);
        return entry?.treeRef;
      },
      list: async prefix => harden(table.list(prefix)),
      help,
    }),
  );

  return registry;
};

/**
 * Flatten the `(name, major) -> selection` map into the `RegistryResolution`
 * shape the capability returns.
 *
 * @param {Map<string, Map<number, RegistryTreeEntry>>} resolved
 * @param {{
 *   unmetOptionals: Array<{ importer: string, name: string, range: string }>,
 *   diagnostics: Array<{ importer: string, name: string, version: string, range: string }>,
 *   sha256Hex: (text: string) => string,
 * }} extra
 */
const buildRegistryResolution = (resolved, extra) => {
  /** @type {Record<string, { name: string, version: string, treeRef: unknown, integrity: string }>} */
  const packagesByKey = {};
  /** @type {string[]} */
  const keys = [];
  for (const byMajor of resolved.values()) {
    for (const entry of byMajor.values()) {
      const key = `${entry.name}@${entry.version}`;
      // The same concrete version can be selected under two range-major
      // buckets (e.g. an open-ended `*` importer bucketed under major 0 and a
      // `^2.0.0` importer bucketed under major 2 both resolving to `2.5.0`), so
      // guard against emitting a duplicate key into `keys` and the
      // resolutionHash preimage.
      if (packagesByKey[key] === undefined) {
        keys.push(key);
      }
      packagesByKey[key] = {
        name: entry.name,
        version: entry.version,
        treeRef: entry.treeRef,
        integrity: entry.integrity,
      };
    }
  }
  keys.sort();
  const canonical = JSON.stringify(
    keys.map(key => [key, packagesByKey[key].integrity]),
  );
  const resolutionHash = extra.sha256Hex(canonical);
  return harden({
    packagesByKey,
    keys,
    resolutionHash,
    unmetOptionals: extra.unmetOptionals,
    diagnostics: extra.diagnostics,
  });
};

// #endregion

harden(makeEndoRegistry);
harden(makeRegistryTable);
