// @ts-check
/// <reference types="ses"/>

/**
 * Git-specific code-mode type extraction: the `git`, `gitHistory`, and `gitReadOnly`
 * declarations, built with the generic TypeScript renderer from
 * `@endo/exo-git`'s checked TypeScript typedef source.
 *
 * `git` reads `packages/exo-git/src/types.ts` (the `WritableEndoGit` alias), which is
 * full-fidelity: named parameters, no lossy positional guards. The divergence
 * gate keeps it from drifting from the runtime `GitInterface` guard.
 *
 * The read-only declaration is sourced from the separately published
 * `ReadOnlyEndoGit` alias, with the member list retained as a prompt-surface
 * divergence gate.
 *
 * Guard-canonical DERIVATION for git (synthesizing the printed types from
 * `GitInterface` instead of the TS) was considered and is TABLED: it would
 * discard the more expressive hand-written TS. The guard stays the enforcement
 * layer; the divergence gate keeps the printed git types aligned with it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  extractTsFileTextIR,
  renderDeclaration,
} from './code-mode-type-extract.js';

const GIT_TYPES_TS_URL = new URL('../../exo-git/src/types.ts', import.meta.url);
const GIT_ROOT_TYPE = 'WritableEndoGit';
const GIT_READONLY_ROOT_TYPE = 'ReadOnlyEndoGit';

export const GIT_HISTORY_MEMBERS = harden([
  'commit',
  'reword',
  'cherryPick',
  'rebase',
]);
harden(GIT_HISTORY_MEMBERS);

/**
 * Attenuate a canonical method signature by dropping its optional final
 * options argument while retaining the extracted parameter and return types.
 *
 * @param {string} signature
 * @returns {string}
 */
const withoutOptionalFinalArgument = signature => {
  const attenuated = signature.replace(/, [^,]+\?: [^)]+(?=\) =>)/u, '');
  if (attenuated === signature) {
    throw new Error(`expected an optional final argument in ${signature}`);
  }
  return attenuated;
};
harden(withoutOptionalFinalArgument);

/**
 * The read-only code-mode git prompt surface: the inspection verbs. Mutating
 * verbs (`add`, `restore`, `commit`, branch/stash mutations, `merge`, `rebase`,
 * checkout) are omitted so a read-only agent is not told about verbs that would
 * reject at the cap boundary.
 *
 * @type {string[]}
 */
export const GIT_READONLY_MEMBERS = harden([
  'worktree',
  'status',
  'diff',
  'log',
  'show',
  'revParse',
  'currentBranch',
  'branches',
  'tree',
  'filesystemAt',
  'stashList',
  'stashShow',
  'readOnly',
]);
harden(GIT_READONLY_MEMBERS);

/**
 * Build the `git`, `gitHistory`, and `gitReadOnly` IRs from the checked Git
 * capability types.
 *
 * @returns {{ git: import('./code-mode-type-extract.js').GlobalTypeIR, gitHistory: import('./code-mode-type-extract.js').GlobalTypeIR, gitReadOnly: import('./code-mode-type-extract.js').GlobalTypeIR }}
 */
export const buildGitIRs = () =>
  harden(
    (() => {
      const fileName = fileURLToPath(GIT_TYPES_TS_URL);
      const text = readFileSync(fileName, 'utf8');
      const git = extractTsFileTextIR({
        fileName,
        text,
        rootType: GIT_ROOT_TYPE,
      });
      const gitHistory = extractTsFileTextIR({
        fileName,
        text,
        rootType: GIT_ROOT_TYPE,
        memberFilter: GIT_HISTORY_MEMBERS,
      });
      const commit = git.members.find(member => member.name === 'commit');
      if (commit === undefined) {
        throw new Error('WritableEndoGit must define commit');
      }
      return {
        git: harden({
          rootName: 'WritableEndoGit',
          members: git.members
            .filter(
              member =>
                !GIT_HISTORY_MEMBERS.includes(member.name) ||
                member.name === 'commit',
            )
            .map(member =>
              member.name === 'commit'
                ? harden({
                    ...commit,
                    signature: withoutOptionalFinalArgument(commit.signature),
                  })
                : member,
            ),
          auxTypes: git.auxTypes.filter(
            type => type.name !== 'GitCommitOptions',
          ),
        }),
        gitHistory: harden({ ...gitHistory, rootName: 'EndoGitHistory' }),
        gitReadOnly: extractTsFileTextIR({
          fileName,
          text,
          rootType: GIT_READONLY_ROOT_TYPE,
          memberFilter: GIT_READONLY_MEMBERS,
        }),
      };
    })(),
  );
harden(buildGitIRs);

/**
 * Render the `git`, `gitHistory`, and `gitReadOnly` `{ aux, body }` declaration strings.
 *
 * @returns {Record<'git' | 'gitHistory' | 'gitReadOnly', { aux: string, body: string }>}
 */
export const buildGitTypeDeclarations = () => {
  const irs = buildGitIRs();
  return harden({
    // Git reaches both the lite and extended filesystem modules.
    // Prefix its supporting aliases so its generated block can compose with
    // workspace declaration, which has its own Directory, File, and
    // Filesystem shapes.
    git: renderDeclaration(irs.git, { auxPrefix: 'Git' }),
    gitHistory: renderDeclaration(irs.gitHistory, { auxPrefix: 'Git' }),
    gitReadOnly: renderDeclaration(irs.gitReadOnly, { auxPrefix: 'Git' }),
  });
};
harden(buildGitTypeDeclarations);
