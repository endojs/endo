/**
 * @param {string} cjsSource
 * @param {string} [name]
 */
export function analyzeCommonJS(cjsSource: string, name?: string | undefined): {
    exports: any[];
    reexports: any[];
    requires: any;
};
export type RequireType = 0 | 1 | 2;
//# sourceMappingURL=index.d.ts.map