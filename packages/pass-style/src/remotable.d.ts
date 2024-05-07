export function assertIface(iface: string): boolean;
/**
 * Simple semantics, just tell what interface spec a Remotable has,
 * or undefined if not deemed to be a Remotable.
 *
 * @type {{
 * <T extends string>(val: PassStyled<any, T>): T;
 * (val: any): InterfaceSpec | undefined;
 * }}
 */
export const getInterfaceOf: {
    <T extends string>(val: PassStyled<any, T>): T;
    (val: any): string | undefined;
};
/**
 *
 * @type {PassStyleHelper}
 */
export const RemotableHelper: PassStyleHelper;
import type { PassStyled } from './types.js';
import type { PassStyleHelper } from './internal-types.js';
//# sourceMappingURL=remotable.d.ts.map