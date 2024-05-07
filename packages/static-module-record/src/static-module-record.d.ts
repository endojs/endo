/**
 * @typedef {object} SourceMapHookDetails
 * @property {string} compartment
 * @property {string} module
 * @property {string} location
 * @property {string} sha512
 */
/**
 * @callback SourceMapHook
 * @param {string} sourceMap
 * @param {SourceMapHookDetails} details
 */
/**
 * @typedef {object} Options
 * @property {string} [sourceUrl]
 * @property {string} [sourceMap]
 * @property {string} [sourceMapUrl]
 * @property {SourceMapHook} [sourceMapHook]
 */
/**
 * StaticModuleRecord captures the effort of parsing and analyzing module text
 * so a cache of StaticModuleRecords may be shared by multiple Compartments.
 *
 * @class
 * @param {string} source
 * @param {string | Options} [opts]
 */
export function StaticModuleRecord(source: string, opts?: string | Options | undefined): void;
export class StaticModuleRecord {
    /**
     * @typedef {object} SourceMapHookDetails
     * @property {string} compartment
     * @property {string} module
     * @property {string} location
     * @property {string} sha512
     */
    /**
     * @callback SourceMapHook
     * @param {string} sourceMap
     * @param {SourceMapHookDetails} details
     */
    /**
     * @typedef {object} Options
     * @property {string} [sourceUrl]
     * @property {string} [sourceMap]
     * @property {string} [sourceMapUrl]
     * @property {SourceMapHook} [sourceMapHook]
     */
    /**
     * StaticModuleRecord captures the effort of parsing and analyzing module text
     * so a cache of StaticModuleRecords may be shared by multiple Compartments.
     *
     * @class
     * @param {string} source
     * @param {string | Options} [opts]
     */
    constructor(source: string, opts?: string | Options | undefined);
    imports: string[];
    exports: any[];
    reexports: never[];
    __syncModuleProgram__: string;
    __liveExportMap__: any;
    __reexportMap__: any;
    __fixedExportMap__: any;
    __needsImportMeta__: boolean;
}
export type SourceMapHookDetails = {
    compartment: string;
    module: string;
    location: string;
    sha512: string;
};
export type SourceMapHook = (sourceMap: string, details: SourceMapHookDetails) => any;
export type Options = {
    sourceUrl?: string | undefined;
    sourceMap?: string | undefined;
    sourceMapUrl?: string | undefined;
    sourceMapHook?: SourceMapHook | undefined;
};
//# sourceMappingURL=static-module-record.d.ts.map