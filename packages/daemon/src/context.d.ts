export function makeContextMaker({ controllerForId, provideController }: {
    controllerForId: any;
    provideController: any;
}): (id: string) => {
    id: string;
    cancel: (reason: Error, prefix?: string | undefined) => Promise<void>;
    cancelled: Promise<never>;
    disposed: Promise<void>;
    thatDiesIfThisDies: (dependentId: string) => void;
    thisDiesIfThatDies: (dependencyId: string) => void;
    onCancel: (hook: () => void) => void;
};
//# sourceMappingURL=context.d.ts.map