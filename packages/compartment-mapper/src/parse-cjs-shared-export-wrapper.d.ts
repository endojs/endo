export function getModulePaths(readPowers: ReadFn | ReadPowers | undefined, location: string): {
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
import type { ReadFn } from './types.js';
import type { ReadPowers } from './types.js';
//# sourceMappingURL=parse-cjs-shared-export-wrapper.d.ts.map