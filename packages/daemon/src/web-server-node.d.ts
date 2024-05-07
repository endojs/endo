export function make(_powers: unknown, context: FarContext): Promise<{
    makeWeblet: (webletBundle: unknown, webletPowers: unknown, requestedPort: number, webletId: string, webletCancelled: Promise<never>) => {
        getLocation(): Promise<string>;
        stopped: () => Promise<void[]>;
    } & import("@endo/pass-style").RemotableObject<`Alleged: ${string}`> & import("@endo/eventual-send").RemotableBrand<{}, {
        getLocation(): Promise<string>;
        stopped: () => Promise<void[]>;
    }>;
} & import("@endo/pass-style").RemotableObject<`Alleged: ${string}`> & import("@endo/eventual-send").RemotableBrand<{}, {
    makeWeblet: (webletBundle: unknown, webletPowers: unknown, requestedPort: number, webletId: string, webletCancelled: Promise<never>) => {
        getLocation(): Promise<string>;
        stopped: () => Promise<void[]>;
    } & import("@endo/pass-style").RemotableObject<`Alleged: ${string}`> & import("@endo/eventual-send").RemotableBrand<{}, {
        getLocation(): Promise<string>;
        stopped: () => Promise<void[]>;
    }>;
}>>;
import type { FarContext } from './types.js';
//# sourceMappingURL=web-server-node.d.ts.map