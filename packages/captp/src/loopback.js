import { Far } from '@endo/marshal';
import { E, makeCapTP } from './captp.js';
import { nearTrapImpl } from './trap.js';
import { makeFinalizingMap } from './finalize.js';

export { E };

/**
 * @template T
 * @typedef {import('@endo/eventual-send').ERef<T>} ERef
 */

/**
 * Create an async-isolated channel to an object.
 *
 * @param {string} ourId
 * @param {import('./captp.js').CapTPOptions} [nearOptions]
 * @param {import('./captp.js').CapTPOptions} [farOptions]
 * @returns {{
 *   makeFar<T>(x: T): ERef<T>,
 *   makeNear<T>(x: T): ERef<T>,
 *   makeTrapHandler<T>(x: T): T,
 *   isOnlyNear(x: any): boolean,
 *   isOnlyFar(x: any): boolean,
 *   getNearStats(): any,
 *   getFarStats(): any,
 *   Trap: Trap
 * }}
 */
export const makeLoopback = (ourId, nearOptions, farOptions) => {
  let nextNonce = 0;
  const nonceToRef = makeFinalizingMap(nonce =>
    console.log('nonce', nonce, 'dropped'),
  );

  const bootstrap = harden({
    refGetter: Far('refGetter', {
      getRef(nonce) {
        // Find the local ref for the specified nonce.
        const xFar = nonceToRef.get(nonce);
        // nonceToRef.delete(nonce);
        return xFar;
      },
    }),
  });

  const slotBody = JSON.stringify({
    '@qclass': 'slot',
    index: 0,
  });

  // Create the tunnel.
  const {
    Trap,
    dispatch: nearDispatch,
    getBootstrap: getFarBootstrap,
    getStats: getNearStats,
    isOnlyLocal: isOnlyNear,
    // eslint-disable-next-line no-use-before-define
  } = makeCapTP(`near-${ourId}`, o => farDispatch(o), bootstrap, {
    trapGuest: ({ trapMethod, slot, trapArgs }) => {
      let value;
      let isException = false;
      try {
        // Cross the boundary to pull out the far object.
        // eslint-disable-next-line no-use-before-define
        const far = farUnserialize({ body: slotBody, slots: [slot] });
        value = nearTrapImpl[trapMethod](far, trapArgs[0], trapArgs[1]);
      } catch (e) {
        isException = true;
        value = e;
      }
      harden(value);
      // eslint-disable-next-line no-use-before-define
      return [isException, farSerialize(value)];
    },
    ...nearOptions,
  });
  assert(Trap);

  const {
    makeTrapHandler,
    dispatch: farDispatch,
    getBootstrap: getNearBootstrap,
    getStats: getFarStats,
    isOnlyLocal: isOnlyFar,
    unserialize: farUnserialize,
    serialize: farSerialize,
  } = makeCapTP(`far-${ourId}`, nearDispatch, bootstrap, farOptions);

  const farGetter = E.get(getFarBootstrap()).refGetter;
  const nearGetter = E.get(getNearBootstrap()).refGetter;

  /**
   * @param {ERef<{ getRef(nonce: number): any }>} refGetter
   */
  const makeRefMaker = refGetter =>
    /**
     * @param {any} x
     */
    async x => {
      const myNonce = nextNonce;
      nextNonce += 1;
      nonceToRef.set(myNonce, harden(x));
      return E(refGetter).getRef(myNonce);
    };

  return {
    makeFar: makeRefMaker(farGetter),
    makeNear: makeRefMaker(nearGetter),
    isOnlyNear,
    isOnlyFar,
    getNearStats,
    getFarStats,
    makeTrapHandler,
    Trap,
  };
};
