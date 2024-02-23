export function makeHostMaker({ provideValueForFormulaIdentifier, provideControllerForFormulaIdentifier, incarnateWorker, incarnateHost, incarnateGuest, incarnateEval, incarnateUnconfined, incarnateBundle, incarnateWebBundle, incarnateHandle, storeReaderRef, makeMailbox, }: {
    provideValueForFormulaIdentifier: any;
    provideControllerForFormulaIdentifier: any;
    incarnateWorker: any;
    incarnateHost: any;
    incarnateGuest: any;
    incarnateEval: any;
    incarnateUnconfined: any;
    incarnateBundle: any;
    incarnateWebBundle: any;
    incarnateHandle: any;
    storeReaderRef: any;
    makeMailbox: any;
}): (hostFormulaIdentifier: string, endoFormulaIdentifier: string, storeFormulaIdentifier: string, inspectorFormulaIdentifier: string, mainWorkerFormulaIdentifier: string, leastAuthorityFormulaIdentifier: string, context: import('./types.js').Context) => Promise<{
    external: import("./types.js").EndoHost;
    internal: {
        receive: any;
        respond: any;
        petStore: import("./types.js").PetStore;
    };
}>;
//# sourceMappingURL=host.d.ts.map