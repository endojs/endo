export function make(_powers: unknown, context: import('./types.js').FarContext): Promise<{
    makeWeblet: (webletBundle: unknown, webletPowers: unknown, requestedPort: number, webletId: string, webletCancelled: Promise<never>) => {
        getLocation(): Promise<string>;
        stopped: () => Promise<void[]>;
    } & import("@endo/eventual-send").RemotableBrand<{}, {
        getLocation(): Promise<string>;
        stopped: () => Promise<void[]>;
    }>;
} & import("@endo/eventual-send").RemotableBrand<{}, {
    makeWeblet: (webletBundle: unknown, webletPowers: unknown, requestedPort: number, webletId: string, webletCancelled: Promise<never>) => {
        getLocation(): Promise<string>;
        stopped: () => Promise<void[]>;
    } & import("@endo/eventual-send").RemotableBrand<{}, {
        getLocation(): Promise<string>;
        stopped: () => Promise<void[]>;
    }>;
}>>;
//# sourceMappingURL=web-server-node.d.ts.map