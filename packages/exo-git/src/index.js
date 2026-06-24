// @ts-check

export {
  makeGit,
  isGitReadOnly,
  getGitBackend,
  makeNotYetImplementedBackend,
} from './git.js';

export { makeGitFsBackend } from './git-filesystem.js';

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
  GitTreeInterface,
  GitRemoteInterface,
  GitRemoteControllerInterface,
  GitCredentialControllerInterface,
  BasicCredentialInterface,
  BearerCredentialInterface,
} from './interfaces.js';
