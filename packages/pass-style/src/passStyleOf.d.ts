export const PassStyleOfEndowmentSymbol: unique symbol;
/**
 * If there is already a PassStyleOfEndowmentSymbol property on the global,
 * then presumably it was endowed for us by liveslots with a `passStyleOf`
 * function, so we should use and export that one instead.
 * Other software may have left it for us here,
 * but it would require write access to our global, or the ability to
 * provide endowments to our global, both of which seems adequate as a test of
 * whether it is authorized to serve the same role as liveslots.
 *
 * NOTE HAZARD: This use by liveslots does rely on `passStyleOf` being
 * deterministic. If it is not, then in a liveslot-like virtualized
 * environment, it can be used to detect GC.
 *
 * @type {PassStyleOf}
 */
export const passStyleOf: PassStyleOf;
export function assertPassable(val: any): void;
export type PassStyleHelper = import('./internal-types.js').PassStyleHelper;
export type Passable = import('./types.js').Passable;
export type PassStyle = import('./types.js').PassStyle;
export type PassStyleOf = import('./types.js').PassStyleOf;
export type PrimitiveStyle = import('./types.js').PrimitiveStyle;
export type HelperPassStyle = Exclude<PassStyle, PrimitiveStyle | "promise">;
//# sourceMappingURL=passStyleOf.d.ts.map