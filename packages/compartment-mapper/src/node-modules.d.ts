export function compartmentMapForNodeModules(readPowers: any, packageLocation: string, tags: Set<string>, packageDescriptor: object, moduleSpecifier: string, options?: {
    dev?: boolean | undefined;
    commonDependencies?: object;
    policy?: object;
} | undefined): Promise<CompartmentMapDescriptor>;
/**
 * The graph is an intermediate object model that the functions of this module
 * build by exploring the `node_modules` tree dropped by tools like npm and
 * consumed by tools like Node.js.
 * This gets translated finally into a compartment map.
 */
export type Graph = Record<string, Node>;
export type Node = {
    label: string;
    name: string;
    path: Array<string>;
    logicalPath: Array<string>;
    explicitExports: boolean;
    internalAliases: Record<string, string>;
    externalAliases: Record<string, string>;
    /**
     * - from module name to
     * location in storage.
     */
    dependencyLocations: Record<string, string>;
    /**
     * - the parser for
     * modules based on their extension.
     */
    parsers: Record<string, Language>;
    /**
     * - the parser for specific
     * modules.
     */
    types: Record<string, Language>;
};
export type CommonDependencyDescriptors = Record<string, {
    spec: string;
    alias: string;
}>;
export type ReadDescriptorFn = (packageLocation: string) => Promise<object>;
import type { CompartmentMapDescriptor } from './types.js';
import type { Language } from './types.js';
//# sourceMappingURL=node-modules.d.ts.map