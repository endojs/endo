// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import { getInterfaceGuardPayload } from '@endo/patterns';
import { GitInterface } from '@endo/exo-git';
import { FilesystemInterface } from '@endo/platform/fs/extended/type-guards.js';

/** @import { InterfaceGuard } from '@endo/patterns' */

import { gitDeclarations } from '../generated/code-mode-globals/git-declarations.js';
import { fsDeclarations } from '../generated/code-mode-globals/fs-declarations.js';
import {
  buildGitTypeDeclarations,
  buildGitIRs,
  GIT_HISTORY_MEMBERS,
  GIT_READONLY_MEMBERS,
} from '../scripts/code-mode-git-extract.js';
import {
  buildFsTypeDeclarations,
  buildWorkspaceIR,
} from '../scripts/code-mode-fs-extract.js';

/**
 * @param {string} aux
 * @returns {string[]}
 */
const declaredTypeNames = aux =>
  [...aux.matchAll(/^type ([A-Za-z_$][0-9A-Za-z_$]*)/gm)].map(
    ([, name]) => name,
  );

// Freshness gate (git): the checked-in git artifact must equal a fresh
// extraction, so a change to the exo-git types.d.ts or to a renderer cannot
// land without regenerating and committing the declarations.
test('generated git declarations are up to date with their source', t => {
  const fresh = buildGitTypeDeclarations();
  t.deepEqual(Object.keys(gitDeclarations).sort(), Object.keys(fresh).sort());
  for (const key of Object.keys(fresh)) {
    t.deepEqual(
      gitDeclarations[key],
      fresh[key],
      `${key} declaration is stale; run: yarn workspace @endo/agent-tools gen:code-mode-types`,
    );
  }
});

// Freshness gate (fs): the checked-in workspace artifact must equal a fresh
// extraction from the FS guards.
test('generated fs declarations are up to date with their source', t => {
  const fresh = buildFsTypeDeclarations();
  t.deepEqual(Object.keys(fsDeclarations).sort(), Object.keys(fresh).sort());
  for (const key of Object.keys(fresh)) {
    t.deepEqual(
      fsDeclarations[key],
      fresh[key],
      `${key} declaration is stale; run: yarn workspace @endo/agent-tools gen:code-mode-types`,
    );
  }
});

// The base declaration stays guard-canonical except for the deliberately
// attenuated history-rewrite methods. `gitHistory` carries those separately.
test('git declarations split the GitInterface history-rewrite method', t => {
  const { git } = buildGitIRs();
  const tsMembers = git.members.map(member => member.name).sort();
  const guardMethods = Object.keys(
    getInterfaceGuardPayload(/** @type {InterfaceGuard} */ (GitInterface))
      .methodGuards,
  )
    .filter(name => !GIT_HISTORY_MEMBERS.includes(name) || name === 'commit')
    .sort();
  t.deepEqual(tsMembers, guardMethods);
});

test('read-only git is a subset of read-write git and omits mutators', t => {
  const { git, gitReadOnly } = buildGitIRs();
  const readWrite = new Set(git.members.map(member => member.name));
  const readOnly = gitReadOnly.members.map(member => member.name);
  for (const name of readOnly) {
    t.true(
      readWrite.has(name),
      `read-only member ${name} missing from read-write`,
    );
  }
  t.deepEqual([...readOnly].sort(), [...GIT_READONLY_MEMBERS].sort());
  // A self-referential return (`readOnly(): ReadOnlyEndoGit`) must not leak the
  // mutating surface back into the read-only declaration.
  t.false(gitReadOnly.members.some(member => member.name === 'commit'));
  t.false(gitReadOnly.members.some(member => member.name === 'merge'));
  t.false(gitDeclarations.gitReadOnly.aux.includes('commit:'));
  t.true(readOnly.includes('log'));
  t.true(readOnly.includes('diff'));
});

test('git declarations expand the reachable platform filesystem contracts', t => {
  const { aux } = gitDeclarations.git;
  t.false(aux.includes("import('@endo/platform"));
  for (const shape of [
    'type GitPathEntry =',
    'child: (name: string) => GitLitePathEntry;',
    'type GitPathEntryIssuer =',
    'entry: (path: string | string[]) => GitLitePathEntry;',
    'type GitDirectory =',
    'lookup: (path: string | string[]) => Promise<unknown>;',
    'type GitDirectoryWriteSource = GitReadableBlobSource | GitLiteReadableTree;',
    'write: (path: string[], value: GitDirectoryWriteSource) => Promise<void>;',
    'type GitFile =',
    'type GitFilesystem =',
    'root(): GitERef<GitExtendedDirectory>;',
    'type GitReadableBlob =',
    'type GitReadableTree =',
  ]) {
    t.true(aux.includes(shape), `missing reachable type shape: ${shape}`);
  }
});

test('combined Git and workspace declarations have unique alias names', t => {
  const combined = [fsDeclarations.workspace.aux, gitDeclarations.git.aux].join(
    '\n',
  );
  const names = declaredTypeNames(combined);
  t.deepEqual(
    names,
    [...new Set(names)],
    'workspace and Git aliases must not declare the same TypeScript name',
  );
});

test('Git declarations define every reachable custom filesystem alias', t => {
  const declared = new Set(declaredTypeNames(gitDeclarations.git.aux));
  for (const name of [
    'GitERef',
    'GitFilesystemStats',
    'GitSnapshotTree',
    'GitSnapshotBlob',
    'GitBlobInfo',
  ]) {
    t.true(declared.has(name), `missing generated alias: ${name}`);
  }
  t.false(gitDeclarations.git.aux.includes("import('@endo/platform"));
});

test('base and history git declarations split history rewrite authority', t => {
  const { git, gitHistory } = buildGitIRs();
  const baseCommit = git.members.find(member => member.name === 'commit');
  if (baseCommit === undefined) {
    t.fail('base git declaration must include commit');
    return;
  }
  t.is(baseCommit.signature, '(message: string) => Promise<GitCommit>');
  for (const name of GIT_HISTORY_MEMBERS) {
    if (name !== 'commit') {
      t.false(git.members.some(member => member.name === name));
    }
  }
  t.deepEqual(
    gitHistory.members.map(member => member.name).sort(),
    [...GIT_HISTORY_MEMBERS].sort(),
  );
  t.true(
    gitHistory.members.some(member =>
      member.signature.includes('GitCommitOptions'),
    ),
  );
});

// The FS `.d.ts` is a stub, so `workspace` is derived from the interface
// guards. `sloppy: true` on FilesystemInterface means the live surface can be a
// superset; the declaration must stay a subset of the guard's declared methods.
test('workspace declarations derive from the Filesystem guard', t => {
  const workspace = buildWorkspaceIR();
  const members = workspace.members.map(member => member.name);
  const guardMethods = Object.keys(
    getInterfaceGuardPayload(
      /** @type {InterfaceGuard} */ (FilesystemInterface),
    ).methodGuards,
  );
  for (const name of members) {
    t.true(
      guardMethods.includes(name),
      `${name} is not a Filesystem guard method`,
    );
  }
});

test('workspace declaration reaches the Directory surface transitively', t => {
  const { workspace } = fsDeclarations;
  t.is(workspace.body, 'Filesystem');
  t.true(workspace.aux.includes('type ERef<T> = T | Promise<T>;'));
  t.true(workspace.aux.includes('type Directory = {'));
  // Directory verbs only reachable transitively from `root()`.
  t.true(workspace.aux.includes('lookup:'));
  t.true(workspace.aux.includes('write:'));
});
