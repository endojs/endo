export function getModulePaths(readPowers: ReadPowers | ReadFn | undefined, location: string): {
    filename: string | null;
    dirname: string | null;
};
export function wrap({ moduleEnvironmentRecord, compartment, resolvedImports, location, readPowers, }: {
    moduleEnvironmentRecord: object;
    compartment: Compartment;
    resolvedImports: Record<string, string>;
    location: string;
    readPowers: ReadFn | ReadPowers | undefined;
}): {
    module: {
        exports: any;
    };
    moduleExports: any;
    afterExecute: Function;
    require: Function;
};
export type ReadFn = import('./types.js').ReadFn;
export type ReadPowers = import('./types.js').ReadPowers;
//# sourceMappingURL=parse-cjs-shared-export-wrapper.d.ts.map