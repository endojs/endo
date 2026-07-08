// @ts-check
/// <reference types="ses"/>

/**
 * @import { GitRemote, GitRemoteEndpoint } from './types.js'
 */

/**
 * Constructive clone seam.  Clone differs from every `GitRemote`
 * operation: at clone time there is no repo and no `Git` to attenuate,
 * so it cannot be a method on `Git` or on a bound `GitRemote`.  This
 * maker composes `GitRemoteEndpoint` x an empty destination mount into a
 * fresh `(Git, GitRemote)` with `origin` pre-bound.
 *
 * It is deliberately a standalone maker the host merely *invokes*
 * (host-only clone), not logic buried in a host-method body, so a later
 * guest-held `GitCloner` facet + `GitClonerController` (mirroring
 * `makeGitRemote -> (remote, controller)`) is additive rather than a
 * rewrite.  This commit builds ONLY the host-only seam; it does not
 * build the guest facet or a controller.
 *
 * The native-clone and Git-construction primitives are injected so this
 * module stays portable (no Node, no daemon formula machinery): the
 * daemon wires its formula-backed `provideGit` / `provideGitRemote`
 * and the native `gitClone`; an in-process test wires the exo `makeGit`
 * / `makeGitRemote` and the same native `gitClone`.
 *
 * @param {object} args
 * @param {GitRemoteEndpoint} args.endpoint  The reusable remote authority.
 * @param {(input: { url: string, destPath: string, allowLocalFileTransport: boolean, credential?: { kind: string, material: unknown }, signal?: AbortSignal }) => Promise<unknown>} args.clone
 *   Native constructive clone into `destPath` from the endpoint URL.
 * @param {(input: { destMount: object, destPath: string }) => Promise<object>} args.makeGit
 *   Build a writable `Git` over the freshly-cloned destination.
 * @param {(input: { git: object, endpoint: GitRemoteEndpoint }) => Promise<GitRemote>} args.makeRemote
 *   Bind `origin` as a `GitRemote` over endpoint x the new `Git`.
 */
export const makeGitCloner = ({ endpoint, clone, makeGit, makeRemote }) => {
  if (endpoint === undefined || typeof endpoint.url !== 'string') {
    throw new Error('makeGitCloner requires a GitRemoteEndpoint');
  }
  for (const [name, fn] of [
    ['clone', clone],
    ['makeGit', makeGit],
    ['makeRemote', makeRemote],
  ]) {
    if (typeof fn !== 'function') {
      throw new Error(`makeGitCloner requires a ${name} function`);
    }
  }

  const cloner = harden({
    /**
     * @param {object} input
     * @param {object} input.destMount  The (empty) destination mount.
     * @param {string} input.destPath  Host path of `destMount`.
     * @param {AbortSignal} [input.signal]
     * @returns {Promise<{ git: object, remote: GitRemote }>}
     */
    async clone({ destMount, destPath, signal }) {
      await null;
      if (typeof destPath !== 'string' || destPath.length === 0) {
        throw new Error('GitCloner clone requires a destPath string');
      }
      const credentialVersion = endpoint.captureCredentialVersion();
      const abortController = new AbortController();
      const unwatchCredential = endpoint.watchChange(() => {
        abortController.abort();
      });
      const abortFromInput = () => {
        abortController.abort();
      };
      if (signal !== undefined) {
        if (signal.aborted) {
          abortController.abort();
        } else {
          signal.addEventListener('abort', abortFromInput, { once: true });
        }
      }
      // Constructive: there is no repo yet; the clone creates the
      // worktree at destPath from the endpoint authority.
      const credential = endpoint.ensureCredentialUsable();
      try {
        await clone({
          url: endpoint.url,
          destPath,
          allowLocalFileTransport: endpoint.allowLocalFileTransport,
          ...(credential === undefined ? {} : { credential }),
          signal: abortController.signal,
        });
      } catch (err) {
        endpoint.assertCredentialUnchanged('clone', credentialVersion);
        throw err;
      } finally {
        unwatchCredential?.();
        signal?.removeEventListener('abort', abortFromInput);
      }
      endpoint.assertCredentialUnchanged('clone', credentialVersion);
      // The destination is now a worktree; derive its `Git`.
      const git = await makeGit({ destMount, destPath });
      endpoint.assertCredentialUnchanged('clone', credentialVersion);
      // Compose: endpoint x Git -> origin-pre-bound `GitRemote`.
      const remote = await makeRemote({ git, endpoint });
      endpoint.assertCredentialUnchanged('clone', credentialVersion);
      return harden({ git, remote });
    },
  });
  return cloner;
};
harden(makeGitCloner);
