export function searchDescriptor<T>(location: string, readDescriptor: (location: string) => Promise<T>): Promise<{
    data: T;
    directory: string;
    location: string;
    packageDescriptorLocation: string;
}>;
export function search(read: ReadFn, moduleLocation: string): Promise<{
    packageLocation: string;
    packageDescriptorLocation: string;
    packageDescriptorText: string;
    moduleSpecifier: string;
}>;
export type ReadFn = import('./types.js').ReadFn;
//# sourceMappingURL=search.d.ts.map