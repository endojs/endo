// @ts-check
/// <reference types="ses"/>

import { Buffer } from 'node:buffer';
import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import fs from 'node:fs';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';

import { q } from '@endo/errors';
import { makeExo } from '@endo/exo';
import { ReadableBlobInterface } from '@endo/platform/fs/lite';
import { GitTreeInterface } from '@endo/exo-git';

// `TextDecoder` is portable across XS, browsers, and SES realms;
// prefer it over `Buffer.from(...).toString('utf8')` per the project
// portability preference (root CLAUDE.md § Modernisms).
const utf8Decoder = new TextDecoder('utf-8', { fatal: false });

/**
 * @import {
 *   GitBackend,
 *   GitBackendDiffOptions,
 *   GitBackendLogOptions,
 *   GitBackendStashPushOptions,
 * } from '@endo/exo-git/src/git.js'
 * @import {
 *   GitCommit,
 *   GitCreateBranchOptions,
 *   GitDeleteBranchOptions,
 *   GitMergeOptions,
 *   GitRebaseInput,
 *   GitRef,
 *   GitRestoreOptions,
 * } from '@endo/exo-git/src/types.js'
 */

/**
 * @typedef {{ kind: 'bearer', material: { token: string } } | { kind: 'basic', material: { username: string, password: string } }} NativeGitCredential
 */

const execFileAsync = promisify(execFile);

const gitNullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';

// Every git invocation prepends these.  Together with the sanitized
// environment below, they neutralize the configuration surfaces a
// committed-in `.git/config` or repository-local hook could otherwise
// use to execute code or fork-attack the daemon.
const GIT_BASE_ARGS = harden([
  // No pager (stdin would otherwise wait for a terminal).
  '--no-pager',
  // Treat pathspecs literally; no glob expansion in our internal calls.
  '--literal-pathspecs',
  // Suppress hooks.
  '-c',
  'core.hooksPath=/dev/null',
  // Suppress filesystem-monitor helpers (they can exec a binary).
  '-c',
  'core.fsmonitor=false',
  // No `.gitattributes` filtering (textconv, filter drivers).
  '-c',
  'core.attributesFile=/dev/null',
  // No commit / tag signing prompts.
  '-c',
  'commit.gpgSign=false',
  '-c',
  'tag.gpgSign=false',
  // Suppress ambient credential helpers.  A blank helper resets the
  // helper list; credentialed remote calls use the daemon askpass helper.
  '-c',
  'credential.helper=',
]);
// Note: diff.external is suppressed per-command via `--no-ext-diff`
// (see `diff`).  Setting it as a -c override resolves to empty-string
// which git tries to exec, producing "external diff died".

const GIT_TIMEOUT_MS = 60_000;
const GIT_MAX_BUFFER = 1024 * 1024;
const TOOL_OUTPUT_LIMIT = 50_000;
const MIN_GIT_VERSION = harden([2, 30, 0]);
const GIT_ASKPASS_FD = 3;
const gitAskpassHelperPath = fileURLToPath(
  new URL('git-askpass-helper.cjs', import.meta.url),
);

/**
 * Parse `git --version` output into a numeric tuple.
 *
 * @param {string} output
 * @returns {[number, number, number] | undefined}
 */
const parseGitVersion = output => {
  const match = output.match(/\bgit version (\d+)\.(\d+)(?:\.(\d+))?/u);
  if (!match) {
    return undefined;
  }
  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    match[3] === undefined ? 0 : Number.parseInt(match[3], 10),
  ];
};
harden(parseGitVersion);

/**
 * @param {readonly number[]} left
 * @param {readonly number[]} right
 */
const compareVersion = (left, right) => {
  for (let i = 0; i < 3; i += 1) {
    const delta = (left[i] || 0) - (right[i] || 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
};
harden(compareVersion);

/**
 * Throws when the system git binary is older than the native backend's
 * documented floor.
 *
 * @param {string} output
 */
const assertSupportedGitVersion = output => {
  const version = parseGitVersion(output);
  if (!version) {
    throw new Error(`Could not parse git version from ${q(output.trim())}`);
  }
  if (compareVersion(version, MIN_GIT_VERSION) < 0) {
    throw new Error(
      `NativeGitBackend requires git >= ${MIN_GIT_VERSION.join(
        '.',
      )}, got ${version.join('.')}`,
    );
  }
};
harden(assertSupportedGitVersion);

/**
 * Sanitized environment for every git invocation.  Removes ambient
 * configuration channels (`HOME` config, global config, system config,
 * credential helpers) without losing the PATH the daemon was launched
 * with — without PATH, exec finds no `git` at all.
 *
 * @param {string} repoRoot
 */
const makeGitEnv = repoRoot => ({
  PATH: process.env.PATH || '',
  // Anchor HOME / XDG inside the worktree at a daemon-managed
  // subdirectory that does not yet contain anything; git will not
  // read or write user-level config through it.
  HOME: `${repoRoot}/.git-endo-home`,
  XDG_CONFIG_HOME: `${repoRoot}/.git-endo-home`,
  // Disable the system config file (typically /etc/gitconfig).
  GIT_CONFIG_NOSYSTEM: '1',
  // Redirect the global config to the null device.
  GIT_CONFIG_GLOBAL: gitNullDevice,
  // No interactive prompts.
  GIT_TERMINAL_PROMPT: '0',
  // Suppress the opportunistic index refresh that read commands
  // (status, diff) otherwise perform.  Without this, a "read-only"
  // inspection rewrites `.git/index` metadata as a side effect and
  // fails outright on a genuinely read-only filesystem.  Mutating
  // commands take their real locks regardless of this flag, so it is
  // safe to set for every invocation.
  GIT_OPTIONAL_LOCKS: '0',
  // Force the pager to a passthrough.
  GIT_PAGER: 'cat',
  // Stable locale for deterministic parsing.
  LANG: 'C',
  LC_ALL: 'C',
  // Default commit identity.  A daemon-managed guest agent that has
  // its own identity will override these per-invocation; without a
  // default, `git commit` fails with "Please tell me who you are".
  GIT_AUTHOR_NAME: 'Endo',
  GIT_AUTHOR_EMAIL: 'endo@invalid.local',
  GIT_COMMITTER_NAME: 'Endo',
  GIT_COMMITTER_EMAIL: 'endo@invalid.local',
});

/**
 * @param {Record<string, string>} baseEnv
 * @param {Record<string, string>} [overrides]
 */
const withGitEnvOverrides = (baseEnv, overrides = harden({})) =>
  harden({ ...baseEnv, ...overrides });
harden(withGitEnvOverrides);

/**
 * Limits the bytes one tool call's output can balloon to, so a runaway
 * `git log` cannot fill the worker's CapTP buffer.
 *
 * @param {string} output
 * @returns {string}
 */
const truncateOutput = output => {
  if (output.length > TOOL_OUTPUT_LIMIT) {
    return `${output.slice(0, TOOL_OUTPUT_LIMIT)}\n\n... (truncated, ${output.length} chars total)`;
  }
  return output;
};

/**
 * Find the porcelain command name in an argv vector that may include
 * command-scoped `-c key=value` config pairs before the command.
 *
 * @param {readonly string[]} args
 */
const gitCommandName = args => {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-c') {
      index += 1;
    } else if (!arg.startsWith('-')) {
      return arg;
    }
  }
  return args[0] || 'git';
};
harden(gitCommandName);

/**
 * Reject empty, non-string, or NUL-containing values at the public
 * boundary so they cannot reach exec arguments.
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string}
 */
const requireNonEmptyString = (value, fieldName) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  if (value.includes('\0')) {
    throw new Error(`${fieldName} must not contain NUL bytes`);
  }
  return value;
};
harden(requireNonEmptyString);

/**
 * Askpass responses are newline-delimited records on an inherited pipe.
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string}
 */
const requireAskpassLine = (value, fieldName) => {
  const text = requireNonEmptyString(value, fieldName);
  if (text.includes('\n') || text.includes('\r')) {
    throw new Error(`${fieldName} must not contain line breaks`);
  }
  return text;
};
harden(requireAskpassLine);

// Role tags for the askpass credential records. One byte each; mirrored in
// git-askpass-helper.cjs.
const ROLE_USERNAME = 0x55; // 'U'
const ROLE_PASSWORD = 0x50; // 'P'

/**
 * Frame a credential value as a role-tagged, length-prefixed record:
 * role-byte (1) | length (4-byte big-endian uint32) | value-bytes (length).
 * The helper reads the whole record set and selects by role per the prompt git
 * issues, rather than relying on a fixed username-then-password queue order.
 *
 * @param {number} role
 * @param {string} value
 * @returns {Buffer}
 */
const encodeCredentialRecord = (role, value) => {
  const valueBytes = Buffer.from(value, 'utf8');
  const header = Buffer.alloc(5);
  header[0] = role;
  header.writeUInt32BE(valueBytes.length, 1);
  return Buffer.concat([header, valueBytes]);
};
harden(encodeCredentialRecord);

/**
 * Encode the username and password as the role-tagged record set the askpass
 * helper consumes.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Buffer}
 */
const encodeCredentialRecords = (username, password) =>
  Buffer.concat([
    encodeCredentialRecord(ROLE_USERNAME, username),
    encodeCredentialRecord(ROLE_PASSWORD, password),
  ]);
harden(encodeCredentialRecords);

/**
 * Validate a remote credential and frame it as the role-tagged record set the
 * askpass helper consumes. Returns `undefined` when no credential is supplied
 * (the caller then runs git without the askpass pipe).
 *
 * @param {unknown} credential
 * @returns {Buffer | undefined}
 */
