export function makeMailboxMaker({ getFormulaIdentifierForRef, provideValueForFormulaIdentifier, provideControllerForFormulaIdentifierAndResolveHandle, cancelValue, }: {
    provideValueForFormulaIdentifier: import('./types.js').ProvideValueForFormulaIdentifier;
    getFormulaIdentifierForRef: import('./types.js').GetFormulaIdentifierForRef;
    provideControllerForFormulaIdentifierAndResolveHandle: import('./types.js').ProvideControllerForFormulaIdentifierAndResolveHandle;
    cancelValue: import('./types.js').CancelValue;
}): ({ selfFormulaIdentifier, petStore, specialNames, context, }: {
    selfFormulaIdentifier: string;
    petStore: import('./types.js').PetStore;
    specialNames: Record<string, string>;
    context: import('./types.js').Context;
}) => import('./types.js').Mail;
//# sourceMappingURL=mail.d.ts.map