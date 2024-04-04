export function makeMessageCapTP<TBootstrap>(name: string, writer: import('@endo/stream').Stream<unknown, any, unknown, unknown>, reader: import('@endo/stream').Stream<any, undefined, undefined, undefined>, cancelled: Promise<void>, bootstrap: TBootstrap): {
    getBootstrap: () => Promise<any>;
    closed: Promise<void>;
};
export function messageToBytes(message: any): Uint8Array;
export function bytesToMessage(bytes: Uint8Array): any;
export function makeNetstringCapTP<TBootstrap>(name: string, bytesWriter: import('@endo/stream').Writer<Uint8Array>, bytesReader: import('@endo/stream').Reader<Uint8Array>, cancelled: Promise<void>, bootstrap: TBootstrap): {
    getBootstrap: () => Promise<any>;
    closed: Promise<void>;
};
//# sourceMappingURL=connection.d.ts.map