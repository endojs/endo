import { makeGit } from '../src/git.js';
import type { EndoGit } from '../src/types.js';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2
    ? true
    : false;

type Assert<T extends true> = T;

type MakeGitReturn = ReturnType<typeof makeGit>;

type _MakeGitReturnsEndoGit = Assert<Equal<MakeGitReturn, EndoGit>>;
