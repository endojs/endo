export function make(powers: any, context: any): Promise<{
    addresses: () => string[];
    supports: (address: any) => boolean;
    connect: (address: any, connectionContext: any) => Promise<any>;
} & import("@endo/eventual-send").RemotableBrand<{}, {
    addresses: () => string[];
    supports: (address: any) => boolean;
    connect: (address: any, connectionContext: any) => Promise<any>;
}>>;
//# sourceMappingURL=tcp-netstring.d.ts.map