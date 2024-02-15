export { E };
export function makeLoopback(ourId: string, nearOptions?: import("./captp.js").CapTPOptions | undefined, farOptions?: import("./captp.js").CapTPOptions | undefined): {
    makeFar<T>(x: T): ERef<T>;
    makeNear<T_1>(x: T_1): ERef<T_1>;
    makeTrapHandler<T_2>(x: T_2): T_2;
    isOnlyNear(x: any): boolean;
    isOnlyFar(x: any): boolean;
    getNearStats(): any;
    getFarStats(): any;
    Trap: import("./ts-types.js").Trap | undefined;
};
export type ERef<T> = import('@endo/eventual-send').ERef<T>;
import { E } from './captp.js';
//# sourceMappingURL=loopback.d.ts.map