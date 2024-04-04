/**
 * Default implementation of Trap for near objects.
 *
 * @type {import('./types.js').TrapImpl}
 */
export const nearTrapImpl: import('./types.js').TrapImpl;
export function makeTrap(trapImpl: import('./types.js').TrapImpl): {
    (x: any): any;
    get: (x: any) => any;
};
//# sourceMappingURL=trap.d.ts.map