const credentialBytesFor = credential => {
  if (credential === undefined) {
    return undefined;
  }
  const nativeCredential = /** @type {NativeGitCredential} */ (credential);
  /** @type {string} */
  let username;
  /** @type {string} */
  let password;
  if (nativeCredential.kind === 'bearer') {
    username = 'x-access-token';
    password = requireAskpassLine(
      nativeCredential.material?.token,
      'remote credential token',
    );
  } else if (nativeCredential.kind === 'basic') {
    username = requireAskpassLine(
      nativeCredential.material?.username,
      'remote credential username',
    );
    password = requireAskpassLine(
      nativeCredential.material?.password,
      'remote credential password',
    );
  } else {
    throw new Error('Unsupported remote credential kind');
  }

  return encodeCredentialRecords(username, password);
};
harden(credentialBytesFor);

/**
 * Revision arguments must additionally not start with `-` — git would
 * otherwise interpret them as flags.
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string}
 */
const requireRevision = (value, fieldName) => {
  const revision = requireNonEmptyString(value, fieldName);
  if (revision.startsWith('-')) {
    throw new Error(`${fieldName} must not start with "-"`);
  }
  return revision;
};

/**
 * Git tree path segments are selectors into an immutable commit tree.
 * Reject traversal and separator-bearing names so a caller cannot smuggle
 * options or multi-segment paths through one segment.
 *
 * @param {unknown} value
 * @returns {string}
 */
const requireTreeSegment = value => {
  const segment = requireNonEmptyString(value, 'tree path segment');
  if (
    segment === '.' ||
    segment === '..' ||
    segment.includes('/') ||
    segment.includes('\\')
  ) {
    throw new Error(
      `tree path segment must be a single non-traversing name: ${q(segment)}`,
    );
  }
  return segment;
};
harden(requireTreeSegment);

/**
 * @param {unknown[]} args
 * @returns {string[]}
 */
const normalizeTreePath = args => {
  if (args.length === 1 && Array.isArray(args[0])) {
    return args[0].map(requireTreeSegment);
  }
  return args.map(requireTreeSegment);
};
harden(normalizeTreePath);

/**
 * @typedef {object} GitTreeEntry
 * @property {string} mode
 * @property {'blob' | 'tree' | 'commit'} type
 * @property {string} oid
 * @property {number | undefined} size
 * @property {string} name
 */

/**
 * @typedef {'created' | 'updated' | 'up-to-date' | 'fast-forward' | 'forced' | 'pruned' | 'rejected'} GitRefUpdateResult
 */

/**
 * @typedef {object} RemoteRefspec
 * @property {boolean} force
 * @property {string} src
 * @property {string} dst
 */

// Repository-local configurations that can execute code on read/write
// paths and must be refused before any mutating operation runs.  The
// public Git exo dispatches read-only methods (status, diff, log,
// show, revParse, currentBranch, branches, stashList, stashShow,
// tree) straight to the backend; mutation methods (add, restore,
// commit, createBranch, deleteBranch, renameBranch, switchBranch,
// detach, switch, merge, rebase, stashPush, stashApply, stashPop,
// stashDrop) gate on `assertNoExecutableRepoConfig` first.
//
// `include.path` / `includeIf.*` are refused outright: git honors an
// included file's `filter.*`/`merge.*` driver keys, but
// `git config --local --name-only --list` reports only the `include`
// key itself, not the keys the included file contributes.  Without
// this clause a committed-in `.git/config` `include.path` pointing at
// an in-tree file that defines `filter.<name>.clean` would slip past
// the listing-based check and run on the next add/commit.  The
// remote-transport guard already refuses the same keys.
const EXECUTABLE_REPO_CONFIG =
  /^(filter\..*\.(clean|smudge|process)|merge\..*\.driver|include(\.|if\.))/u;

// Repository-local configurations that can redirect or alter an
// explicitly-policy-bound remote URL. Remote operations pass a URL
// selected by GitRemote policy; local `.git/config` must not rewrite
// that endpoint, inject headers/credentials, loosen protocol controls,
// or route it through a configured proxy.
const REMOTE_TRANSPORT_REPO_CONFIG =
  /^(url\..*\.(insteadof|pushinsteadof)|protocol\..*|https?\..*|credential(\.|$)|core\.(sshcommand|gitproxy)|ssh\..*|include(\.|if\.))/u;

/**
 * @param {string} name
 * @param {string | undefined} oid
 * @returns {GitRef}
 */
const makeRefUpdateGitRef = (name, oid) =>
  harden({
    name,
    kind: /** @type {'branch' | 'tag' | 'commit' | 'detached'} */ (
      name.startsWith('refs/tags/') ? 'tag' : 'branch'
    ),
    ...(oid === undefined ? {} : { oid }),
  });
harden(makeRefUpdateGitRef);

/**
 * @param {string} refspec
 * @param {string} fieldName
 * @returns {RemoteRefspec}
 */
const parseRemoteRefspec = (refspec, fieldName) => {
  const raw = requireNonEmptyString(refspec, fieldName);
  const force = raw.startsWith('+');
  const body = force ? raw.slice(1) : raw;
  const colon = body.indexOf(':');
  return harden({
    force,
    src: colon < 0 ? body : body.slice(0, colon),
    dst: colon < 0 ? '' : body.slice(colon + 1),
  });
};
harden(parseRemoteRefspec);

/**
 * @param {string} ref
 * @param {string} pattern
 */
const refMatchesPattern = (ref, pattern) => {
  if (!pattern.includes('*')) {
    return ref === pattern;
  }
  const [prefix, suffix] = pattern.split('*');
  return ref.startsWith(prefix) && ref.endsWith(suffix);
};
harden(refMatchesPattern);

/**
 * @param {string} srcPattern
 * @param {string} dstPattern
 * @param {string} dst
 */
const sourceForDestination = (srcPattern, dstPattern, dst) => {
  if (!srcPattern.includes('*') || !dstPattern.includes('*')) {
    return srcPattern;
  }
  const [dstPrefix, dstSuffix] = dstPattern.split('*');
  const [srcPrefix, srcSuffix] = srcPattern.split('*');
  const suffixLength = dstSuffix.length;
  const middle = dst.slice(
    dstPrefix.length,
    suffixLength === 0 ? undefined : -suffixLength,
  );
  return `${srcPrefix}${middle}${srcSuffix}`;
};
harden(sourceForDestination);

/**
 * @param {string} pattern
 */
const selectorForDestinationPattern = pattern => {
  if (!pattern.includes('*')) {
    return pattern;
  }
  return pattern.slice(0, pattern.indexOf('*'));
};
harden(selectorForDestinationPattern);

/**
 * @param {string | undefined} beforeOid
 * @param {string | undefined} afterOid
 * @returns {GitRefUpdateResult | undefined}
 */
const fetchUpdateResult = (beforeOid, afterOid) => {
  if (beforeOid === undefined && afterOid === undefined) {
    return undefined;
  }
  if (beforeOid === undefined) {
    return 'created';
  }
  if (afterOid === undefined) {
    return 'pruned';
  }
  if (beforeOid === afterOid) {
    return 'up-to-date';
  }
  return 'updated';
};
harden(fetchUpdateResult);

/**
 * @param {string} flag
 * @returns {GitRefUpdateResult}
 */
const pushPorcelainFlagToResult = flag => {
  switch (flag) {
    case '*':
      return 'created';
    case '=':
      return 'up-to-date';
    case ' ':
      return 'fast-forward';
    case '+':
      return 'forced';
    case '-':
      return 'pruned';
    case '!':
      return 'rejected';
    default:
      return 'updated';
  }
};
harden(pushPorcelainFlagToResult);

/**
 * @typedef {object} RepositoryIdentity
 * @property {string} commonDir
 * @property {string} configHash
 * @property {string} rootCommit
 */

/**
 * @param {string} configText
 */
