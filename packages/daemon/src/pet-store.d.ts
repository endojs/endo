export function makePetStoreMaker(filePowers: import('./types.js').FilePowers, locator: import('./types.js').Locator): {
    makeIdentifiedPetStore: (id: string, assertValidName: (name: string) => void) => Promise<import("@endo/far").FarRef<import("./types.js").PetStore, import("@endo/eventual-send").DataOnly<import("./types.js").PetStore>>>;
};
//# sourceMappingURL=pet-store.d.ts.map