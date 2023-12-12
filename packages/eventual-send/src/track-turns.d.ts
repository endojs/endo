export function trackTurns<T extends TurnStarterFn[]>(funcs: T): T;
/**
 * An optional function that is not this-sensitive, expected to be called at
 * bottom of stack to start a new turn.
 */
export type TurnStarterFn = ((...args: any[]) => any) | undefined;
//# sourceMappingURL=track-turns.d.ts.map