const hashIdentityConfig = configText => {
  const stableLines = configText
    .split('\n')
    .filter(
      line =>
        !/^\s*\[branch /u.test(line) &&
        !/^\s*(url|pushurl|remote|merge)\s*=/u.test(line),
    );
  return crypto
    .createHash('sha256')
    .update(stableLines.join('\n'))
    .digest('hex');
};
harden(hashIdentityConfig);

/**
 * @param {string} maybeRelative
 * @param {string} cwd
 */
const resolveGitPath = (maybeRelative, cwd) =>
  path.isAbsolute(maybeRelative)
    ? maybeRelative
    : path.resolve(cwd, maybeRelative);
harden(resolveGitPath);

/**
 * @param {RepositoryIdentity} left
 * @param {RepositoryIdentity} right
 */
const sameRepositoryIdentity = (left, right) =>
  left.commonDir === right.commonDir &&
  left.configHash === right.configHash &&
  left.rootCommit === right.rootCommit;
harden(sameRepositoryIdentity);

/**
 * A repository constructed before its first commit captures
 * `rootCommit: 'EMPTY'`.  When a commit lands through this capability the
 * repository gains its first root commit, and a later re-capture sees a
 * real root SHA.  That transition is not the "repository swapped out from
 * under us" event the identity check guards against — the repo did not
 * change identity, it gained its inaugural commit through us.  Treat the
 * `'EMPTY' -> <sha>` transition as identity-stable (commonDir and
 * configHash must still match); every other `rootCommit` change remains a
 * real identity change.
 *
 * @param {RepositoryIdentity} prior
 * @param {RepositoryIdentity} current
 */
const isEmptyRepoFirstCommit = (prior, current) =>
  prior.rootCommit === 'EMPTY' &&
  current.rootCommit !== 'EMPTY' &&
  prior.commonDir === current.commonDir &&
  prior.configHash === current.configHash;
harden(isEmptyRepoFirstCommit);

const UNMERGED_STATUS_CODES = harden(
  new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']),
);

/**
 * @param {string} indexCode
 * @param {string} worktreeCode
 */
const isUnmergedStatus = (indexCode, worktreeCode) =>
  UNMERGED_STATUS_CODES.has(`${indexCode}${worktreeCode}`);
harden(isUnmergedStatus);

/**
 * Map a `git status --porcelain=v1` index-column code to the design's
 * `GitStatusEntry.index` enum.
 *
 * @param {string} code
 * @param {string} worktreeCode
 * @returns {'clean' | 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'conflicted'}
 */
const indexCodeToStatus = (code, worktreeCode) => {
  if (isUnmergedStatus(code, worktreeCode)) {
    return 'conflicted';
  }
  switch (code) {
    case ' ':
      return 'clean';
    case 'A':
      return 'added';
    case 'M':
      return 'modified';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'U':
    case 'T':
      // 'T' is type change (e.g. symlink ↔ regular); fold into modified.
      return code === 'U' ? 'conflicted' : 'modified';
    default:
      // '?' (untracked) and '!' (ignored) — the index has no entry,
      // so 'clean' is the closest match in the design's vocabulary.
      return 'clean';
  }
};

/**
 * Map a `git status --porcelain=v1` worktree-column code to the
 * design's `GitStatusEntry.worktree` enum.
 *
 * @param {string} indexCode
 * @param {string} code
 * @returns {'clean' | 'modified' | 'deleted' | 'untracked' | 'ignored' | 'conflicted'}
 */
const worktreeCodeToStatus = (code, indexCode) => {
  if (isUnmergedStatus(indexCode, code)) {
    return 'conflicted';
  }
  if (indexCode === '?' && code === '?') return 'untracked';
  if (indexCode === '!' && code === '!') return 'ignored';
  switch (code) {
    case ' ':
      return 'clean';
    case 'M':
    case 'T':
      return 'modified';
    case 'D':
      return 'deleted';
    case 'U':
      return 'conflicted';
    default:
      return 'clean';
  }
};

/**
 * @typedef {object} RawStatusEntry
 * @property {string} path  Repository-relative path with forward slashes.
 * @property {ReturnType<typeof indexCodeToStatus>} index
 * @property {ReturnType<typeof worktreeCodeToStatus>} worktree
 * @property {string} [renamedFrom]  When the index is 'renamed' or 'copied'.
 */

/**
 * Construct the native-git backend.  The backend runs the system `git`
 * binary in a confined environment derived from the
 * fae-git-tool-reference work: sanitized environment, base args that
 * suppress hooks / monitors / external filters, timeout-and-buffer
 * caps, and a repository-root verification that runs once at
 * construction time and is cached.
 *
 * Phase 1: the infrastructure plus the simplest inspection methods
 * (revParse, currentBranch, branches, show, log, assertRepositoryRoot,
 * assertNoExecutableRepoConfig).  Phase 2 adds status, diff, and the
 * mutation surface.
 *
 * @param {object} args
 * @param {string} args.repoRoot  The host-private worktree root the
 *   git formula instantiator pulled from the mount's backing.
 * @param {(readable: unknown) => unknown} [args.makeReaderRef]  Wraps
 *   an async iterable / reader as a CapTP-friendly reader ref.  The
 *   daemon binds its own `reader-ref.js` here.  Optional because some
 *   in-process tests never reach the `streamBase64` path; the default
 *   throws lazily so the call site sees a clear error instead of a
 *   `TypeError` deep in the exo guard.
 * @returns {GitBackend}
 */
export const makeNativeGitBackend = ({
  repoRoot,
  makeReaderRef = () => {
    throw new Error(
      'makeNativeGitBackend: makeReaderRef power not bound; pass one to enable GitBlob.streamBase64()',
    );
  },
}) => {
  /** @type {Promise<void> | undefined} */
  let rootVerification;
  /** @type {Promise<void> | undefined} */
  let versionVerification;
  /** @type {RepositoryIdentity | undefined} */
  let repositoryIdentity;

  const verifyGitVersion = async () => {
    if (!versionVerification) {
      versionVerification = (async () => {
        const { stdout } = await execFileAsync('git', ['--version'], {
          env: makeGitEnv(repoRoot),
          timeout: GIT_TIMEOUT_MS,
          maxBuffer: GIT_MAX_BUFFER,
        });
        assertSupportedGitVersion(stdout);
      })();
    }
    return versionVerification;
  };

  /**
   * Capture the repository identity that this backend was authorized for.
   * This is intentionally narrower than "the path still contains a git repo":
   * replacing `.git` under the same worktree root must fail closed.
   *
   * @param {string} resolvedRoot
   * @returns {Promise<RepositoryIdentity>}
   */
  const captureRepositoryIdentity = async resolvedRoot => {
    await verifyGitVersion();
    const { stdout: revParseOut } = await execFileAsync(
      'git',
      [
        ...GIT_BASE_ARGS,
        'rev-parse',
        '--git-common-dir',
        '--git-path',
        'config',
      ],
      {
        cwd: resolvedRoot,
        env: makeGitEnv(resolvedRoot),
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
      },
    );
    const [commonDirRaw, configPathRaw] = revParseOut.trim().split('\n');
    const commonDir = await fs.promises.realpath(
      resolveGitPath(commonDirRaw, resolvedRoot),
    );
    const configPath = resolveGitPath(configPathRaw, resolvedRoot);
    let configText = '';
    try {
      configText = await fs.promises.readFile(configPath, 'utf8');
    } catch {
      configText = '';
    }

    let rootCommit = 'EMPTY';
    try {
      const { stdout: rootOut } = await execFileAsync(
        'git',
        [
          ...GIT_BASE_ARGS,
          'rev-list',
          '--max-parents=0',
          '--max-count=1',
          'HEAD',
        ],
        {
          cwd: resolvedRoot,
          env: makeGitEnv(resolvedRoot),
          timeout: GIT_TIMEOUT_MS,
          maxBuffer: GIT_MAX_BUFFER,
        },
      );
      const trimmed = rootOut.trim();
      if (trimmed !== '') {
        rootCommit = trimmed;
      }
    } catch {
      rootCommit = 'EMPTY';
    }

    return harden({
      commonDir,
      configHash: hashIdentityConfig(configText),
      rootCommit,
    });
  };

  /**
   * One-time verification.  After construction, every method assumes
   * the verification ran; assertRepositoryRoot is also wired as the
   * formula instantiator's pre-flight so unauthorized worktrees fail
   * before any user op.
   *
   * @returns {Promise<void>}
   */
  const verifyRepositoryRoot = async () => {
    if (!rootVerification) {
      rootVerification = (async () => {
        await verifyGitVersion();
        // Resolve symlinks before comparison.  Without this, any host
        // where the mount root is reached through a symlink — most
        // visibly macOS's /var → /private/var aliasing, also Linux
        // arrangements that mount user paths via a symlink (e.g. /home
        // pointing into a real partition under /mnt, or a developer's
        // worktree symlinked into a build tree) — will see the mount
        // root and git's `--show-toplevel` look mismatched even when
        // they identify the same physical directory.
        //
        // Windows is not currently supported.  If support is added,
        // this normalization step will need to cover NTFS junctions,
        // Developer-Mode symbolic links, and the case-insensitive but
        // case-preserving comparison of `--show-toplevel`'s output
        // against the mount root.
        const resolvedMountRoot = await fs.promises.realpath(repoRoot);
        const { stdout } = await execFileAsync(
          'git',
          [...GIT_BASE_ARGS, 'rev-parse', '--show-toplevel'],
          {
            cwd: resolvedMountRoot,
            env: makeGitEnv(resolvedMountRoot),
            timeout: GIT_TIMEOUT_MS,
            maxBuffer: GIT_MAX_BUFFER,
          },
        );
        const actualRoot = await fs.promises.realpath(stdout.trim());
        if (actualRoot !== resolvedMountRoot) {
          throw new Error(
            `Git worktree root mismatch: mount root is ${q(resolvedMountRoot)} but git reports ${q(actualRoot)}`,
          );
        }
        repositoryIdentity = await captureRepositoryIdentity(resolvedMountRoot);
      })();
    }
    return rootVerification;
  };

  /**
   * @returns {Promise<void>}
   */
  const verifyRepositoryIdentity = async () => {
    await verifyRepositoryRoot();
    const resolvedRoot = await fs.promises.realpath(repoRoot);
    const currentIdentity = await captureRepositoryIdentity(resolvedRoot);
    if (repositoryIdentity === undefined) {
      throw new Error(
        'Git repository identity changed since this capability was constructed; re-derive Git from the mount',
      );
    }
    if (sameRepositoryIdentity(repositoryIdentity, currentIdentity)) {
      return;
    }
    // A capability constructed over an empty repository whose first
    // commit landed through us sees its `rootCommit` transition from
    // 'EMPTY' to a real SHA.  Accept that transition and adopt the
    // resolved identity so subsequent operations verify against the
    // now-non-empty repository rather than re-throwing on every call.
    if (isEmptyRepoFirstCommit(repositoryIdentity, currentIdentity)) {
      repositoryIdentity = currentIdentity;
      return;
    }
    throw new Error(
      'Git repository identity changed since this capability was constructed; re-derive Git from the mount',
    );
  };

  /**
   * Run a sanitized git invocation and return its raw stdout, untrimmed.
   * Used by parsers (status, diff) where whitespace is significant.
   *
   * @param {string[]} args
   * @param {Record<string, string>} [envOverrides]
   * @param {AbortSignal} [signal]
   * @returns {Promise<string>}
   */
  const runGitRaw = async (args, envOverrides, signal) => {
    await verifyRepositoryIdentity();
    try {
      const { stdout } = await execFileAsync(
        'git',
        [...GIT_BASE_ARGS, ...args],
        {
          cwd: repoRoot,
          env: withGitEnvOverrides(makeGitEnv(repoRoot), envOverrides),
          timeout: GIT_TIMEOUT_MS,
          maxBuffer: GIT_MAX_BUFFER,
          signal,
        },
      );
      return stdout;
    } catch (err) {
      const error =
        /** @type {Error & { stdout?: string, stderr?: string, code?: number }} */ (
          err
        );
      const detail =
        error.stderr || error.stdout || error.message || 'unknown git error';
      throw new Error(
        `git ${gitCommandName(args)} failed (exit ${error.code ?? 'unknown'}):\n${truncateOutput(detail.trim())}`,
      );
    }
  };

  /**
   * Run a sanitized git invocation and stream binary stdout chunks.
   *
   * @param {string[]} args
   * @returns {AsyncGenerator<Uint8Array>}
   */
  const streamGitBuffer = async function* streamGitBuffer(args) {
    await verifyRepositoryIdentity();
    const child = spawn('git', [...GIT_BASE_ARGS, ...args], {
      cwd: repoRoot,
      env: makeGitEnv(repoRoot),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    if (child.stderr !== null) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', chunk => {
        stderr = truncateOutput(`${stderr}${chunk}`);
      });
    }
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, GIT_TIMEOUT_MS);
    timeout.unref();
    const closed = new Promise((resolve, reject) => {
      child.once('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('close', (code, signal) => {
        clearTimeout(timeout);
        resolve({ code, signal });
      });
    });
    // If a consumer of this async generator breaks out of the
    // `for await` loop before reaching `await closed`, and the
    // child later emits an `'error'` event (e.g. SIGTERM-induced),
    // `reject(error)` would fire on a promise nobody is awaiting →
    // unhandled rejection.  Attach a noop catch so the promise has
    // a registered handler even if the happy-path await never runs.
    // The `finally` block below still kills the child; this just
    // keeps the post-break error from surfacing as a process-level
    // unhandled rejection.
    closed.catch(() => {});
    try {
      if (child.stdout === null) {
        throw new Error('git stdout stream was not available');
      }
      for await (const chunk of child.stdout) {
        yield new Uint8Array(/** @type {Buffer} */ (chunk));
      }
      const { code, signal } =
        /** @type {{ code: number | null, signal: string | null }} */ (
          await closed
        );
      if (code !== 0) {
        throw new Error(
          `git ${gitCommandName(args)} failed (exit ${code ?? signal ?? 'unknown'}):\n${truncateOutput((stderr || 'unknown git error').trim())}`,
        );
      }
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGTERM');
      }
    }
  };

  /**
   * Run a sanitized git invocation.  Always preceded by a
   * verification of the repository root.  Returns trimmed stdout
   * (or '(no output)' if nothing was printed) on success; raises a
   * structured error including the exit code and a truncated stderr
   * on failure.  Suitable for human-display ops; parsers should call
   * `runGitRaw` instead so leading whitespace and per-record framing
   * are preserved.
   *
   * @param {string[]} args
   * @param {Record<string, string>} [envOverrides]
   * @param {AbortSignal} [signal]
   * @returns {Promise<string>}
   */
  const runGit = async (args, envOverrides, signal) => {
    await verifyRepositoryIdentity();
    try {
      const { stdout, stderr } = await execFileAsync(
        'git',
        [...GIT_BASE_ARGS, ...args],
        {
          cwd: repoRoot,
          env: withGitEnvOverrides(makeGitEnv(repoRoot), envOverrides),
          timeout: GIT_TIMEOUT_MS,
          maxBuffer: GIT_MAX_BUFFER,
          signal,
        },
      );
      const output = `${stdout}${stderr ? `\n[stderr]:\n${stderr}` : ''}`;
      return truncateOutput(output.trim() || '(no output)');
    } catch (err) {
      const error =
        /** @type {Error & { stdout?: string, stderr?: string, code?: number }} */ (
          err
        );
      const detail =
        error.stderr || error.stdout || error.message || 'unknown git error';
      throw new Error(
        `git ${gitCommandName(args)} failed (exit ${error.code ?? 'unknown'}):\n${truncateOutput(detail.trim())}`,
      );
    }
  };

  /**
   * Run a sanitized git invocation with GIT_ASKPASS connected to an inherited
   * anonymous pipe. Only the fd number reaches the child environment; the
   * credential bytes never appear in argv, env, or a temporary file.
   *
   * @param {string[]} args
   * @param {Buffer} credentialBytes
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ stdout: string, stderr: string }>}
   */
  const runGitWithAskpass = async (args, credentialBytes, signal) => {
    await verifyRepositoryIdentity();
    if (signal?.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new Error('git operation aborted');
    }

    return new Promise((resolve, reject) => {
      /** @type {Buffer[]} */
      const stdoutChunks = [];
      /** @type {Buffer[]} */
      const stderrChunks = [];
      let stdoutSize = 0;
      let stderrSize = 0;
      let settled = false;
      let timedOut = false;
      let outputTooLarge = false;
      let aborted = false;

      const child = spawn('git', [...GIT_BASE_ARGS, ...args], {
        cwd: repoRoot,
        env: withGitEnvOverrides(makeGitEnv(repoRoot), {
          GIT_ASKPASS: gitAskpassHelperPath,
          ENDO_GIT_ASKPASS_FD: String(GIT_ASKPASS_FD),
        }),
        stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, GIT_TIMEOUT_MS);
      timeout.unref();

      const credentialPipe =
        /** @type {import('node:stream').Writable | null | undefined} */ (
          child.stdio[GIT_ASKPASS_FD]
        );
      if (credentialPipe === undefined || credentialPipe === null) {
        throw new Error('git credential pipe was not available');
      }
      credentialPipe.on('error', () => {});
      credentialPipe.end(credentialBytes);

      const abort = () => {
        aborted = true;
        child.kill('SIGTERM');
      };
      signal?.addEventListener('abort', abort, { once: true });

      /**
       * @param {Buffer[]} chunks
       * @param {Buffer | string} chunk
       * @param {'stdout' | 'stderr'} streamName
       */
      const appendChunk = (chunks, chunk, streamName) => {
        const bytes = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk, 'utf8');
        if (streamName === 'stdout') {
          stdoutSize += bytes.byteLength;
        } else {
          stderrSize += bytes.byteLength;
        }
        if (stdoutSize + stderrSize > GIT_MAX_BUFFER) {
          outputTooLarge = true;
          child.kill('SIGTERM');
          return;
        }
        chunks.push(bytes);
      };

      child.stdout?.on('data', chunk =>
        appendChunk(stdoutChunks, chunk, 'stdout'),
      );
      child.stderr?.on('data', chunk =>
        appendChunk(stderrChunks, chunk, 'stderr'),
      );
      child.once('error', error => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        try {
          credentialPipe.destroy();
        } catch {
          // ignore
        }
        reject(error);
      });
      child.once('close', (code, closeSignal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        try {
          credentialPipe.destroy();
        } catch {
          // ignore
        }

        const stdout = Buffer.concat(stdoutChunks).toString('utf8');
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        if (code === 0 && !timedOut && !aborted && !outputTooLarge) {
          resolve({ stdout, stderr });
          return;
        }
        const detail =
          (outputTooLarge && 'git output exceeded max buffer') ||
          (aborted && 'git operation aborted') ||
          (timedOut && 'git operation timed out') ||
          stderr ||
          stdout ||
          'unknown git error';
        reject(
          new Error(
            `git ${gitCommandName(args)} failed (exit ${code ?? closeSignal ?? 'unknown'}):\n${truncateOutput(detail.trim())}`,
          ),
        );
      });
    });
  };

  /**
   * Refuse to proceed if the repository's local config enables an
   * executable filter or merge driver.  Called at the top of every
   * mutating operation (add, restore, commit, branch create / rename
   * / delete / switch, detach, switch, merge, rebase, and the worktree-
   * touching `stash*` verbs).  Read-only inspection methods (status,
   * diff, log, show, revParse, branches, currentBranch, stashList,
   * stashShow, tree) do not gate on this check because they cannot
   * invoke a filter or merge driver in the first place.
   *
   * @returns {Promise<void>}
   */
  const assertNoExecutableRepoConfig = async () => {
    await verifyRepositoryIdentity();
    const { stdout } = await execFileAsync(
      'git',
      [...GIT_BASE_ARGS, 'config', '--local', '--name-only', '--list'],
      {
        cwd: repoRoot,
        env: makeGitEnv(repoRoot),
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
      },
    );
    const offending = stdout
      .split('\n')
      .map(name => name.trim())
      .filter(name => EXECUTABLE_REPO_CONFIG.test(name.toLowerCase()));
    if (offending.length > 0) {
      throw new Error(
        `Refusing git operation because repository config can execute commands: ${offending.join(', ')}`,
      );
    }
  };

  /**
   * Refuse repository-local configuration that can redirect or modify
   * an explicit remote URL. Unlike ordinary local branch metadata, these
   * keys apply even when the daemon invokes `git fetch <url>` or
   * `git push <url>` with a policy-controlled URL.
   */
  const assertNoRemoteTransportRepoConfig = async () => {
    await verifyRepositoryIdentity();
    const { stdout } = await execFileAsync(
      'git',
      [...GIT_BASE_ARGS, 'config', '--local', '--name-only', '--list'],
      {
        cwd: repoRoot,
        env: makeGitEnv(repoRoot),
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
      },
    );
    const offending = stdout
      .split('\n')
      .map(name => name.trim())
      .filter(name => REMOTE_TRANSPORT_REPO_CONFIG.test(name.toLowerCase()));
    if (offending.length > 0) {
      throw new Error(
        `Refusing remote git operation because repository config can alter remote transport: ${offending.join(', ')}`,
      );
    }
  };

  /**
   * Add command-line protocol policy for explicit URL remote operations.
   * The URL itself still comes from GitRemote policy; these flags ensure
   * the protocol selected for that URL is the only protocol git may use
   * after its normal URL handling.
   *
   * @param {string} urlText
   * @returns {string[]}
   */
  const remoteProtocolArgs = urlText => {
    let protocol;
    try {
      protocol = new URL(urlText).protocol;
    } catch {
      throw new Error(`remote URL is not a valid URL: ${q(urlText)}`);
    }
    if (protocol === 'https:') {
      return harden([
        '-c',
        'protocol.allow=never',
        '-c',
        'protocol.https.allow=always',
      ]);
    }
    if (protocol === 'http:') {
      return harden([
        '-c',
        'protocol.allow=never',
        '-c',
        'protocol.http.allow=always',
      ]);
    }
    if (protocol === 'file:') {
      return harden([
        '-c',
        'protocol.allow=never',
        '-c',
        'protocol.file.allow=always',
      ]);
    }
    throw new Error(`remote URL protocol is not supported: ${q(protocol)}`);
  };
  harden(remoteProtocolArgs);

  /**
   * @param {string[]} selectors
   * @returns {Promise<Map<string, string>>}
   */
  const readRefMap = async selectors => {
    if (selectors.length === 0) {
      return new Map();
    }
    const raw = await runGitRaw([
      'for-each-ref',
      '--format=%(refname)%09%(objectname)',
      ...selectors,
    ]);
    const refs = new Map();
    for (const line of raw.split('\n').filter(entry => entry !== '')) {
      const tab = line.indexOf('\t');
      if (tab < 0) {
        throw new Error(`Could not parse git for-each-ref line: ${q(line)}`);
      }
      refs.set(line.slice(0, tab), line.slice(tab + 1));
    }
    return refs;
  };

  /**
   * @param {string[]} refspecs
   */
  const selectorsForFetchRefspecs = refspecs =>
    harden(
      [
        ...new Set(
          refspecs
            .map((refspec, index) =>
              parseRemoteRefspec(refspec, `remoteFetch.refspecs[${index}]`),
            )
            .map(({ dst }) => dst)
            .filter(dst => dst !== '')
            .map(selectorForDestinationPattern),
        ),
      ].filter(selector => selector !== ''),
    );

  /**
   * @param {string[]} refspecs
   * @param {Map<string, string>} before
   * @param {Map<string, string>} after
   */
  const summarizeFetchRefUpdates = (refspecs, before, after) => {
    /** @type {Array<{ local: GitRef, remote: string, result: GitRefUpdateResult }>} */
    const updates = [];
    const seen = new Set();
    for (const [index, refspec] of refspecs.entries()) {
      const parsed = parseRemoteRefspec(
        refspec,
        `remoteFetch.refspecs[${index}]`,
      );
      if (parsed.dst !== '') {
        const candidates = [
          ...new Set([...before.keys(), ...after.keys()].sort()),
        ].filter(ref => refMatchesPattern(ref, parsed.dst) && !seen.has(ref));
        for (const dst of candidates) {
          seen.add(dst);
          const beforeOid = before.get(dst);
          const afterOid = after.get(dst);
          const result = fetchUpdateResult(beforeOid, afterOid);
          if (result !== undefined) {
            updates.push(
              harden({
                local: makeRefUpdateGitRef(dst, afterOid || beforeOid),
                remote: sourceForDestination(parsed.src, parsed.dst, dst),
                result,
              }),
            );
          }
        }
      }
    }
    return harden(updates);
  };

  /**
   * @param {string} ref
   * @returns {Promise<GitRef | undefined>}
   */
  const resolveOptionalRef = async ref => {
    if (ref === '') {
      return undefined;
    }
    try {
      const oid = (await runGitRaw(['rev-parse', '--verify', ref])).trim();
      return makeRefUpdateGitRef(ref, oid);
    } catch {
      return makeRefUpdateGitRef(ref, undefined);
    }
  };

  /**
   * @param {string} raw
   * @returns {Promise<Array<{ local?: GitRef, remote: string, result: GitRefUpdateResult }>>}
   */
  const parsePushPorcelainUpdates = async raw => {
    const records = raw.split('\n').flatMap(line => {
      const flag = line[0];
      const rest = line.slice(1);
      const fields = rest.startsWith('\t') ? rest.slice(1).split('\t') : [];
      if (
        line === '' ||
        line === 'Done' ||
        line.startsWith('To ') ||
        fields.length < 2
      ) {
        return [];
      }
      const colon = fields[0].indexOf(':');
      return harden([
        harden({
          src: colon < 0 ? fields[0] : fields[0].slice(0, colon),
          dst: colon < 0 ? fields[0] : fields[0].slice(colon + 1),
          flag,
        }),
      ]);
    });
    const updates = await Promise.all(
      records.map(async ({ src, dst, flag }) => {
        const local = await resolveOptionalRef(src);
        return harden({
          ...(local === undefined ? {} : { local }),
          remote: dst,
          result: pushPorcelainFlagToResult(flag),
        });
      }),
    );
    return harden(updates);
  };

  /**
   * @param {string} output
   * @returns {GitTreeEntry[]}
   */
  const parseLsTreeEntries = output => {
    if (output === '') {
      return [];
    }
    const records = output.split('\0').filter(record => record !== '');
    /** @type {GitTreeEntry[]} */
    const entries = [];
    for (const record of records) {
      const tab = record.indexOf('\t');
      if (tab < 0) {
        throw new Error(`Could not parse git ls-tree record: ${q(record)}`);
      }
      const meta = record.slice(0, tab);
      const name = record.slice(tab + 1);
      const match = meta.match(
        /^([0-7]{6}) (blob|tree|commit) ([0-9a-f]{40}) +(-|\d+)$/u,
      );
      if (!match) {
        throw new Error(`Could not parse git ls-tree metadata: ${q(meta)}`);
      }
      entries.push(
        harden({
          mode: match[1],
          type: /** @type {'blob' | 'tree' | 'commit'} */ (match[2]),
          oid: match[3],
          size: match[4] === '-' ? undefined : Number.parseInt(match[4], 10),
          name,
        }),
      );
    }
    return entries;
  };

  /**
   * @param {string} treeOid
   * @returns {Promise<GitTreeEntry[]>}
   */
  const listTreeEntries = async treeOid => {
    // Collect `git ls-tree -z --long` via streaming so a large tree
    // listing isn't capped by `runGitRaw`'s `GIT_MAX_BUFFER` (1 MiB).
    // The whole record table is still materialized into one string
    // here (parsing needs random access to NUL-delimited records),
    // but the input bytes flow through `spawn` rather than execFile
    // — bounded by tree size, not by the runner's stdout cap.
    const chunks = [];
    let total = 0;
    for await (const chunk of streamGitBuffer([
      'ls-tree',
      '-z',
      '--long',
      treeOid,
    ])) {
      chunks.push(chunk);
      total += chunk.length;
    }
    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      buffer.set(c, offset);
      offset += c.length;
    }
    return parseLsTreeEntries(utf8Decoder.decode(buffer));
  };

  /**
   * @param {string} treeOid
   * @param {string} name
   * @returns {Promise<GitTreeEntry | undefined>}
   */
  const findTreeEntry = async (treeOid, name) => {
    const entries = await listTreeEntries(treeOid);
    return entries.find(entry => entry.name === name);
  };

  /**
   * Reports whether `git archive --format=tar <treeOid>` reproduces the
   * committed tree without loss.  `git archive` is NOT a lossless tree
   * source: it honors a committed `.gitattributes` `export-ignore`
   * pattern (omitting matching tracked files) and emits gitlinks /
   * submodule commits as empty directory entries.  A tar snapshot of
   * such a tree would not match the committed Git tree, so the caller
   * must take the per-entry `ls-tree`/`cat-file` walk instead, which is
   * immune to `export-ignore` and fails loudly on gitlinks.
   *
   * Detection walks the tree recursively once (no blob content beyond
   * any `.gitattributes` files) so the common, lossless case routes to
   * the fast archive path while only affected repos fall back.
   *
   * @param {string} treeOid
   * @returns {Promise<boolean>}
   */
  const treeArchiveLossless = async treeOid => {
    // `-r` recurses, `-t` also lists the tree (directory) records so a
    // gitlink — which `git archive` would flatten to an empty directory —
    // surfaces as a `commit`-type record.
    const raw = await runGitRaw([
      'ls-tree',
      '-r',
      '-t',
      '-z',
      '--long',
      treeOid,
    ]);
    const entries = parseLsTreeEntries(raw);
    /** @type {string[]} */
    const gitattributesOids = [];
    for (const entry of entries) {
      // A gitlink / submodule commit. `git archive` emits it as an empty
      // directory, dropping the committed submodule reference.
      if (entry.type === 'commit' || entry.mode === '160000') {
        return false;
      }
      if (
        entry.type === 'blob' &&
        (entry.name === '.gitattributes' ||
          entry.name.endsWith('/.gitattributes'))
      ) {
        gitattributesOids.push(entry.oid);
      }
    }
    for (const oid of gitattributesOids) {
      // eslint-disable-next-line no-await-in-loop
      const text = utf8Decoder.decode(await readBlobBytes(oid));
      // An `export-ignore` attribute set on any pattern causes
      // `git archive` to omit the matching tracked files. We treat any
      // occurrence conservatively: a `-export-ignore` reset still proves
      // export-ignore is in play and the archive cannot be trusted as a
      // lossless mirror of the committed tree.
      if (/(^|\s)[^\s#]*export-ignore\b/u.test(text)) {
        return false;
      }
    }
    return true;
  };

  /**
   * @param {string} blobOid
   */
  const streamBlobBytes = blobOid =>
    streamGitBuffer(['cat-file', 'blob', blobOid]);

  /**
   * Read the full bytes of a blob.  Collects the streaming output of
   * `cat-file blob <oid>` so the read is not subject to `execFile`'s
   * `maxBuffer` cap — a blob larger than `GIT_MAX_BUFFER` (1 MiB) is
   * read correctly rather than failing the entire call.
   *
   * @param {string} blobOid
   * @returns {Promise<Uint8Array>}
   */
  const readBlobBytes = async blobOid => {
    /** @type {Uint8Array[]} */
    const chunks = [];
    let total = 0;
    for await (const chunk of streamBlobBytes(blobOid)) {
      chunks.push(chunk);
      total += chunk.length;
    }
    if (chunks.length === 1) {
      // Fast path.  `streamGitBuffer` wraps each child-process stdout
      // chunk in a fresh `new Uint8Array(Buffer)`, so this return does
      // not alias the runtime's pooled buffer — Node `child_process`
      // allocates fresh stdout buffers per chunk, and the wrapping
      // captures the underlying ArrayBuffer one-to-one.
      return chunks[0];
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  };

  /**
   * @param {string} blobOid
   * @returns {unknown}
   */
  const makeGitBlob = blobOid =>
    makeExo('GitBlob', ReadableBlobInterface, {
      streamBase64() {
        return makeReaderRef(streamBlobBytes(blobOid));
      },

      async text() {
        const bytes = await readBlobBytes(blobOid);
        return utf8Decoder.decode(bytes);
      },

      async json() {
        const bytes = await readBlobBytes(blobOid);
        return JSON.parse(utf8Decoder.decode(bytes));
      },
    });

  /**
   * @param {string} treeOid
   * @returns {unknown}
   */
  const makeGitTree = treeOid => {
    /** @type {unknown} */
    let self;

    /**
     * @param {readonly string[]} segments
     * @returns {Promise<unknown>}
     */
    const lookupSegments = async segments => {
      if (segments.length === 0) {
        return self;
      }
      let currentTreeOid = treeOid;
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        // eslint-disable-next-line no-await-in-loop
        const entry = await findTreeEntry(currentTreeOid, segment);
        if (entry === undefined) {
          throw new Error(`Git tree entry not found: ${q(segment)}`);
        }
        const isLast = index === segments.length - 1;
        if (entry.type === 'tree') {
          if (isLast) {
            return makeGitTree(entry.oid);
          }
          currentTreeOid = entry.oid;
        } else if (entry.type === 'blob') {
          if (!isLast) {
            throw new Error(
              `Git tree entry ${q(segment)} is a blob, not a tree`,
            );
          }
          return makeGitBlob(entry.oid);
        } else {
          throw new Error(
            `Git tree entry ${q(segment)} is a submodule commit, not a readable file or tree`,
          );
        }
      }
      return self;
    };

    self = makeExo('GitTree', GitTreeInterface, {
      /** @returns {unknown} A reader ref over the `git archive --format=tar` stream. */
      archiveTar() {
        return makeReaderRef(
          streamGitBuffer(['archive', '--format=tar', treeOid]),
        );
      },

      /** @returns {Promise<boolean>} */
      archiveLossless() {
        return treeArchiveLossless(treeOid);
      },

      /**
       * @param {...string} pathArgs
       * @returns {Promise<boolean>}
       */
      async has(...pathArgs) {
        const segments = normalizeTreePath(pathArgs);
        if (segments.length === 0) {
          return true;
        }
        try {
          await lookupSegments(segments);
          return true;
        } catch {
          return false;
        }
      },

      /**
       * @param {...string} pathArgs
       * @returns {Promise<string[]>}
       */
      async list(...pathArgs) {
        const segments = normalizeTreePath(pathArgs);
        if (segments.length > 0) {
          const subtree = await lookupSegments(segments);
          return /** @type {Promise<string[]>} */ (
            /** @type {any} */ (subtree).list()
          );
        }
        const entries = await listTreeEntries(treeOid);
        return harden(entries.map(entry => entry.name));
      },

      /**
       * @param {string | string[]} pathArg
       * @returns {Promise<unknown>} The nested GitTree or GitBlob remotable.
       */
      async lookup(pathArg) {
        const segments =
          typeof pathArg === 'string'
            ? [requireTreeSegment(pathArg)]
            : normalizeTreePath(/** @type {unknown[]} */ (pathArg));
        return lookupSegments(segments);
      },
    });

    return self;
  };

  return harden({
    assertRepositoryRoot: verifyRepositoryRoot,
    // Exposed for the phase that adds mutation surfaces; callable
    // already so the contract is complete.
    assertNoExecutableRepoConfig,

    /**
     * Parses `git status --porcelain=v1 -z`.  The NUL-delimited format
     * is what we want here: it has a well-defined, ambiguity-free
     * encoding (paths with whitespace or special characters arrive
     * verbatim) and rename/copy records embed the source-path field
     * inline rather than escaping it.
     *
     * Returns the raw structural list.  The public Git exo wraps each
     * entry into a `GitStatusEntry` by minting an `EndoMountEntry` on
     * the bound mount — the backend has no mount cap to mint with.
     *
     * @returns {Promise<RawStatusEntry[]>}
     */
    status: async () => {
      // Use the raw runner: porcelain=v1 records start with a column-
      // sensitive XY code (e.g. ' D' for a worktree-only deletion);
      // runGit's trim() would strip a leading space and shift the path.
      const out = await runGitRaw([
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all',
      ]);
      if (out === '') {
        return harden([]);
      }
      // `--porcelain=v1 -z` separates records with NUL.  A rename / copy
      // record is followed by its source path in a second NUL-delimited
      // field.  trailing empty strings (from a final NUL) are filtered.
      const parts = out.split('\0').filter(part => part !== '');
      /** @type {RawStatusEntry[]} */
      const entries = [];
      let i = 0;
      while (i < parts.length) {
        const record = parts[i];
        if (record.length < 3) {
          i += 1;
        } else {
          const indexCode = record[0];
          const wtCode = record[1];
          const filePath = record.slice(3);
          const indexStatus = indexCodeToStatus(indexCode, wtCode);
          const worktreeStatus = worktreeCodeToStatus(wtCode, indexCode);
          if (
            (indexStatus === 'renamed' || indexStatus === 'copied') &&
            i + 1 < parts.length
          ) {
            entries.push(
              harden({
                path: filePath,
                index: indexStatus,
                worktree: worktreeStatus,
                renamedFrom: parts[i + 1],
              }),
            );
            i += 2;
          } else {
            entries.push(
              harden({
                path: filePath,
                index: indexStatus,
                worktree: worktreeStatus,
              }),
            );
            i += 1;
          }
        }
      }
      return harden(entries);
    },

    /**
     * Render a textual diff in `git diff` form.  `--no-ext-diff` suppresses
     * any external diff program a guest may have committed into the repo
     * config; `--no-textconv` suppresses a `diff.<driver>.textconv` command
     * that an in-tree `.gitattributes` could otherwise bind to a path and
     * have git exec while rendering the diff.  `core.attributesFile=/dev/null`
     * (in `GIT_BASE_ARGS`) only disables the *external* attributes file, not
     * the in-tree `.gitattributes`, so the per-command flag is load-bearing
     * here.  Combined with the rest of the hardening envelope (hooks off,
     * filters off), guests cannot make `git diff` execute arbitrary code.
     *
     * @param {GitBackendDiffOptions} [options]
     * @returns {Promise<string>}
     */
    diff: async (options = {}) => {
      const args = ['diff', '--no-ext-diff', '--no-textconv'];
      if (options.cached) args.push('--cached');
      // `--end-of-options` separates option-shaped flags from the
      // revisions that follow.  `requireRevision` already rejects
      // refs that begin with `-`; this is the defense-in-depth
      // boundary git itself enforces when both sides cooperate.
      const positionals = [];
      if (options.base !== undefined) {
        positionals.push(requireRevision(options.base, 'diff.base'));
      }
      if (options.head !== undefined) {
        positionals.push(requireRevision(options.head, 'diff.head'));
      }
      if (positionals.length > 0) {
        args.push('--end-of-options', ...positionals);
      }
      if (Array.isArray(options.paths) && options.paths.length > 0) {
        for (const p of options.paths) {
          requireNonEmptyString(p, 'diff path');
        }
        args.push('--', ...options.paths);
      }
      return runGit(args);
    },

    /**
     * @param {GitBackendLogOptions} [options]
     * @returns {Promise<GitCommit[]>}
     */
    log: async (options = {}) => {
      const args = ['log', '--pretty=format:%H%x09%s%x09%an%x09%ct'];
      if (typeof options.maxCount === 'number') {
        if (!Number.isInteger(options.maxCount) || options.maxCount <= 0) {
          throw new Error('log.maxCount must be a positive integer');
        }
        args.push(`--max-count=${options.maxCount}`);
      }
      if (options.since !== undefined) {
        const since = requireNonEmptyString(options.since, 'log.since');
        args.push(`--since=${since}`);
      }
      if (options.until !== undefined) {
        const until = requireNonEmptyString(options.until, 'log.until');
        args.push(`--until=${until}`);
      }
      if (options.ref !== undefined) {
        // `--end-of-options` keeps the trailing ref unambiguously
        // positional even when its name shape would otherwise look
        // option-like.  `requireRevision` already rejects names that
        // begin with `-`; this is the defense-in-depth boundary.
        args.push('--end-of-options', requireRevision(options.ref, 'log.ref'));
      }
      const rawLog = await runGitRaw(args);
      const stdout = rawLog.trim();
      if (stdout === '') {
        return harden([]);
      }
      /** @type {GitCommit[]} */
      const commits = [];
      for (const line of stdout.split('\n')) {
        if (line !== '') {
          const [oid, summary, author, committedAtStr] = line.split('\t');
          commits.push(
            harden({
              oid,
              summary,
              author,
              committedAt: committedAtStr
                ? Number.parseInt(committedAtStr, 10)
                : undefined,
            }),
          );
        }
      }
      return harden(commits);
    },

    /**
     * Render `git show` for a ref.  `--no-textconv` suppresses a
     * `diff.<driver>.textconv` command that an in-tree `.gitattributes`
     * could bind to a shown path; without it, `git show` of a commit or
     * blob would exec the configured textconv program just as `diff`
     * would (see the `diff` method's note on why the in-tree attributes
     * file is not neutralized by `core.attributesFile=/dev/null`).
     *
     * @param {string} ref
     * @returns {Promise<string>}
     */
    show: async ref => {
      const revision = requireRevision(ref, 'show.ref');
      return runGit(['show', '--no-textconv', '--end-of-options', revision]);
    },

    /**
     * @param {string} ref
     * @returns {Promise<GitRef>}
     */
    revParse: async ref => {
      const revision = requireRevision(ref, 'revParse.ref');
      const rawRevision = await runGitRaw([
        'rev-parse',
        '--verify',
        '--end-of-options',
        revision,
      ]);
      const stdout = rawRevision.trim();
      // `rev-parse --verify` returns the resolved object id.  We can't
      // tell branch vs tag vs commit from this alone; tag/branch
      // discrimination is a future enhancement (cat-file --batch-check
      // gives us the object type).
      return harden({
        name: revision,
        kind: /** @type {'commit'} */ ('commit'),
        oid: stdout,
      });
    },

    /**
     * Stage the given repo-relative paths.  The public Git exo resolves
     * `EndoMountEntry` values into paths before this call.  Per-repo
     * executable filter and merge-driver config is refused at the top of
     * every mutation, in case a guest committed something that would
     * exec on read.
     *
     * @param {string[]} paths
     * @returns {Promise<void>}
     */
    add: async paths => {
      if (!Array.isArray(paths) || paths.length === 0) {
        throw new Error('add: paths must be a non-empty array');
      }
      for (const p of paths) {
        requireNonEmptyString(p, 'add path');
      }
      await assertNoExecutableRepoConfig();
      // `--` separates options from pathspecs; with --literal-pathspecs
      // in GIT_BASE_ARGS, the paths are also glob-free.
      await runGit(['add', '--', ...paths]);
    },

    /**
     * Restore the given repo-relative paths from the index (default)
     * or from the worktree if `staged` is true.
     *
     * @param {string[]} paths
     * @param {GitRestoreOptions} [opts]
     * @returns {Promise<void>}
     */
    restore: async (paths, opts = {}) => {
      if (!Array.isArray(paths) || paths.length === 0) {
        throw new Error('restore: paths must be a non-empty array');
      }
      for (const p of paths) {
        requireNonEmptyString(p, 'restore path');
      }
      await assertNoExecutableRepoConfig();
      const args = ['restore'];
      if (opts.staged) args.push('--staged');
      args.push('--', ...paths);
      await runGit(args);
    },

    /**
     * Create a commit from the current index using the provided message.
     * Returns a `GitCommit` record reflecting the new HEAD.
     *
     * @param {string} message
     * @returns {Promise<GitCommit>}
     */
    commit: async message => {
      requireNonEmptyString(message, 'commit message');
      await assertNoExecutableRepoConfig();
      // -m embeds the message inline; --allow-empty-message is left off
      // so the daemon does not silently accept blank messages.
      await runGit(['commit', '-m', message]);
      // Read back the new HEAD's record so the caller learns the oid.
      const rawHead = await runGitRaw([
        'log',
        '-1',
        '--pretty=format:%H%x09%s%x09%an%x09%ct',
      ]);
      const out = rawHead.trim();
      const [oid, summary, author, committedAtStr] = out.split('\t');
      return harden({
        oid,
        summary,
        author,
        committedAt: committedAtStr
          ? Number.parseInt(committedAtStr, 10)
          : undefined,
      });
    },

    /**
     * @returns {Promise<GitRef | undefined>}
     */
    currentBranch: async () => {
      // `symbolic-ref --short HEAD` returns the branch name when HEAD
      // is on one, and exits non-zero otherwise (detached HEAD).  We
      // surface undefined for detached and let the caller decide what
      // to do; common consumers fall back to revParse('HEAD').
      try {
        const rawBranch = await runGitRaw(['symbolic-ref', '--short', 'HEAD']);
        const stdout = rawBranch.trim();
        if (stdout === '') {
          return undefined;
        }
        return harden({
          name: stdout,
          kind: /** @type {'branch'} */ ('branch'),
        });
      } catch (err) {
        const message = /** @type {Error} */ (err).message || '';
        if (/not a symbolic ref|HEAD is not a symbolic/.test(message)) {
          return undefined;
        }
        throw err;
      }
    },

    /**
     * @returns {Promise<GitRef[]>}
     */
    branches: async () => {
      const rawBranches = await runGitRaw([
        'for-each-ref',
        '--format=%(refname:short)',
        'refs/heads/',
      ]);
      const stdout = rawBranches.trim();
      if (stdout === '') {
        return harden([]);
      }
      /** @type {GitRef[]} */
      const refs = [];
      for (const line of stdout.split('\n')) {
        const name = line.trim();
        if (name !== '') {
          refs.push(harden({ name, kind: /** @type {'branch'} */ ('branch') }));
        }
      }
      return harden(refs);
    },

    /**
     * @param {string} name
     * @param {GitCreateBranchOptions} [opts]
     * @returns {Promise<GitRef>}
     */
    createBranch: async (name, opts = {}) => {
      requireNonEmptyString(name, 'createBranch.name');
      await assertNoExecutableRepoConfig();
      const args = ['branch', name];
      if (opts.startPoint !== undefined) {
        args.push(requireRevision(opts.startPoint, 'createBranch.startPoint'));
      }
      await runGit(args);
      if (opts.switchAfterCreate) {
        await runGit(['switch', name]);
      }
      return harden({ name, kind: /** @type {'branch'} */ ('branch') });
    },

    /**
     * @param {string} name
     * @param {GitDeleteBranchOptions} [opts]
     * @returns {Promise<void>}
     */
    deleteBranch: async (name, opts = {}) => {
      requireNonEmptyString(name, 'deleteBranch.name');
      await assertNoExecutableRepoConfig();
      const flag = opts.force ? '-D' : '-d';
      await runGit(['branch', flag, name]);
    },

    /**
     * @param {string} from
     * @param {string} to
     * @returns {Promise<void>}
     */
    renameBranch: async (from, to) => {
      requireNonEmptyString(from, 'renameBranch.from');
      requireNonEmptyString(to, 'renameBranch.to');
      await assertNoExecutableRepoConfig();
      await runGit(['branch', '-m', from, to]);
    },

    /**
     * @param {string} name
     * @returns {Promise<void>}
     */
    switchBranch: async name => {
      const target = requireNonEmptyString(name, 'switchBranch.name');
      await assertNoExecutableRepoConfig();
      await runGit(['switch', target]);
    },

    /**
     * @param {string} ref
     * @returns {Promise<void>}
     */
    detach: async ref => {
      const target = requireRevision(ref, 'detach.ref');
      await assertNoExecutableRepoConfig();
      await runGit(['switch', '--detach', '--end-of-options', target]);
    },

    /**
     * @param {string} ref
     * @returns {Promise<void>}
     */
    switch: async ref => {
      const target = requireRevision(ref, 'switch.ref');
      await assertNoExecutableRepoConfig();
      await runGit(['switch', '--end-of-options', target]);
    },

    /**
     * @param {string} ref
     * @param {GitMergeOptions} [opts]
     * @returns {Promise<string>}
     */
    merge: async (ref, opts = {}) => {
      const target = requireRevision(ref, 'merge.ref');
      await assertNoExecutableRepoConfig();
      const args = ['merge'];
      if (opts.fastForwardOnly) {
        args.push('--ff-only');
      }
      if (opts.noFastForward) {
        args.push('--no-ff');
      }
      args.push('--end-of-options', target);
      return runGit(args);
    },

    /**
     * @param {GitRebaseInput} input
     * @returns {Promise<string>}
     */
    rebase: async input => {
      await assertNoExecutableRepoConfig();
      if (input.mode === 'start') {
        return runGit([
          'rebase',
          '--end-of-options',
          requireRevision(input.upstream, 'rebase.upstream'),
        ]);
      }
      if (input.mode === 'continue') {
        return runGit(['rebase', '--continue']);
      }
      if (input.mode === 'abort') {
        return runGit(['rebase', '--abort']);
      }
      if (input.mode === 'skip') {
        return runGit(['rebase', '--skip']);
      }
      throw new Error('rebase mode must be start, continue, abort, or skip');
    },

    /**
     * @param {GitBackendStashPushOptions} [opts]
     * @returns {Promise<string>}
     */
    stashPush: async (opts = {}) => {
      await assertNoExecutableRepoConfig();
      const args = ['stash', 'push'];
      if (opts.includeUntracked) {
        args.push('--include-untracked');
      }
      if (opts.message !== undefined) {
        args.push(
          '--message',
          requireNonEmptyString(opts.message, 'stash message'),
        );
      }
      if (Array.isArray(opts.paths) && opts.paths.length > 0) {
        for (const p of opts.paths) {
          requireNonEmptyString(p, 'stash path');
        }
        args.push('--', ...opts.paths);
      }
      return runGit(args);
    },

    /**
     * @returns {Promise<string[]>}
     */
    stashList: async () => {
      const stdout = (await runGitRaw(['stash', 'list'])).trim();
      if (stdout === '') {
        return harden([]);
      }
      return harden(stdout.split('\n'));
    },

    /**
     * @param {number} [index]
     * @returns {Promise<string>}
     */
    stashShow: async index => {
      const args = ['stash', 'show', '--patch'];
      if (index !== undefined) {
        if (!Number.isInteger(index) || index < 0) {
          throw new Error('stash index must be a non-negative integer');
        }
        args.push(`stash@{${index}}`);
      }
      return runGit(args);
    },

    /**
     * @param {number} [index]
     * @returns {Promise<void>}
     */
    stashApply: async index => {
      await assertNoExecutableRepoConfig();
      const args = ['stash', 'apply'];
      if (index !== undefined) {
        if (!Number.isInteger(index) || index < 0) {
          throw new Error('stash index must be a non-negative integer');
        }
        args.push(`stash@{${index}}`);
      }
      await runGit(args);
    },

    /**
     * @param {number} [index]
     * @returns {Promise<void>}
     */
    stashPop: async index => {
      await assertNoExecutableRepoConfig();
      const args = ['stash', 'pop'];
      if (index !== undefined) {
        if (!Number.isInteger(index) || index < 0) {
          throw new Error('stash index must be a non-negative integer');
        }
        args.push(`stash@{${index}}`);
      }
      await runGit(args);
    },

    /**
     * @param {number} [index]
     * @returns {Promise<void>}
     */
    stashDrop: async index => {
      await assertNoExecutableRepoConfig();
      const args = ['stash', 'drop'];
      if (index !== undefined) {
        if (!Number.isInteger(index) || index < 0) {
          throw new Error('stash index must be a non-negative integer');
        }
        args.push(`stash@{${index}}`);
      }
      await runGit(args);
    },

    /**
     * Returns a `ReadableTree` exo for the given tree-ish.  Blob children
     * implement `ReadableBlob`.
     *
     * @param {string} ref
     * @returns {Promise<unknown>}
     */
    tree: async ref => {
      const revision = requireRevision(ref, 'tree.ref');
      const rawTree = await runGitRaw([
        'rev-parse',
        '--verify',
        '--end-of-options',
        `${revision}^{tree}`,
      ]);
      return makeGitTree(rawTree.trim());
    },

    remoteFetch: async input => {
      const opts =
        /** @type {{ url?: unknown, refspecs?: unknown, prune?: boolean, tags?: boolean, credential?: unknown, signal?: AbortSignal }} */ (
          input
        );
      const url = requireRevision(opts.url, 'remoteFetch.url');
      const refspecs = Array.isArray(opts.refspecs)
        ? opts.refspecs.map((refspec, index) =>
            requireNonEmptyString(refspec, `remoteFetch.refspecs[${index}]`),
          )
        : [];
      await assertNoExecutableRepoConfig();
      await assertNoRemoteTransportRepoConfig();
      const selectors = selectorsForFetchRefspecs(refspecs);
      const before = await readRefMap([...selectors]);
      const args = [...remoteProtocolArgs(url), 'fetch'];
      if (opts.prune) {
        args.push('--prune');
      }
      args.push(opts.tags ? '--tags' : '--no-tags');
      args.push(url, ...refspecs);
      const credentialBytes = credentialBytesFor(opts.credential);
      let text;
      if (credentialBytes === undefined) {
        text = await runGit(args, undefined, opts.signal);
      } else {
        const { stdout, stderr } = await runGitWithAskpass(
          args,
          credentialBytes,
          opts.signal,
        );
        const output = `${stdout}${stderr ? `\n[stderr]:\n${stderr}` : ''}`;
        text = truncateOutput(output.trim() || '(no output)');
      }
      const after = await readRefMap([...selectors]);
      const updatedRefs = summarizeFetchRefUpdates(refspecs, before, after);
      return harden({ updatedRefs, text });
    },

    remotePush: async input => {
      const opts =
        /** @type {{ url?: unknown, refspecs?: unknown, setUpstream?: boolean, credential?: unknown, signal?: AbortSignal }} */ (
          input
        );
      const url = requireRevision(opts.url, 'remotePush.url');
      const refspecs = Array.isArray(opts.refspecs)
        ? opts.refspecs.map((refspec, index) =>
            requireNonEmptyString(refspec, `remotePush.refspecs[${index}]`),
          )
        : [];
      if (refspecs.length === 0) {
        throw new Error('remotePush.refspecs must not be empty');
      }
      await assertNoExecutableRepoConfig();
      await assertNoRemoteTransportRepoConfig();
      const args = [...remoteProtocolArgs(url), 'push', '--porcelain'];
      if (opts.setUpstream) {
        args.push('--set-upstream');
      }
      args.push(url, ...refspecs);
      const credentialBytes = credentialBytesFor(opts.credential);
      const raw =
        credentialBytes === undefined
          ? await runGitRaw(args, undefined, opts.signal)
          : (await runGitWithAskpass(args, credentialBytes, opts.signal))
              .stdout;
      const updatedRefs = await parsePushPorcelainUpdates(raw);
      const text = truncateOutput(raw.trim() || '(no output)');
      return harden({ updatedRefs, text });
    },

    /**
     * Resolve a ref to a canonical tree OID.  Used by the endo-fs
     * `filesystemAt(ref)` path so the returned Filesystem is pinned to
     * a specific OID rather than tracking the ref.  Returns the commit
     * OID alongside when the ref resolves to a commit (the common case);
     * a bare tree ref leaves `commitOid` undefined.
     *
     * @param {string} ref
     */
    resolveTree: async ref => {
      const revision = requireRevision(ref, 'resolveTree.ref');
      const rawTree = await runGitRaw([
        'rev-parse',
        '--verify',
        '--end-of-options',
        `${revision}^{tree}`,
      ]);
      const treeOid = rawTree.trim();
      let commitOid;
      try {
        const rawCommit = await runGitRaw([
          'rev-parse',
          '--verify',
          '--end-of-options',
          `${revision}^{commit}`,
        ]);
        commitOid = rawCommit.trim();
      } catch {
        commitOid = undefined;
      }
      return harden({
        treeOid,
        ...(commitOid !== undefined ? { commitOid } : {}),
      });
    },

    /**
     * Enumerate entries at a tree OID via `git ls-tree -z --long`.
     * The records are immutable for a given tree OID and safe to cache.
     *
     * @param {string} treeOid
     */
    lsTree: async treeOid => {
      const oid = requireRevision(treeOid, 'lsTree.treeOid');
      const entries = await listTreeEntries(oid);
      return harden(entries);
    },

    /**
     * Read full bytes of a blob.
     *
     * @param {string} blobOid
     */
    readBlobBytes: async blobOid => {
      const oid = requireRevision(blobOid, 'readBlobBytes.blobOid');
      return readBlobBytes(oid);
    },

    /**
     * Stream blob bytes for range-read paths.  Yields chunks; callers
     * concatenate or slice as needed.
     *
     * @param {string} blobOid
     */
    streamBlobBytes: blobOid => {
      const oid = requireRevision(blobOid, 'streamBlobBytes.blobOid');
      return streamBlobBytes(oid);
    },
  });
};
harden(makeNativeGitBackend);

// Internal helpers exported for tests.  Not part of the public surface.
export const internalHelpers = harden({
  GIT_BASE_ARGS,
  GIT_TIMEOUT_MS,
  GIT_MAX_BUFFER,
  TOOL_OUTPUT_LIMIT,
  makeGitEnv,
  truncateOutput,
  requireNonEmptyString,
  requireAskpassLine,
  requireRevision,
  parseGitVersion,
  assertSupportedGitVersion,
  compareVersion,
  ROLE_USERNAME,
  ROLE_PASSWORD,
  encodeCredentialRecord,
  encodeCredentialRecords,
  credentialBytesFor,
  gitAskpassHelperPath,
});
