export { E };
export function makeCapTP(ourId: string, rawSend: (obj: Record<string, any>) => void, bootstrapObj?: any, opts?: CapTPOptions): {
    abort: (reason?: undefined) => void;
    dispatch: (obj: any) => boolean;
    getBootstrap: () => Promise<any>;
    getStats: () => {
        send: {
            [x: string]: number;
        };
        recv: {
            [x: string]: number;
        };
        gc: {
            DROPPED: number;
        };
    };
    isOnlyLocal: (specimen: any) => boolean;
    serialize: import("@endo/marshal/src/marshal.js").ToCapData<string>;
    unserialize: import("@endo/marshal/src/marshal.js").FromCapData<string>;
    makeTrapHandler: (name: any, obj: any) => any;
    Trap: import('./types.js').Trap | undefined;
};
export type Settler<R = unknown> = import('@endo/eventual-send').Settler<R>;
export type HandledExecutor<R = unknown> = import('@endo/eventual-send').HandledExecutor<R>;
export type RemoteKit<R = unknown> = import('@endo/eventual-send').RemoteKit<R>;
/**
 * the options to makeCapTP
 */
export type CapTPOptions = {
    exportHook?: ((val: unknown, slot: import('./types.js').CapTPSlot) => void) | undefined;
    importHook?: ((val: unknown, slot: import('./types.js').CapTPSlot) => void) | undefined;
    onReject?: ((err: any) => void) | undefined;
    /**
     * an integer tag to attach to all messages in order to
     * assist in ignoring earlier defunct instance's messages
     */
    epoch?: number | undefined;
    /**
     * if specified, enable this CapTP (guest) to
     * use Trap(target) to block while the recipient (host) resolves and
     * communicates the response to the message
     */
    trapGuest?: import("./types.js").TrapGuest | undefined;
    /**
     * if specified, enable this CapTP (host) to serve
     * objects marked with makeTrapHandler to synchronous clients (guests)
     */
    trapHost?: import("./types.js").TrapHost | undefined;
    /**
     * if true, aggressively garbage collect imports
     */
    gcImports?: boolean | undefined;
};
import { E } from '@endo/eventual-send';
//# sourceMappingURL=captp.d.ts.map