// @ts-check

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeError, X } from '@endo/errors';

const BridgeInterface = M.interface('FsBridge9p', {
  start: M.call().returns(M.promise()),
  stop: M.call().returns(M.promise()),
});

/**
 * Bridge an Endo filesystem capability to a 9P2000.L UDS endpoint
 * suitable for `mount -t 9p -o trans=fd,...` inside a microVM
 * (see DESIGN.md §5.7).
 *
 * Skeleton: the public surface is final. The 9P state machine,
 * msize negotiation, and FS-capability adapter are TODO and gated
 * on milestone 1 of DESIGN.md §10 plus the reference 9P server
 * sketched in DESIGN.md Appendix B.
 *
 * Performance note: this bridge marshals each 9P operation into one
 * or more eventual-sends against the FS capability. That's fine when
 * the FS is local; for remote filesystems it is chatty. The roadmap
 * item R1 in ENDO-INTEGRATION.md §9 covers a remote-friendly FS
 * surface that replaces this bridge.
 *
 * @param {{
 *   fs: import('@endo/eventual-send').ERef<object>,
 *   socketPath: string,
 * }} opts
 */
export const makeFsBridge9p = ({ fs, socketPath }) => {
  void fs;

  let started = false;
  let stopped = false;

  return makeExo('FsBridge9p', BridgeInterface, {
    async start() {
      if (started) return;
      started = true;
      throw makeError(
        X`fs-bridge-9p.start not implemented (socket=${socketPath}). See DESIGN.md §5.7 / Appendix B and ENDO-INTEGRATION.md §6.2.`,
      );
    },

    async stop() {
      if (stopped || !started) return;
      stopped = true;
    },
  });
};
harden(makeFsBridge9p);
