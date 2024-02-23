export function makeContextMaker({ controllerForFormulaIdentifier, provideControllerForFormulaIdentifier, }: {
    controllerForFormulaIdentifier: any;
    provideControllerForFormulaIdentifier: any;
}): (formulaIdentifier: string) => {
    cancel: (reason: any, prefix?: string) => Promise<void>;
    cancelled: Promise<never>;
    disposed: Promise<void>;
    thatDiesIfThisDies: (dependentFormulaIdentifier: any) => void;
    thisDiesIfThatDies: (dependencyIdentifier: any) => void;
    onCancel: (hook: () => void) => void;
};
//# sourceMappingURL=context.d.ts.map