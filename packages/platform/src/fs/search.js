// @ts-check

/**
 * Platform-agnostic glob and grep engine, pushed down out of the daemon's
 * `EndoMount` (designs/platform-search-pushdown.md). The daemon reveals `glob`
 * and `grep` on a mount; this module *implements* them, once, over a narrow
 * read contract (`SearchPowers`), so every platform and every filesystem-shaped
 * consumer can share the one normative definition — and so a platform that has
 * a faster native walk (a Rust `hostGlob` under the XS supervisor) can
 * substitute one behind the same seam.
 *
 * The engine is the single normative definition of the two dialects:
 *
 * - **glob**: the only metacharacters are `*` (matches within one path segment,
 *   including a leading dot, but never a `/`) and a whole-segment `**` (matches
 *   zero or more path segments, any depth). Every other character — `?`, `[`,
 *   `]`, `{`, `}`, `+`, … — is a literal, so callers escape nothing. Results are
 *   mount-relative `/`-joined paths sorted by UTF-16 code unit.
 * - **grep**: `regexSource` is an ECMA-262 regular-expression source evaluated
 *   flagless (`new RegExp(regexSource)`). Each match record is
 *   `{ file, line, text }` with 1-based line numbers and a trailing `\r`
 *   stripped from each line (CRLF normalization).
 *
 * Both surfaces are async generators of **batches**: batching is intrinsic to
 * the engine, not an optimization bolted on at a future stream layer. The eager
 * `Promise<Array>` surface the daemon exposes today is a flatten-and-cap
 * collector over these generators; a future exo-stream surface is
 * `readerFromIterator` over the same generators. Because both surfaces draw from
 * one generator, they cannot drift. The *flattened* sequence order is normative
 * (sorted for glob, path-then-line order for grep); **batch boundaries are not
 * semantic** — a consumer must not depend on how results group, and a producer
 * may flush a short batch early (e.g. a smaller first batch for
 * time-to-first-result). Parity tests always compare flattened sequences.
 *
 * Enforcement inputs are declarative *data*, not callbacks: `deniedSegments` is
 * an array of (lowercased) restricted segment names and `confinementRoot` is a
 * path. The engine applies denial *during* the walk (a denied directory is
 * never descended into) and never follows a path out of the confinement root
 * (symlinks are resolved and a resolved path outside the root is excluded;
 * confinement by construction). Declarative inputs are what let the identical
 * contract cross a native seam as plain data — a per-entry callback would pin
 * the walk to JavaScript forever.
 */

/* eslint-disable no-await-in-loop, no-continue */

import harden from '@endo/harden';

/** @import { SearchPowers, Search, GlobOptions, GrepOptions, GrepMatch } from './search.types.js' */

/**
 * The default number of results carried in one batch. Chosen small so a future
 * streaming surface delivers a first batch promptly; the eager surface flattens
 * batches and so is insensitive to it. Clamped to `[1, MAX_BATCH_SIZE]`.
 *
 * @type {number}
 */
export const DEFAULT_BATCH_SIZE = 64;

/**
 * The ceiling on `batchSize`. A batch is one CapTP message on the future
 * streaming surface, so an unbounded batch would defeat the incremental
 * delivery batching exists to provide.
 *
 * @type {number}
 */
export const MAX_BATCH_SIZE = 1024;

/**
 * The maximum number of paths the eager `glob()` collector returns. It is the
 * daemon collector's cap, surfaced here as the canonical constant so the daemon
 * and any parity runner agree. The engine generators themselves are *unbounded*
 * (the streaming surface is the durable answer to result sets this large; a
 * consumer bounds a stream by closing it).
 *
 * @type {number}
 */
export const GLOB_MAX_RESULTS = 10_000;

/**
 * The default cap on the eager `grep()` collector's match count.
 *
 * @type {number}
 */
export const GREP_MAX_RESULTS = 1000;

/**
 * @param {number | undefined} batchSize
 * @returns {number}
 */
const clampBatchSize = batchSize => {
  if (batchSize === undefined) {
    return DEFAULT_BATCH_SIZE;
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    return 1;
  }
  return Math.min(batchSize, MAX_BATCH_SIZE);
};

/**
 * Build a lowercased lookup set from the declarative `deniedSegments` array. The
 * caller supplies segment names; matching is case-insensitive, so we lowercase
 * both the set entries here and each candidate name at the comparison site.
 *
 * @param {Iterable<string> | undefined} deniedSegments
 * @returns {Set<string> | undefined}
 */
