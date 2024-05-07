export function makePetStoreMaker(filePowers: FilePowers, config: Config): {
    makeIdentifiedPetStore: (id: string, formulaType: "known-peers-store" | "pet-store", assertValidName: import("./types.js").AssertValidNameFn) => Promise<PetStore>;
};
import type { FilePowers } from './types.js';
import type { Config } from './types.js';
import type { PetStore } from './types.js';
//# sourceMappingURL=pet-store.d.ts.map