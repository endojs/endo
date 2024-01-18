/**
 * @param {any} value
 * @param {object} [options]
 * @param {number} [options.length] A guess at the length. If provided, must be
 * greater than zero.
 * @returns {Uint8Array}
 */
export function encodeSyrup(value: any, options?: {
    length?: number | undefined;
} | undefined): Uint8Array;
export type Buffer = {
    bytes: Uint8Array;
    data: DataView;
    length: number;
};
//# sourceMappingURL=encode.d.ts.map