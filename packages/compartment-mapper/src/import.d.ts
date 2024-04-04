/** @type {Record<string, ParserImplementation>} */
export const parserForLanguage: Record<string, ParserImplementation>;
export function loadLocation(readPowers: ReadFn | ReadPowers, moduleLocation: string, options?: ArchiveOptions | undefined): Promise<Application>;
export function importLocation(readPowers: ReadFn | ReadPowers, moduleLocation: string, options?: (ExecuteOptions & ArchiveOptions) | undefined): Promise<import('./types.js').SomeObject>;
import type { ParserImplementation } from './types.js';
import type { ReadFn } from './types.js';
import type { ReadPowers } from './types.js';
import type { ArchiveOptions } from './types.js';
import type { Application } from './types.js';
import type { ExecuteOptions } from './types.js';
//# sourceMappingURL=import.d.ts.map