/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
export function makeFileReader(fileName: string, { fs, path }: {
    fs: {
        promises: Pick<typeof import("fs/promises"), 'readFile' | 'stat'>;
    };
    path: Pick<import("path").PlatformPath, 'resolve' | 'relative' | 'normalize'>;
}): {
    toString: () => string;
    readText: () => Promise<string>;
    maybeReadText: () => Promise<string | undefined>;
    neighbor: (ref: any) => any;
    stat: () => Promise<import("fs").Stats>;
    absolute: () => string;
    relative: (there: any) => string;
    exists: () => Promise<boolean>;
};
/**
 * @param {string} fileName
 * @param {{
 *   fs: Pick<import('fs'), 'existsSync'> &
 *     { promises: Pick<
 *         import('fs/promises'),
 *         'readFile' | 'stat' | 'writeFile' | 'mkdir' | 'rename' | 'rm'
 *       >,
 *     },
 *   path: Pick<import('path'), 'dirname' | 'resolve' | 'relative' | 'normalize'>,
 * }} io
 * @param {(there: string) => ReturnType<makeFileWriter>} make
 */
export const makeFileWriter: any;
/**
 * @param {string} fileName
 * @param {{
 *   fs: Pick<import('fs'), 'existsSync'> &
 *     { promises: Pick<
 *         import('fs/promises'),
 *         'readFile' | 'stat' | 'writeFile' | 'mkdir' | 'rm'
 *       >,
 *     },
 *   path: Pick<import('path'), 'resolve' | 'relative' | 'normalize'>,
 * }} io
 * @param {number} [pid]
 * @param {number} [nonce]
 * @param {(there: string) => ReturnType<makeAtomicFileWriter>} make
 */
export const makeAtomicFileWriter: any;
//# sourceMappingURL=fs.d.ts.map