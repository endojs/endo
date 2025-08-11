import { makeCustomDurableKindWithContext } from "./custom-kind";

export const defineDurableWeakRef = (fakeVomKit, zone) => {
  return makeCustomDurableKindWithContext(fakeVomKit, zone, {
    make: (context, value) => {
      const slot = fakeVomKit.fakeStuff.getSlotForVal(value);
      context.ref = slot;
      return new WeakRef(value);
    },
    reanimate: context => {
      const value = fakeVomKit.fakeStuff.getValForSlot(context.ref);
      return new WeakRef(value);
    },
    cleanup: context => {
      return false;
    },
  });
}