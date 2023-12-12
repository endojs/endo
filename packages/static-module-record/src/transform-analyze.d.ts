export function makeModuleAnalyzer(babel: any): (moduleSource: any, { sourceUrl, sourceMapUrl, sourceMap, sourceMapHook }?: {
    sourceUrl: any;
    sourceMapUrl: any;
    sourceMap: any;
    sourceMapHook: any;
}) => Readonly<{
    exportAlls: readonly never[];
    imports: any;
    liveExportMap: any;
    fixedExportMap: any;
    reexportMap: any;
    needsImportMeta: boolean;
    functorSource: string;
}>;
export function makeModuleTransformer(babel: any, importer: any): {
    rewrite(ss: any): any;
};
//# sourceMappingURL=transform-analyze.d.ts.map