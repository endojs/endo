export function makeGuestMaker({ provideValueForFormulaIdentifier, provideControllerForFormulaIdentifierAndResolveHandle, makeMailbox, }: {
    provideValueForFormulaIdentifier: any;
    provideControllerForFormulaIdentifierAndResolveHandle: any;
    makeMailbox: any;
}): (guestFormulaIdentifier: string, hostHandleFormulaIdentifier: string, petStoreFormulaIdentifier: string, mainWorkerFormulaIdentifier: string, context: import('./types.js').Context) => Promise<{
    external: import("./types.js").EndoGuest;
    internal: {
        receive: any;
        respond: any;
        petStore: import("./types.js").PetStore;
    };
}>;
//# sourceMappingURL=guest.d.ts.map