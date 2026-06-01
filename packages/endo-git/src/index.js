// @ts-check

// Re-exports added as each module moves out of @endo/daemon.  See
// designs/extract-endo-git-package.md for phases.

export {
  makeGit,
  isGitReadOnly,
  getGitBackend,
  makeNotYetImplementedBackend,
} from './git.js';

export { makeGitFsBackend } from './git-filesystem.js';

export {
  makeNativeGitBackend,
  internalHelpers,
} from './native-git-backend.js';

export { makeGitRemote, getGitRemoteController } from './git-remote.js';

export {
  makeBasicCredential,
  makeBearerCredential,
  makeUnavailableGitCredential,
  assertGitCredentialForUrl,
  revokeGitCredential,
  getGitCredentialController,
} from './git-credential.js';

export {
  GitInterface,
  GitRemoteInterface,
  GitRemoteControllerInterface,
  GitCredentialControllerInterface,
  BasicCredentialInterface,
  BearerCredentialInterface,
} from './interfaces.js';
