import type { WritableGitWorktree } from '@endo/exo-git';

import { makeGitMountTools } from '../src/git-mount-tool.js';
import type { GitMountToolCapability } from '../src/types.js';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2
    ? true
    : false;

type Assert<T extends true> = T;

type _BridgeReturnsWritableWorktree = Assert<
  Equal<
    Awaited<ReturnType<GitMountToolCapability['worktree']>>,
    WritableGitWorktree
  >
>;
type _BridgeCapabilityIsTyped = Assert<
  Equal<
    Parameters<typeof makeGitMountTools>[0],
    import('@endo/eventual-send').ERef<GitMountToolCapability>
  >
>;
