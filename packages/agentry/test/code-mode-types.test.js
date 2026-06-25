// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import { getInterfaceGuardPayload } from '@endo/patterns';
import { GitInterface } from '@endo/exo-git';
import { FilesystemInterface } from '@endo/platform/fs/extended/type-guards.js';

/** @import { InterfaceGuard } from '@endo/patterns' */

import { gitCodeModeTypeDeclarations } from '../src/execute/git-types.js';
import { fsCodeModeTypeDeclarations } from '../src/execute/fs-types.js';
import {
  buildGitTypeDeclarations,
  buildGitIRs,
  GIT_READONLY_MEMBERS,
} from '../scripts/code-mode-git-extract.js';
import {
  buildFsTypeDeclarations,
  buildWorkspaceIR,
} from '../scripts/code-mode-fs-extract.js';

// Freshness gate (git): the checked-in git artifact must equal a fresh
// extraction, so a change to the exo-git types.d.ts or to a renderer cannot
// land without regenerating and committing the declarations.
test('generated git-types.js is up to date with its source', t => {
  const fresh = buildGitTypeDeclarations();
  t.deepEqual(
    Object.keys(gitCodeModeTypeDeclarations).sort(),
    Object.keys(fresh).sort(),
  );
  for (const key of Object.keys(fresh)) {
    t.deepEqual(
      gitCodeModeTypeDeclarations[key],
      fresh[key],
      `${key} declaration is stale; run: yarn workspace agentry gen:code-mode-types`,
    );
  }
});

// Freshness gate (fs): the checked-in workspace artifact must equal a fresh
// extraction from the FS guards.
test('generated fs-types.js is up to date with its source', t => {
  const fresh = buildFsTypeDeclarations();
  t.deepEqual(
    Object.keys(fsCodeModeTypeDeclarations).sort(),
    Object.keys(fresh).sort(),
  );
  for (const key of Object.keys(fresh)) {
    t.deepEqual(
      fsCodeModeTypeDeclarations[key],
      fresh[key],
      `${key} declaration is stale; run: yarn workspace agentry gen:code-mode-types`,
    );
  }
});

// Guard divergence gate: the TypeScript-canonical git declaration must
// enumerate exactly the methods the runtime `GitInterface` guard enforces, so
// the printed types cannot silently drift from the enforcement layer.
test('git declarations cover exactly the GitInterface guard methods', t => {
  const { git } = buildGitIRs();
  const tsMembers = git.members.map(member => member.name).sort();
  const guardMethods = Object.keys(
    getInterfaceGuardPayload(/** @type {InterfaceGuard} */ (GitInterface))
      .methodGuards,
  ).sort();
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
  // A self-referential return (`readOnly(): EndoGit`) must not leak the
  // mutating surface back into the read-only declaration.
  t.false(gitReadOnly.members.some(member => member.name === 'commit'));
  t.false(gitReadOnly.members.some(member => member.name === 'merge'));
  t.false(gitCodeModeTypeDeclarations.gitReadOnly.aux.includes('commit:'));
  t.true(readOnly.includes('log'));
  t.true(readOnly.includes('diff'));
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
  const { workspace } = fsCodeModeTypeDeclarations;
  t.is(workspace.body, 'Filesystem');
  t.true(workspace.aux.includes('type ERef<T> = T | Promise<T>;'));
  t.true(workspace.aux.includes('type Directory = {'));
  // Directory verbs only reachable transitively from `root()`.
  t.true(workspace.aux.includes('lookup:'));
  t.true(workspace.aux.includes('write:'));
});
