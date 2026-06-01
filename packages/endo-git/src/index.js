// @ts-check

// Re-exports added as each module moves out of @endo/daemon.  See
// designs/extract-endo-git-package.md for phases.

export {
  makeNativeGitBackend,
  internalHelpers,
} from './native-git-backend.js';

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
