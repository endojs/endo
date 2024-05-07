export function makeGuestMaker({ provide, makeMailbox, makeDirectoryNode }: {
    provide: Provide;
    makeMailbox: MakeMailbox;
    makeDirectoryNode: MakeDirectoryNode;
}): (guestId: string, handleId: string, hostAgentId: string, hostHandleId: string, petStoreId: string, mainWorkerId: string, context: Context) => Promise<import("@endo/exo").Guarded<{
    /** @param {string} locator */
    followLocatorNameChanges: (locator: string) => import("@endo/eventual-send").FarRef<import("@endo/stream").Reader<import("./types.js").LocatorNameChange>>;
    followMessages: () => import("@endo/eventual-send").FarRef<import("@endo/stream").Reader<import("./types.js").StampedMessage>>;
    followNameChanges: () => import("@endo/eventual-send").FarRef<import("@endo/stream").Reader<import("./types.js").PetStoreNameChange>>;
    handle: () => {};
    listMessages: () => Promise<import("./types.js").StampedMessage[]>;
    resolve: (messageNumber: number, resolutionName: string) => Promise<void>;
    reject: (messageNumber: number, message?: string | undefined) => Promise<void>;
    adopt: (messageNumber: number, edgeName: string, petName: string) => Promise<void>;
    dismiss: (messageNumber: number) => Promise<void>;
    request: (recipientName: string, what: string, responseName: string) => Promise<unknown>;
    send: (recipientName: string, strings: string[], edgeNames: string[], petNames: string[]) => Promise<void>;
    deliver: (message: import("./types.js").EnvelopedMessage) => void;
    reverseIdentify(id: string): string[];
    makeDirectory(petName: string): Promise<import("./types.js").EndoDirectory>;
    has(...petNamePath: string[]): Promise<boolean>;
    identify(...petNamePath: string[]): Promise<string | undefined>;
    locate(...petNamePath: string[]): Promise<string | undefined>;
    reverseLocate(locator: string): Promise<string[]>;
    list(...petNamePath: string[]): Promise<string[]>;
    listIdentifiers(...petNamePath: string[]): Promise<string[]>;
    lookup(...petNamePath: string[]): Promise<unknown>;
    reverseLookup(value: unknown): string[];
    write(petNamePath: string[], id: string): Promise<void>;
    remove(...petNamePath: string[]): Promise<void>;
    move(fromPetName: string[], toPetName: string[]): Promise<void>;
    copy(fromPetName: string[], toPetName: string[]): Promise<void>;
}>>;
import type { Provide } from './types.js';
import type { MakeMailbox } from './types.js';
import type { MakeDirectoryNode } from './types.js';
import type { Context } from './types.js';
//# sourceMappingURL=guest.d.ts.map