export type Encoding = import('./types.js').Encoding;
export type CapData<T> = import('./types.js').CapData<T>;
export type Indenter = {
    open: (openBracket: string) => number;
    line: () => number;
    next: (token: string) => number;
    close: (closeBracket: string) => number;
    done: () => string;
};
/**
 * @param {Encoding} encoding
 * @param {boolean=} shouldIndent
 * @param {any[]} [slots]
 * @returns {string}
 */
export function decodeToJustin(encoding: Encoding, shouldIndent?: boolean | undefined, slots?: any[] | undefined): string;
//# sourceMappingURL=marshal-justin.d.ts.map