const toDenySet = deniedSegments => {
  if (deniedSegments === undefined) {
    return undefined;
  }
  const set = new Set();
  for (const segment of deniedSegments) {
    set.add(segment.toLowerCase());
  }
  return set;
};

/**
 * @param {Set<string> | undefined} denySet
 * @param {string} name
 * @returns {boolean}
 */
const isDeniedName = (denySet, name) =>
  denySet !== undefined && denySet.has(name.toLowerCase());

/**
 * Compile one glob pattern segment into a matcher over a single
 * directory-entry name. `*` matches zero or more characters within the one
 * segment and never a `/`; a run of consecutive `*` collapses to the same
 * wildcard. Every other character — including `?`, `[`, `]`, `{`, `}`, and
 * `+` — is a literal. `*` deliberately matches leading-dot names, a documented
 * divergence from POSIX glob.
 *
 * Matching is a linear greedy scan with a single star-backtrack, never a
 * backtracking `RegExp`. Because the pattern is caller controlled, a
 * `literal[^/]*literal[^/]*…` regex would be a catastrophic-backtracking (ReDoS)
 * hazard: an input such as `a*a*a*a*a*a*a*a*a*a*a` matched against one
 * `NAME_MAX`-length entry could block the (synchronous) matcher for minutes. The
 * two-pointer matcher below is O(n·m) worst case with no exponential blow-up,
 * and — carrying no engine-specific regex semantics — is trivially reproducible
 * by a Rust/XS parity runner.
 *
 * @param {string} segment
 * @returns {(name: string) => boolean}
 */
export const compileGlobSegment = segment => {
  const segLen = segment.length;
  return name => {
    const nameLen = name.length;
    let n = 0; // next unmatched index into `name`
    let s = 0; // next unmatched index into `segment`
    let starAt = -1; // segment index just past the most recent `*`, or -1
    let matchFrom = 0; // how far that `*` has been allowed to consume `name`
    while (n < nameLen) {
      if (s < segLen && segment[s] === '*') {
        // Record the wildcard (consuming nothing yet) and try to match the
        // remainder greedily; backtrack here only if that fails.
        starAt = s;
        matchFrom = n;
        s += 1;
      } else if (s < segLen && segment[s] === name[n] && name[n] !== '/') {
        s += 1;
        n += 1;
      } else if (starAt !== -1 && name[matchFrom] !== '/') {
        // Let the most recent `*` consume one more character of `name`. `*`
        // never spans a `/`, matching the documented single-segment semantics.
        s = starAt + 1;
        matchFrom += 1;
        n = matchFrom;
      } else {
        return false;
      }
    }
    // Any unmatched trailing pattern must be all `*` (each matching empty).
    while (s < segLen && segment[s] === '*') {
      s += 1;
    }
    return s === segLen;
  };
};
harden(compileGlobSegment);

/**
 * Split a glob pattern into segments, dropping empty segments so `src//x`
 * equals `src/x` and a trailing slash is ignored. A pattern with no segments
 * throws: the empty pattern is not a match-everything wildcard.
 *
 * @param {string} pattern
 * @returns {string[]}
 */
export const parseGlobPattern = pattern => {
  const rawSegments = pattern.split('/').filter(segment => segment !== '');
  if (rawSegments.length === 0) {
    throw new Error('glob pattern must have at least one non-empty segment');
  }
  // Collapse runs of consecutive `**` to a single `**`. `a/**/**/b` matches
  // exactly what `a/**/b` matches — zero-or-more segments, repeated, is still
  // zero-or-more — so the coalesce is semantics-preserving, and it removes the
  // redundant re-traversal that a purely stacked `**/**/**/…` would otherwise
  // drive from every tree position (a caller-controlled super-linear blow-up).
  // The per-`(dir, remaining)` memo in the walk bounds the interleaved case
  // (`**/x/**`); this coalesce handles the pure-stacked case at parse time.
  const segments = rawSegments.filter(
    (segment, index) => !(segment === '**' && rawSegments[index - 1] === '**'),
  );
  return segments;
};
harden(parseGlobPattern);

/**
 * Whether `regexSource` is inside the conservative subset a non-ECMA-262 native
 * regex engine (e.g. the Rust `regex` crate under the XS supervisor) can be
 * trusted to evaluate identically. The subset is literals, character classes,
 * anchors, alternation, grouping, and bounded quantifiers; it excludes the
 * ECMA-262-specific constructs a native engine either lacks or evaluates with
 * different corner semantics — lookaround, backreferences, named groups, and
 * Unicode property escapes.
 *
 * This is the seam the future native-grep pushdown (a follow-up layer, not this
 * stack) consults: `provideSearch` on a platform with a native grep evaluates
 * the pattern here and falls back to the normative JS engine for anything
 * outside the subset. It is deliberately an implementation-defined allowlist
 * rather than a pinned grammar until that follow-up forces precision; when in
 * doubt it answers `false` (JS is always a safe fallback).
 *
 * @param {string} regexSource
 * @returns {boolean}
 */
