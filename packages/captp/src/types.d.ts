export type CapTPSlot = string;
export type TrapImpl = {
    /**
     * function
     * application
     */
    applyFunction: (target: any, args: Array<any>) => any;
    /**
     * method invocation, which is an atomic lookup of method
     * and apply
     */
    applyMethod: (target: any, method: string | symbol | number, args: Array<any>) => any;
    /**
     * property
     * lookup
     */
    get: (target: any, prop: string | symbol | number) => any;
};
/**
 * The head of the pair
 * is the `isRejected` value indicating whether the sync call was an exception,
 * and tail of the pair is the serialized fulfillment value or rejection reason.
 * (The fulfillment value is a non-thenable.  The rejection reason is normally
 * an error.)
 */
export type TrapCompletion = [boolean, import('@endo/marshal').CapData<CapTPSlot>];
/**
 * the argument to TrapGuest
 */
export type TrapRequest = {
    /**
     * the TrapImpl method that was called
     */
    trapMethod: keyof TrapImpl;
    /**
     * the target slot
     */
    slot: CapTPSlot;
    /**
     * arguments to the TrapImpl method
     */
    trapArgs: Array<any>;
    /**
     * start the
     * trap process on the trapHost, and drive the other side.
     */
    startTrap: () => Required<Iterator<void, void, any>>;
};
/**
 * Use out-of-band communications to synchronously return a
 * TrapCompletion value indicating the final results of a Trap call.
 */
export type TrapGuest = (req: TrapRequest) => TrapCompletion;
/**
 * start the process of transferring the Trap request's
 * results
 */
export type TrapHost = (completion: TrapCompletion) => AsyncIterator<void, void, any> | undefined;
//# sourceMappingURL=types.d.ts.map