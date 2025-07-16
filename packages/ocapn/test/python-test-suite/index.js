// @ts-check

import '@endo/init';

import { E } from '@endo/eventual-send';
import { getSelectorName } from '../../src/pass-style-helpers.js';
import { makeTcpNetLayer } from '../../src/netlayers/tcp-test-only.js';
import { makeClient } from '../../src/client/index.js';
import { OcapnFar } from '../../src/client/ocapn.js';

/**
 * @returns {Map<string, any>}
 */
const makeTestObjectTable = () => {
  const testObjectTable = new Map();

  /**
   * Car Factory builder
   * 
   * This takes no arguments and returns a "Car Factory" object. It should be located
   * at the swiss num: "JadQ0++RzsD4M+40uLxTWVaVqM10DcBJ"
   * 
   * 
   * Car Factory
   * 
   * This takes a single argument which is a List, with the following entries:
   * 1. a symbol representing the color of the car
   * 2. a symbol representing the car model
   
   * It should spawn a "car" object of the model and color specified in the
   * List.
   * 
   * 
   * Car
   * 
   * This should take no arguments and respond with
   * "Vroom! I'm a <color> <model> car!"
   * Where <color> and <model> are the color and model of the car respectively.
   * 
   */
  testObjectTable.set(
    'JadQ0++RzsD4M+40uLxTWVaVqM10DcBJ',
    OcapnFar('carFactoryBuilder', () => {
      /**
       * @param {[model: any, color: any]} carSpec
       */
      return OcapnFar('carFactory', carSpec => {
        console.log('carFactory called with', { carSpec });

        const [colorSelector, modelSelector] = carSpec;
        const color = getSelectorName(colorSelector);
        const model = getSelectorName(modelSelector);
        const car = () => `Vroom! I am a ${color} ${model} car!`;

        return OcapnFar('car', car);
      });
    }),
  );

  /**
   * Echo GC
   *
   * This takes any number of arguments and returns them in the same order it got
   * them. Importantly this will be used to test the GC so it should not retain
   * references and should (if possible) try to arrange so that the run the GC after
   * each call.
   */
  testObjectTable.set(
    'IO58l1laTyhcrgDKbEzFOO32MDd6zE5w',
    OcapnFar('echoGc', async function echoGc(...args) {
      return args;
    }),
  );

  /**
   * Greeter
   *
   * This takes a single argument which is a reference to another object. Upon
   * receipt of a message it should send the greeting "Hello" (string) to the object
   * referenced by the argument.
   *
   * This greeting should be sent as a `op:deliver` (**not** `op:deliver-only`) and
   * the resulting promise should be discarded (no references retained). The
   * implementation should (if possible) try to arrange so that the GC is run
   * upon resolution of the promise.
   */
  testObjectTable.set(
    'VMDDd1voKWarCe2GvgLbxbVFysNzRPzx',
    OcapnFar('greeter', remoteObject => {
      console.log('greeter called with', { remoteObject });
      return E(remoteObject)('Hello');
    }),
  );

  /**
   * Promise resolver
   *
   * This takes no arguments and returns a promise and a resolver. When the resolver
   * is sent a message, the first argument should either be the symbol `break` or the
   * symbol `fulfill`, the other arguments should be the error or value to resolve the
   * promise with.
   */
  testObjectTable.set(
    'IokCxYmMj04nos2JN1TDoY1bT8dXh6Lr',
    OcapnFar('promiseResolver', () => {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });

      const resolver = OcapnFar('Resolver', {
        fulfill: value => {
          console.log('resolver.fulfill called with', { value });
          resolve(value);
        },
        break: reason => {
          console.log('resolver.break called with', { reason });
          reject(reason);
        },
      });

      return [promise, resolver];
    }),
  );

  /**
   * Sturdyref enlivener
   *
   * This takes a single argument which OCapN sturdyref object. The actor should
   * "enliven" (connect to the node and get a live reference to the object)
   * the sturdyref and then return that to
   *  the messager.
   */
  testObjectTable.set(
    'gi02I1qghIwPiKGKleCQAOhpy3ZtYRpB',
    OcapnFar('sturdyrefEnlivener', async sturdyrefPromise => {
      console.log('sturdyrefEnlivener called with', { sturdyrefPromise });
      // SturdyRefs are promises as they are instructions on where to fetch an object,
      // but don't contain enough info to do grant matching.
      const sturdyref = await sturdyrefPromise;
      // Note, if we make SturdyRefs lazily connect, we may need to invoke
      // something here to force the connection.
      return sturdyref;
    }),
  );

  return testObjectTable;
};

const start = async () => {
  const client = makeClient({
    swissnumTable: makeTestObjectTable(),
  });
  const tcpNetlayer = await makeTcpNetLayer({ client, specifiedPort: 22046 });
  client.registerNetlayer(tcpNetlayer);
};

start();