export const isConservativeRegex = regexSource => {
  // Reject the constructs a portable native engine cannot be trusted to mirror.
  // Each is matched on the raw source; a false negative only costs a JS
  // fallback, never correctness.
  const nonPortable = [
    /\(\?[=!]/, // lookahead (?= (?!
    /\(\?<[=!]/, // lookbehind (?<= (?<!
    /\(\?<[A-Za-z_$]/, // named capture group (?<name>
    /\\k</, // named backreference \k<name>
    /\\[1-9]/, // numeric backreference \1 … \9
    /\\[pP]\{/, // Unicode property escape \p{…} \P{…}
  ];
  return !nonPortable.some(re => re.test(regexSource));
};
harden(isConservativeRegex);

/**
 * Resolve `path` to its symlink-free physical path, or `undefined` when it
 * cannot be resolved (removed mid-walk, broken symlink). Used both to detect
 * symlink cycles by physical identity and to enforce confinement, without
 * aborting the whole walk on a transient error.
 *
 * @param {SearchPowers} powers
 * @param {string} path
 * @returns {Promise<string | undefined>}
 */
const maybeRealPath = async (powers, path) => {
  await null;
  try {
    return await powers.maybeRealPath(path);
  } catch {
    return undefined;
  }
};

/**
 * Whether `realPath` (an already-resolved physical path, or `undefined`) is
 * contained within the resolved confinement root. An unresolvable path is never
 * confined. A missing (`undefined`) confinement root confines nothing.
 *
 * @param {string | undefined} realPath
 * @param {string | undefined} confinementRootReal
 * @returns {boolean}
 */
const isWithin = (realPath, confinementRootReal) => {
  if (realPath === undefined || confinementRootReal === undefined) {
    return false;
  }
  return (
    realPath === confinementRootReal ||
    realPath.startsWith(`${confinementRootReal}/`)
  );
};

/**
 * Create a search engine over a narrow read `powers` contract. The engine holds
 * no ambient authority; `root` and `confinementRoot` are passed per call.
 *
 * @param {SearchPowers} powers
 * @returns {Search}
 */
export const makeSearch = powers => {
  /**
   * Enumerate the paths under `root` matching a glob `pattern`, yielded as
   * UTF-16-sorted batches of mount-relative `/`-joined paths. Denied names are
   * never enumerated even when matched literally, and entries that escape the
   * confinement root (symlinks out of it) are silently excluded. Directories
   * are included unless `includeDirectories` is `false`.
   *
   * Glob's sort forces the full result set to be collected before the first
   * batch: the flattened order is normative, so a partially-walked prefix
   * cannot be emitted in sorted order. The generator is nonetheless the shared
   * core — the eager surface flattens-and-caps it, the future stream surface
   * reads it.
   *
   * @param {string} root
   * @param {string} pattern
   * @param {GlobOptions} [options]
   * @returns {AsyncGenerator<string[]>}
   */
  async function* globPaths(root, pattern, options = {}) {
    const {
      deniedSegments,
      confinementRoot = root,
      batchSize,
      includeDirectories = true,
    } = options;
    await null;
    const batchLimit = clampBatchSize(batchSize);
    const denySet = toDenySet(deniedSegments);
    const patternSegments = parseGlobPattern(pattern);
    const confinementRootReal = await maybeRealPath(powers, confinementRoot);

    /** @type {Set<string>} */
    const results = new Set();

    /**
     * `(remaining-suffix-length, dir)` pairs already walked. A pair yields the
     * same results every time it is reached, so re-walking one is pure
     * redundant work; memoizing bounds the whole walk to O(nodes · segments),
     * collapsing the super-linear re-traversal that stacked or interleaved `**`
     * segments would otherwise drive from every position.
     *
     * @type {Set<string>}
     */
    const visited = new Set();

    /**
     * `ancestorsReal` carries the symlink-free physical paths of `dir` and every
     * directory on the descent path above it, so a `**` descent that would
     * re-enter one of them (a symlink cycle inside the confined root) is
     * skipped and the walk terminates on cyclic trees.
     *
     * @param {string} childPath
     * @returns {Promise<{ real: string | undefined, confined: boolean }>}
     */
    const resolveChild = async childPath => {
      await null;
      const real = await maybeRealPath(powers, childPath);
      return { real, confined: isWithin(real, confinementRootReal) };
    };

    /**
     * Record a final match, honoring `includeDirectories`.
     *
     * @param {string[]} prefix
     * @param {string} childPath
     * @returns {Promise<void>}
     */
    const addResult = async (prefix, childPath) => {
      await null;
      if (!includeDirectories && (await powers.isDirectory(childPath))) {
        return;
      }
      results.add(prefix.join('/'));
    };

    /**
     * @param {string[]} remaining
     * @param {string} dir
     * @param {string[]} prefix
     * @param {Set<string>} ancestorsReal
     * @returns {Promise<void>}
     */
    const walk = async (remaining, dir, prefix, ancestorsReal) => {
      await null;
      const visitKey = `${remaining.length}\0${dir}`;
      if (visited.has(visitKey)) {
        return;
      }
      visited.add(visitKey);
      if (remaining.length === 0) {
        // The walk root itself (empty prefix) is never a result.
        if (prefix.length > 0) {
          results.add(prefix.join('/'));
        }
        return;
      }
      let names;
      try {
        names = await powers.readDirectory(dir);
      } catch {
        // A directory removed mid-walk drops this branch rather than aborting.
        return;
      }
      const [head, ...rest] = remaining;
      if (head === '**') {
        // `**` matches zero or more path segments. Zero consumed: continue
        // matching `rest` at the current directory (so `docs/**/*.md` still
        // matches `docs/*.md`). One or more consumed: descend into each confined
        // child directory with `**` still in play. A trailing `**` additionally
        // matches file descendants directly.
        await walk(rest, dir, prefix, ancestorsReal);
        for (const name of names) {
          if (isDeniedName(denySet, name)) {
            continue;
          }
          const childPath = powers.joinPath(dir, name);
          const { real, confined } = await resolveChild(childPath);
          if (!confined) {
            continue;
          }
          if (await powers.isDirectory(childPath)) {
            if (real !== undefined && !ancestorsReal.has(real)) {
              const descentAncestors = new Set([...ancestorsReal, real]);
              await walk(remaining, childPath, [...prefix, name], descentAncestors);
            } else if (rest.length === 0) {
              // A cyclic (or unresolvable) directory under a trailing `**` is
              // still a valid entry: recorded once, never re-entered.
              await addResult([...prefix, name], childPath);
            }
          } else if (rest.length === 0) {
            await addResult([...prefix, name], childPath);
          }
        }
        return;
      }
      const matches = compileGlobSegment(head);
      for (const name of names) {
        if (isDeniedName(denySet, name) || !matches(name)) {
          continue;
        }
        const childPath = powers.joinPath(dir, name);
        const { real, confined } = await resolveChild(childPath);
        if (!confined) {
          continue;
        }
        if (rest.length === 0) {
          await addResult([...prefix, name], childPath);
          continue;
        }
        // A non-final segment must descend, so it matches directories only.
        if (await powers.isDirectory(childPath)) {
          // A literal descent consumes a segment, so it cannot recurse without
          // bound; still extend the ancestor set so a later `**` sees this
          // directory's physical identity and detects a cycle.
          const nextAncestors =
            real === undefined
              ? ancestorsReal
              : new Set([...ancestorsReal, real]);
          await walk(rest, childPath, [...prefix, name], nextAncestors);
        }
      }
    };

    const rootReal = await maybeRealPath(powers, root);
    const initialAncestors = new Set(rootReal === undefined ? [] : [rootReal]);
    await walk(patternSegments, root, [], initialAncestors);

    // Sort by UTF-16 code unit (Array.prototype.sort's default string order) as
    // the final step so the flattened sequence is deterministic across
    // platforms — a native runner mirrors the sort, not the walk order.
    const sorted = [...results].sort();
    for (let i = 0; i < sorted.length; i += batchLimit) {
      yield harden(sorted.slice(i, i + batchLimit));
    }
  }
  harden(globPaths);

  /**
   * Normalize the `paths` argument to an async iterable of path *batches*.
   * `undefined` means every file under `root` (enumerated via `globPaths`
   * with directories excluded). An array (or promise of one) is a single batch.
   * An async iterable of batches passes through (the future glob→grep pipeline).
   *
   * @param {string} root
   * @param {GrepOptions} options
   * @param {Iterable<string> | Promise<Iterable<string>> | AsyncIterable<string[]> | undefined} paths
   * @returns {AsyncIterable<string[]>}
   */
  const pathBatches = (root, options, paths) => {
    if (paths === undefined) {
      return globPaths(root, '**', {
        deniedSegments: options.deniedSegments,
        confinementRoot: options.confinementRoot,
        batchSize: options.batchSize,
        includeDirectories: false,
      });
    }
    if (paths[Symbol.asyncIterator] !== undefined) {
      return /** @type {AsyncIterable<string[]>} */ (paths);
    }
    // An iterable or a promise of one becomes a single batch. `await`-ing a
    // non-promise is harmless; this is where a `Promise<Array>` from glob
    // pipelines into grep over CapTP.
    return (async function* single() {
      // Narrowed by the async-iterable check above to an iterable or a promise
      // of one; TS cannot see that through the index probe, so assert it.
      const resolved = /** @type {Iterable<string>} */ (await paths);
      yield [...resolved];
    })();
  };

  /**
   * Search the contents of `paths` (or every file under `root`) for
   * `regexSource`, yielding batches of `{ file, line, text }` match records in
   * path-then-line order. A path that is denied, escapes the confinement root,
   * is a directory, or is unreadable is skipped silently — the same envelope
   * grep already applies to unreadable files, and what makes glob-produced and
   * hand-supplied paths uniform. Unlike glob, grep needs no global sort, so it
   * streams incrementally.
   *
   * @param {string} root
   * @param {string} regexSource
   * @param {Iterable<string> | Promise<Iterable<string>> | AsyncIterable<string[]> | undefined} [paths]
   * @param {GrepOptions} [options]
   * @returns {AsyncGenerator<GrepMatch[]>}
   */
  async function* grepFiles(root, regexSource, paths, options = {}) {
    await null;
    const { deniedSegments, confinementRoot = root, maxResults, batchSize } =
      options;
    const batchLimit = clampBatchSize(batchSize);
    const denySet = toDenySet(deniedSegments);
    const confinementRootReal = await maybeRealPath(powers, confinementRoot);
    // ECMAScript RegExp source with no flags.
    const regex = new RegExp(regexSource);

    let count = 0;
    /** @type {GrepMatch[]} */
    let batch = [];

    const source = pathBatches(root, { ...options, confinementRoot }, paths);
    for await (const pathBatch of source) {
      for (const relPath of pathBatch) {
        if (maxResults !== undefined && count >= maxResults) {
          if (batch.length > 0) {
            yield harden(batch);
            batch = [];
          }
          return;
        }
        const segments = relPath.split('/').filter(segment => segment !== '');
        if (segments.some(segment => isDeniedName(denySet, segment))) {
          continue;
        }
        const filePath = powers.joinPath(root, ...segments);
        const real = await maybeRealPath(powers, filePath);
        if (!isWithin(real, confinementRootReal)) {
          continue;
        }
        if (await powers.isDirectory(filePath)) {
          continue;
        }
        let content;
        try {
          content = await powers.readFileText(filePath);
        } catch {
          // A file whose text read fails (binary the platform refuses to decode,
          // a permission error, a path that vanished mid-scan) is skipped.
          continue;
        }
        // Split on `\n`; a trailing `\r` is stripped so a CRLF file yields the
        // same match text a LF file would. Line numbers are 1-based.
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i += 1) {
          if (maxResults !== undefined && count >= maxResults) {
            break;
          }
          const text = lines[i].replace(/\r$/, '');
          if (regex.test(text)) {
            batch.push(harden({ file: relPath, line: i + 1, text }));
            count += 1;
            if (batch.length >= batchLimit) {
              yield harden(batch);
              batch = [];
            }
          }
        }
      }
    }
    if (batch.length > 0) {
      yield harden(batch);
    }
  }
  harden(grepFiles);

  return harden({ globPaths, grepFiles });
};
harden(makeSearch);

/**
 * Select a search engine for a set of file powers: the platform's native
 * `search` when it supplies one, else the normative JS engine over the generic
 * read powers. This is the one seam through which a platform substitutes a
 * faster native walk; where absent, the JS engine *is* the implementation.
 *
 * @param {import('./search.types.js').SearchFilePowers} filePowers
 * @returns {Search}
 */
export const provideSearch = filePowers => {
  if (filePowers.search !== undefined) {
    return filePowers.search;
  }
  return makeSearch({
    readDirectory: filePowers.readDirectory,
    isDirectory: filePowers.isDirectory,
    readFileText: filePowers.readFileText,
    joinPath: filePowers.joinPath,
    maybeRealPath: async path => {
      await null;
      try {
        return await filePowers.realPath(path);
      } catch {
        return undefined;
      }
    },
  });
};
harden(provideSearch);
