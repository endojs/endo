export function compartmentMapForNodeModules(readPowers: ReadFn | ReadPowers | MaybeReadPowers, packageLocation: string, tags: Set<string>, packageDescriptor: object, moduleSpecifier: string, options?: {
    dev?: boolean | undefined;
    commonDependencies?: object;
    policy?: object;
} | undefined): Promise<CompartmentMapDescriptor>;
export type Language = import('./types.js').Language;
export type ReadFn = import('./types.js').ReadFn;
export type MaybeReadFn = import('./types.js').MaybeReadFn;
export type CanonicalFn = import('./types.js').CanonicalFn;
export type CompartmentMapDescriptor = import('./types.js').CompartmentMapDescriptor;
export type ModuleDescriptor = import('./types.js').ModuleDescriptor;
export type ScopeDescriptor = import('./types.js').ScopeDescriptor;
export type CompartmentDescriptor = import('./types.js').CompartmentDescriptor;
export type ReadPowers = import('./types.js').ReadPowers;
export type MaybeReadPowers = import('./types.js').MaybeReadPowers;
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
//# sourceMappingURL=node-modules.d.ts.map