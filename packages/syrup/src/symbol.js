// To be used as keys, syrup symbols must be javascript symbols.
// To avoid an otherwise meaningful symbol name, we prefix it with 'syrup:'.
export const SyrupSymbolFor = (name) => Symbol.for(`syrup:${name}`);
