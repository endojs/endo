/** @type {Record<string, ParserImplementation>} */
export const parserForLanguage: Record<string, ParserImplementation>;
export function loadLocation(readPowers: ReadFn | ReadPowers, moduleLocation: string, options?: import("./types.js").ArchiveOptions | undefined): Promise<Application>;
export function importLocation(readPowers: ReadFn | ReadPowers, moduleLocation: string, options?: (import("./types.js").ExecuteOptions & import("./types.js").ArchiveOptions) | undefined): Promise<object>;
export type Application = import('./types.js').Application;
export type ArchiveOptions = import('./types.js').ArchiveOptions;
export type ExecuteFn = import('./types.js').ExecuteFn;
export type ExecuteOptions = import('./types.js').ExecuteOptions;
export type ParserImplementation = import('./types.js').ParserImplementation;
export type ReadFn = import('./types.js').ReadFn;
export type ReadPowers = import('./types.js').ReadPowers;
//# sourceMappingURL=import.d.ts.map