/**
 * @template {'nestedEvaluate' | 'getExport'} T
 * @param {string} startFilename
 * @param {T} moduleFormat
 * @param {any} powers
 */
export function bundleNestedEvaluateAndGetExports<T extends "nestedEvaluate" | "getExport">(startFilename: string, moduleFormat: T, powers: any): Promise<{
    moduleFormat: T;
    source: string;
    sourceMap: string;
}>;
//# sourceMappingURL=nested-evaluate-and-get-exports.d.ts.map