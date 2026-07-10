// @ts-check
/// <reference types="ses"/>

/**
 * Git-specific code-mode type extraction: the `git`, `gitHistory`, and `gitReadOnly`
 * declarations, built with the generic TypeScript renderer from
 * `@endo/exo-git`'s checked TypeScript typedef source.
 *
 * `git` reads `packages/exo-git/src/types.ts` (the `EndoGit` alias), which is
 * full-fidelity: named parameters, no lossy positional guards. The divergence
 * gate keeps it from drifting from the runtime `GitInterface` guard.
 *
 * The read-only vs read-write `git` split is a code-mode prompt-surface POLICY
 * (a per-mode member allowlist, {@link GIT_READONLY_MEMBERS}), applied to the
 * shared IR rather than read from the source. The runtime read-only enforcement
 * remains the exo guard / `readOnly()` rejection; this allowlist only governs
 * which verbs the prompt advertises.
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
const GIT_ROOT_TYPE = 'EndoGit';

export const GIT_HISTORY_MEMBERS = harden(['commit', 'reword']);
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
 * Build the `git`, `gitHistory`, and `gitReadOnly` IRs from the checked `EndoGit` JSDoc
 * typedef; the read-only IR is the same source narrowed to
 * {@link GIT_READONLY_MEMBERS}.
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
        throw new Error('EndoGit must define commit');
      }
      return {
        git: harden({
          rootName: 'EndoGit',
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
          rootType: GIT_ROOT_TYPE,
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
    git: renderDeclaration(irs.git),
    gitHistory: renderDeclaration(irs.gitHistory),
    gitReadOnly: renderDeclaration(irs.gitReadOnly),
  });
};
harden(buildGitTypeDeclarations);
