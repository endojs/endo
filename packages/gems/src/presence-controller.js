import { Remotable } from '@endo/captp';
import { makeEventualFactoryLookupDelegate } from './delegated-presence.js';

/**
 * @typedef {object} PresenceController
 * @property {function(string, string): any} makePresenceForSlot - Creates a presence for a given slot and interface.
 * @property {function(string): boolean} cleanupPresenceForSlot - Cleans up the presence for a given slot.
 * @property {function(): void} didDisconnect - Indicates when the connection is lost.
 */

/**
 * @param {function(): any} getCaptp
 * @returns {PresenceController}
 */
export const makeSimplePresenceController = getCaptp => {
  // This is a cache of the presence for a slot, per captp session.
  // It is cleared when the connection is lost.
  // Individual items can be cleared via "cleanupPresenceForSlot".
  const presenceForSlot = new Map();

  // Provide a way to indicate when the connection is lost.
  const didDisconnect = () => {
    presenceForSlot.clear();
  };

  const makePresenceForSlot = (slot, iface) => {
    if (presenceForSlot.has(slot)) {
      return presenceForSlot.get(slot);
    }
    const captp = getCaptp();
    const { settler } = captp.makeRemoteKit(slot);
    const value = Remotable(iface, undefined, settler.resolveWithPresence());
    presenceForSlot.set(slot, value);
    captp.importSlot(value, slot);
    return value;
  };

  const cleanupPresenceForSlot = slot => {
    presenceForSlot.delete(slot);
    // TODO: unsure if further GC needed
    return false;
  };

  return { makePresenceForSlot, cleanupPresenceForSlot, didDisconnect };
};

/**
 * @param {object} opts
 * @param {() => Promise<any>} opts.getConnection
 * @returns {PresenceController}
 */
export const makeReconnectingPresenceController = ({ getConnection }) => {
  // This is a cache of the presence for a slot, per captp session.
  // It is cleared when the connection is lost.
  // Individual items can be cleared via "cleanupPresenceForSlot".
  const presenceForSlot = new Map();

  // Provide a way to indicate when the connection is lost.
  // The cache MUST be cleared when the connection is lost,
  // or the remotes will be broken.
  const didDisconnect = () => {
    console.log('+ presenceController didDisconnect');
    presenceForSlot.clear();
  };

  const connectToRemoteSlot = async (slot, iface, delegatePresence) => {
    console.log('+ presenceController connectToRemoteSlot', slot, iface);
    // This is called for every message sent to the slot,
    // so the cache is important.
    // The value is good for the lifetime of the captp session.
    // The value is not needed beyond the lifetime of the DelegatePresence,
    // which is informed via the clearPresenceForSlot callback.
    if (presenceForSlot.has(slot)) {
      return presenceForSlot.get(slot);
    }
    const vatConnection = await getConnection();
    // Create a new presence for the slot thats unregistered with CapTP.
    const { captp } = vatConnection;
    const { settler } = captp.makeRemoteKit(slot);
    const value = Remotable(iface, undefined, settler.resolveWithPresence());
    presenceForSlot.set(slot, value);
    captp.importSlot(delegatePresence, slot);
    return value;
  };

  const makePresenceForSlot = (slot, iface) => {
    console.log('+ presenceController makePresenceForSlot', slot, iface);
    const { presence: delegatePresence } = makeEventualFactoryLookupDelegate(
      () => connectToRemoteSlot(slot, iface, delegatePresence),
    );
    const remotablePresence = Remotable(iface, undefined, delegatePresence);
    console.log(
      '+> presenceController makePresenceForSlot',
      slot,
      iface,
      remotablePresence,
    );
    return remotablePresence;
  };

  const cleanupPresenceForSlot = slot => {
    presenceForSlot.delete(slot);
    // TODO: unsure if further GC needed
    return false;
  };

  return { makePresenceForSlot, cleanupPresenceForSlot, didDisconnect };
};
