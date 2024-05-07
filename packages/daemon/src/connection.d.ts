export function makeMessageCapTP<TBootstrap>(name: string, writer: Stream<unknown, any, unknown, unknown>, reader: Stream<any, undefined, undefined, undefined>, cancelled: Promise<void>, bootstrap: TBootstrap): {
    getBootstrap: () => Promise<any>;
    closed: Promise<void>;
};
export function messageToBytes(message: any): Uint8Array;
export function bytesToMessage(bytes: Uint8Array): any;
export function makeNetstringCapTP<TBootstrap>(name: string, bytesWriter: Writer<Uint8Array>, bytesReader: Reader<Uint8Array>, cancelled: Promise<void>, bootstrap: TBootstrap): {
    getBootstrap: () => Promise<any>;
    closed: Promise<void>;
};
import type { Stream } from '@endo/stream';
import type { Writer } from '@endo/stream';
import type { Reader } from '@endo/stream';
//# sourceMappingURL=connection.d.ts.map