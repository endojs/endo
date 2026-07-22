// @ts-check
/// <reference types="ses"/>

/**
 * GENERATED FILE - do not edit by hand.
 *
 * Regenerate with: yarn workspace @endo/agent-tools gen:code-mode-types
 *
 * Source of truth:
 *   - git / gitHistory / gitReadOnly: packages/exo-git/src/types.ts (the
 *     `ReadWriteEndoGit`, `HistoryRewriteEndoGit`, and `ReadOnlyEndoGit`
 *     type alias), printed by the typescript compiler API
 *     (TypeScript-canonical).
 *
 * The generic extraction and rendering live in
 * scripts/code-mode-type-extract.js; this exo's source configuration lives in
 * its scripts/code-mode-*-extract.js extractor. The divergence gate in
 * test/code-mode-types.test.js keeps this artifact fresh.
 *
 * Each entry is consumed by formatGlobalDeclarations in code-mode/declarations.js via
 * the per-exo descriptor in code-mode-globals/git.js:
 * `aux` is the supporting `type` aliases, `body` is the object type spliced
 * after the dynamic `declare const <name>:`.
 */

export const gitDeclarations = harden({
  git: {
    aux: `type WritableEndoGit = {
  worktree: () => Promise<GitWritableGitWorktree>;
  status: () => Promise<GitStatusEntry[]>;
  diff: (options?: GitDiffOptions) => Promise<string>;
  log: (options?: GitLogOptions) => Promise<GitCommit[]>;
  show: (ref: GitRef | string) => Promise<string>;
  revParse: (ref: GitRef | string) => Promise<GitRef>;
  currentBranch: () => Promise<GitRef | undefined>;
  branches: () => Promise<GitRef[]>;
  stashList: () => Promise<string[]>;
  stashShow: (index?: number) => Promise<string>;
  tree: (ref: GitRef | string) => Promise<GitReadableTree>;
  filesystemAt: (ref: GitRef | string) => Promise<GitFilesystem>;
  readOnly: () => GitReadOnlyEndoGit;
  add: (entries: GitPathEntry[]) => Promise<void>;
  restore: (entries: GitPathEntry[], options?: GitRestoreOptions) => Promise<void>;
  commit: (message: string) => Promise<GitCommit>;
  createBranch: (name: string, options?: GitCreateBranchOptions) => Promise<GitRef>;
  deleteBranch: (name: string, options?: GitDeleteBranchOptions) => Promise<void>;
  renameBranch: (from: string, to: string) => Promise<void>;
  switchBranch: (name: string) => Promise<void>;
  detach: (ref: GitRef | string) => Promise<void>;
  switch: (ref: GitRef | string) => Promise<void>;
  merge: (ref: GitRef | string, options?: GitMergeOptions) => Promise<string>;
  stashPush: (options?: GitStashPushOptions) => Promise<string>;
  stashApply: (index?: number) => Promise<void>;
  stashPop: (index?: number) => Promise<void>;
  stashDrop: (index?: number) => Promise<void>;
};
type GitBlobInfo = {
    algorithm: string;
    hash: string;
    size: bigint;
};
type GitCursor = {
    read(limit?: bigint): Promise<{
        entries: unknown[];
        atEnd: boolean;
    }>;
    stream(): any;
};
type GitDirectory = GitLiteDirectory;
type GitDirectoryWriteSource = GitReadableBlobSource | GitLiteReadableTree;
type GitERef<T> = T | Promise<T>;
type GitExtendedDirectory = {
    getQid(): GitQid;
    getStat(): Promise<GitNodeStat>;
    setStat(patch: GitNodeStat): Promise<void>;
    getAttrs(): Promise<GitNodeStat>;
    setAttrs(patch: GitNodeStat): Promise<void>;
    watch(): GitERef<GitNodeWatcher>;
    xattrs(): GitERef<GitXattrs>;
    lookup(nameOrPath: string | string[]): GitERef<any>;
    lookupStep(name: string): GitERef<any>;
    subView(nameOrPath: string | string[]): GitERef<GitExtendedDirectory>;
    list(): GitERef<GitCursor>;
    write(name: string, value: string): Promise<void>;
    create(name: string, opts?: GitOpenFileOptions): GitERef<GitOpenFile>;
    makeDirectory(name: string, opts?: object): GitERef<GitExtendedDirectory>;
    mkdir(name: string, opts?: object): GitERef<GitExtendedDirectory>;
    remove(name: string): Promise<void>;
    unlink(name: string): Promise<void>;
    move(fromPath: string | string[], toPath: string | string[]): Promise<void>;
    copy(fromPath: string | string[], toPath: string | string[]): Promise<void>;
    rename(oldName: string, newParent: GitERef<GitExtendedDirectory>, newName: string): Promise<void> | void;
    fsync(): Promise<void>;
    materialise(path: string[], opts?: object): GitERef<GitExtendedDirectory>;
    watchFrom(): GitERef<object>;
    help(method?: string): string;
};
type GitExtendedFilesystem = {
    root(): GitERef<GitExtendedDirectory>;
    named(name: string): GitERef<GitExtendedDirectory>;
    statfs(): Promise<GitFilesystemStats>;
    brands(): Promise<ReadonlySet<bigint> | readonly bigint[]>;
    help(method?: string): string;
};
type GitFile = GitLiteFile;
type GitFilesystem = GitExtendedFilesystem;
type GitFilesystemStats = {
    blockSize?: bigint;
    totalBlocks?: bigint;
    freeBlocks?: bigint;
    totalBytes?: bigint;
    freeBytes?: bigint;
    files?: bigint;
    directories?: bigint;
    type?: string;
};
type GitCommit = {
    oid: string;
    summary: string;
    author?: string;
    committedAt?: number;
};
type GitCreateBranchOptions = {
    startPoint?: string;
    switchAfterCreate?: boolean;
};
type GitDeleteBranchOptions = {
    force?: boolean;
};
type GitDiffOptions = {
    cached?: boolean;
    base?: GitRef | string;
    head?: GitRef | string;
    entries?: GitPathEntry[];
    paths?: string[];
};
type GitIndexStatus = 'clean' | 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'conflicted';
type GitLogOptions = {
    maxCount?: number;
    ref?: GitRef | string;
    since?: string;
    until?: string;
};
type GitMergeOptions = {
    fastForwardOnly?: boolean;
    noFastForward?: boolean;
};
type GitRef = {
    name: string;
    kind: 'branch' | 'tag' | 'commit' | 'detached';
    oid?: string;
};
type GitRestoreOptions = {
    staged?: boolean;
};
type GitStashPushOptions = {
    message?: string;
    entries?: GitPathEntry[];
    paths?: string[];
    includeUntracked?: boolean;
};
type GitStatusEntry = {
    entry: GitPathEntry;
    path: string;
    index: GitIndexStatus;
    worktree: GitWorktreeStatus;
    node?: GitStatusNode;
    renamedFrom?: string;
};
type GitStatusNode = GitDirectory | GitFile | GitReadableTree | GitReadableBlob;
type GitWorktreeStatus = 'clean' | 'modified' | 'deleted' | 'untracked' | 'ignored' | 'conflicted';
type GitLiteDirectory = {
    has: (...path: string[]) => Promise<boolean>;
    list: (...path: string[]) => Promise<string[]>;
    lookup: (path: string | string[]) => Promise<unknown>;
    write: (path: string[], value: GitDirectoryWriteSource) => Promise<void>;
    remove: (path: string[]) => Promise<void>;
    move: (from: string[], to: string[]) => Promise<void>;
    copy: (from: string[], to: string[]) => Promise<void>;
    makeDirectory: (path: string[]) => Promise<GitLiteDirectory>;
    readOnly: () => GitLiteReadableTree;
    snapshot: () => Promise<GitSnapshotTree>;
};
type GitLiteFile = {
    streamBase64: (synPromise: unknown) => Promise<unknown>;
    text: () => Promise<string>;
    json: () => Promise<any>;
    writeText: (content: string) => Promise<void>;
    writeBytes: (readable: unknown) => Promise<void>;
    append: (content: string) => Promise<void>;
    readOnly: () => GitLiteReadableBlob;
    snapshot: () => Promise<GitSnapshotBlob>;
};
type GitLitePathEntry = {
    segments: () => string[];
    displayPath: () => string;
    child: (name: string) => GitLitePathEntry;
    help: (method?: string) => string;
};
type GitLitePathEntryIssuer = {
    entry: (path: string | string[]) => GitLitePathEntry;
};
type GitLiteReadableBlob = {
    streamBase64: (synPromise: unknown) => Promise<unknown>;
    text: () => Promise<string>;
    json: () => Promise<any>;
    help: (method?: string) => string;
};
type GitLiteReadableTree = {
    has: (...petNamePath: string[]) => Promise<boolean>;
    list: (...petNamePath: string[]) => Promise<readonly string[]>;
    lookup: (petNamePath: string | readonly string[]) => Promise<unknown>;
    listTree?: (petNamePath: string | readonly string[], options?: {
        ignore?: readonly string[];
    }) => Promise<GitTreeEntry[]>;
};
type GitNodeStat = {
    size?: bigint;
    mtime?: bigint;
    atime?: bigint;
};
type GitNodeWatcher = {
    events(): any;
    cancel(): Promise<void>;
};
type GitOpenFile = {
    read(offset: bigint, length?: bigint): GitERef<object>;
    write(...args: any[]): any;
    truncate(size: bigint): Promise<void>;
    lock(opts?: object): GitERef<object>;
    close(): Promise<void>;
};
type GitOpenFileOptions = {
    read?: boolean;
    write?: boolean;
    create?: boolean;
    truncate?: boolean;
    append?: boolean;
};
type GitPathEntry = GitLitePathEntry;
type GitPathEntryIssuer = GitLitePathEntryIssuer;
type GitQid = {
    type: 'file' | 'directory';
    version?: bigint;
    path?: bigint;
};
type GitReadOnlyEndoGit = {
    worktree: () => Promise<GitReadOnlyGitWorktree>;
    status: () => Promise<GitStatusEntry[]>;
    diff: (options?: GitDiffOptions) => Promise<string>;
    log: (options?: GitLogOptions) => Promise<GitCommit[]>;
    show: (ref: GitRef | string) => Promise<string>;
    revParse: (ref: GitRef | string) => Promise<GitRef>;
    currentBranch: () => Promise<GitRef | undefined>;
    branches: () => Promise<GitRef[]>;
    stashList: () => Promise<string[]>;
    stashShow: (index?: number) => Promise<string>;
    tree: (ref: GitRef | string) => Promise<GitReadableTree>;
    filesystemAt: (ref: GitRef | string) => Promise<GitFilesystem>;
    readOnly: () => GitReadOnlyEndoGit;
};
type GitReadOnlyGitWorktree = GitReadableTree;
type GitReadableBlob = GitReadableBlobRange;
type GitReadableBlobRange = GitLiteReadableBlob & {
    getInfo: () => Promise<GitBlobInfo>;
    fetch: (offset: bigint, length: bigint) => Promise<unknown>;
};
type GitReadableBlobSource = {
    streamBase64: (...args: any[]) => PromiseLike<unknown>;
};
type GitReadableTree = GitLiteReadableTree;
type GitSnapshotBlob = GitLiteReadableBlob & {
    sha256: () => string;
    getInfo: () => Promise<GitBlobInfo>;
};
type GitSnapshotTree = GitLiteReadableTree & {
    sha256: () => string;
    getInfo: () => Promise<GitBlobInfo>;
};
type GitTreeEntry = {
    path: string[];
    type: 'file' | 'directory';
};
type GitWritableGitWorktree = GitDirectory & GitPathEntryIssuer;
type GitXattrs = {
    list(): Promise<string[]>;
    get(name: string): Promise<Uint8Array | undefined>;
    set(name: string, value: any): Promise<void>;
    remove(name: string): Promise<void>;
};`,
    body: `WritableEndoGit`,
  },
  gitHistory: {
    aux: `type EndoGitHistory = {
  commit: (message: string, options?: GitCommitOptions) => Promise<GitCommit>;
  reword: (ref: GitRef | string, message: string) => Promise<GitCommit>;
  cherryPick: (ref: GitRef | string, options?: GitCherryPickOptions) => Promise<string>;
  rebase: (input: GitRebaseInput) => Promise<string>;
};
type GitCherryPickOptions = {
    noCommit?: boolean;
};
type GitCommit = {
    oid: string;
    summary: string;
    author?: string;
    committedAt?: number;
};
type GitCommitOptions = {
    amend?: boolean;
};
type GitRebaseInput = {
    mode: 'start';
    upstream: string;
    autosquash?: boolean;
} | {
    mode: 'continue' | 'abort' | 'skip';
    upstream?: never;
    autosquash?: never;
};
type GitRef = {
    name: string;
    kind: 'branch' | 'tag' | 'commit' | 'detached';
    oid?: string;
};`,
    body: `EndoGitHistory`,
  },
  gitReadOnly: {
    aux: `type ReadOnlyEndoGit = {
  worktree: () => Promise<GitReadOnlyGitWorktree>;
  status: () => Promise<GitStatusEntry[]>;
  diff: (options?: GitDiffOptions) => Promise<string>;
  log: (options?: GitLogOptions) => Promise<GitCommit[]>;
  show: (ref: GitRef | string) => Promise<string>;
  revParse: (ref: GitRef | string) => Promise<GitRef>;
  currentBranch: () => Promise<GitRef | undefined>;
  branches: () => Promise<GitRef[]>;
  stashList: () => Promise<string[]>;
  stashShow: (index?: number) => Promise<string>;
  tree: (ref: GitRef | string) => Promise<GitReadableTree>;
  filesystemAt: (ref: GitRef | string) => Promise<GitFilesystem>;
  readOnly: () => GitImportedReadOnlyEndoGit;
};
type GitBlobInfo = {
    algorithm: string;
    hash: string;
    size: bigint;
};
type GitCursor = {
    read(limit?: bigint): Promise<{
        entries: unknown[];
        atEnd: boolean;
    }>;
    stream(): any;
};
type GitDirectory = GitLiteDirectory;
type GitDirectoryWriteSource = GitReadableBlobSource | GitLiteReadableTree;
type GitERef<T> = T | Promise<T>;
type GitExtendedDirectory = {
    getQid(): GitQid;
    getStat(): Promise<GitNodeStat>;
    setStat(patch: GitNodeStat): Promise<void>;
    getAttrs(): Promise<GitNodeStat>;
    setAttrs(patch: GitNodeStat): Promise<void>;
    watch(): GitERef<GitNodeWatcher>;
    xattrs(): GitERef<GitXattrs>;
    lookup(nameOrPath: string | string[]): GitERef<any>;
    lookupStep(name: string): GitERef<any>;
    subView(nameOrPath: string | string[]): GitERef<GitExtendedDirectory>;
    list(): GitERef<GitCursor>;
    write(name: string, value: string): Promise<void>;
    create(name: string, opts?: GitOpenFileOptions): GitERef<GitOpenFile>;
    makeDirectory(name: string, opts?: object): GitERef<GitExtendedDirectory>;
    mkdir(name: string, opts?: object): GitERef<GitExtendedDirectory>;
    remove(name: string): Promise<void>;
    unlink(name: string): Promise<void>;
    move(fromPath: string | string[], toPath: string | string[]): Promise<void>;
    copy(fromPath: string | string[], toPath: string | string[]): Promise<void>;
    rename(oldName: string, newParent: GitERef<GitExtendedDirectory>, newName: string): Promise<void> | void;
    fsync(): Promise<void>;
    materialise(path: string[], opts?: object): GitERef<GitExtendedDirectory>;
    watchFrom(): GitERef<object>;
    help(method?: string): string;
};
type GitExtendedFilesystem = {
    root(): GitERef<GitExtendedDirectory>;
    named(name: string): GitERef<GitExtendedDirectory>;
    statfs(): Promise<GitFilesystemStats>;
    brands(): Promise<ReadonlySet<bigint> | readonly bigint[]>;
    help(method?: string): string;
};
type GitFile = GitLiteFile;
type GitFilesystem = GitExtendedFilesystem;
type GitFilesystemStats = {
    blockSize?: bigint;
    totalBlocks?: bigint;
    freeBlocks?: bigint;
    totalBytes?: bigint;
    freeBytes?: bigint;
    files?: bigint;
    directories?: bigint;
    type?: string;
};
type GitCommit = {
    oid: string;
    summary: string;
    author?: string;
    committedAt?: number;
};
type GitDiffOptions = {
    cached?: boolean;
    base?: GitRef | string;
    head?: GitRef | string;
    entries?: GitPathEntry[];
    paths?: string[];
};
type GitIndexStatus = 'clean' | 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'conflicted';
type GitLogOptions = {
    maxCount?: number;
    ref?: GitRef | string;
    since?: string;
    until?: string;
};
type GitRef = {
    name: string;
    kind: 'branch' | 'tag' | 'commit' | 'detached';
    oid?: string;
};
type GitStatusEntry = {
    entry: GitPathEntry;
    path: string;
    index: GitIndexStatus;
    worktree: GitWorktreeStatus;
    node?: GitStatusNode;
    renamedFrom?: string;
};
type GitStatusNode = GitDirectory | GitFile | GitReadableTree | GitReadableBlob;
type GitWorktreeStatus = 'clean' | 'modified' | 'deleted' | 'untracked' | 'ignored' | 'conflicted';
type GitImportedReadOnlyEndoGit = {
    worktree: () => Promise<GitReadOnlyGitWorktree>;
    status: () => Promise<GitStatusEntry[]>;
    diff: (options?: GitDiffOptions) => Promise<string>;
    log: (options?: GitLogOptions) => Promise<GitCommit[]>;
    show: (ref: GitRef | string) => Promise<string>;
    revParse: (ref: GitRef | string) => Promise<GitRef>;
    currentBranch: () => Promise<GitRef | undefined>;
    branches: () => Promise<GitRef[]>;
    stashList: () => Promise<string[]>;
    stashShow: (index?: number) => Promise<string>;
    tree: (ref: GitRef | string) => Promise<GitReadableTree>;
    filesystemAt: (ref: GitRef | string) => Promise<GitFilesystem>;
    readOnly: () => GitImportedReadOnlyEndoGit;
};
type GitLiteDirectory = {
    has: (...path: string[]) => Promise<boolean>;
    list: (...path: string[]) => Promise<string[]>;
    lookup: (path: string | string[]) => Promise<unknown>;
    write: (path: string[], value: GitDirectoryWriteSource) => Promise<void>;
    remove: (path: string[]) => Promise<void>;
    move: (from: string[], to: string[]) => Promise<void>;
    copy: (from: string[], to: string[]) => Promise<void>;
    makeDirectory: (path: string[]) => Promise<GitLiteDirectory>;
    readOnly: () => GitLiteReadableTree;
    snapshot: () => Promise<GitSnapshotTree>;
};
type GitLiteFile = {
    streamBase64: (synPromise: unknown) => Promise<unknown>;
    text: () => Promise<string>;
    json: () => Promise<any>;
    writeText: (content: string) => Promise<void>;
    writeBytes: (readable: unknown) => Promise<void>;
    append: (content: string) => Promise<void>;
    readOnly: () => GitLiteReadableBlob;
    snapshot: () => Promise<GitSnapshotBlob>;
};
type GitLitePathEntry = {
    segments: () => string[];
    displayPath: () => string;
    child: (name: string) => GitLitePathEntry;
    help: (method?: string) => string;
};
type GitLiteReadableBlob = {
    streamBase64: (synPromise: unknown) => Promise<unknown>;
    text: () => Promise<string>;
    json: () => Promise<any>;
    help: (method?: string) => string;
};
type GitLiteReadableTree = {
    has: (...petNamePath: string[]) => Promise<boolean>;
    list: (...petNamePath: string[]) => Promise<readonly string[]>;
    lookup: (petNamePath: string | readonly string[]) => Promise<unknown>;
    listTree?: (petNamePath: string | readonly string[], options?: {
        ignore?: readonly string[];
    }) => Promise<GitTreeEntry[]>;
};
type GitNodeStat = {
    size?: bigint;
    mtime?: bigint;
    atime?: bigint;
};
type GitNodeWatcher = {
    events(): any;
    cancel(): Promise<void>;
};
type GitOpenFile = {
    read(offset: bigint, length?: bigint): GitERef<object>;
    write(...args: any[]): any;
    truncate(size: bigint): Promise<void>;
    lock(opts?: object): GitERef<object>;
    close(): Promise<void>;
};
type GitOpenFileOptions = {
    read?: boolean;
    write?: boolean;
    create?: boolean;
    truncate?: boolean;
    append?: boolean;
};
type GitPathEntry = GitLitePathEntry;
type GitQid = {
    type: 'file' | 'directory';
    version?: bigint;
    path?: bigint;
};
type GitReadOnlyGitWorktree = GitReadableTree;
type GitReadableBlob = GitReadableBlobRange;
type GitReadableBlobRange = GitLiteReadableBlob & {
    getInfo: () => Promise<GitBlobInfo>;
    fetch: (offset: bigint, length: bigint) => Promise<unknown>;
};
type GitReadableBlobSource = {
    streamBase64: (...args: any[]) => PromiseLike<unknown>;
};
type GitReadableTree = GitLiteReadableTree;
type GitSnapshotBlob = GitLiteReadableBlob & {
    sha256: () => string;
    getInfo: () => Promise<GitBlobInfo>;
};
type GitSnapshotTree = GitLiteReadableTree & {
    sha256: () => string;
    getInfo: () => Promise<GitBlobInfo>;
};
type GitTreeEntry = {
    path: string[];
    type: 'file' | 'directory';
};
type GitXattrs = {
    list(): Promise<string[]>;
    get(name: string): Promise<Uint8Array | undefined>;
    set(name: string, value: any): Promise<void>;
    remove(name: string): Promise<void>;
};`,
    body: `ReadOnlyEndoGit`,
  },
});
harden(gitDeclarations);
