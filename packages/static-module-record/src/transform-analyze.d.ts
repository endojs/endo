export function makeModuleAnalyzer(babel: any): (moduleSource: string, { sourceUrl, sourceMapUrl, sourceMap, sourceMapHook }?: import('./static-module-record.js').Options) => Readonly<{
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