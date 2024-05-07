export function inferExportsEntries({ main, module, exports }: {
    main: string;
    module?: string | undefined;
    exports?: object;
}, tags: Set<string>, types: Record<string, Language>): Generator<string[], void, any>;
export function inferExports(descriptor: object, tags: Set<string>, types: Record<string, Language>): Record<string, string>;
export function inferExportsAndAliases(descriptor: any, externalAliases: any, internalAliases: any, tags: any, types: any): void;
import type { Language } from './types.js';
//# sourceMappingURL=infer-exports.d.ts.map