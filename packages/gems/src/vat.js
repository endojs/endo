import { makePromiseKit } from '@endo/promise-kit';

export const makeVat = ({ connectToVat }) => {
  let connectionPromiseKit;
  // TODO: should be a WeakValueMap
  // this one has the lifecycle of the vat connection
  const connectionPresenceForRemoteSlot = new Map();

  const onDisconnect = () => {
    connectionPromiseKit = undefined;
    connectionPresenceForRemoteSlot.clear();
  };

  const getConnection = () => {
    if (connectionPromiseKit === undefined) {
      connectionPromiseKit = makePromiseKit();
      connectionPromiseKit.resolve(connectToVat({ onDisconnect }));
    }
    return connectionPromiseKit.promise;
  };

  return { getConnection, connectionPresenceForRemoteSlot };
};
