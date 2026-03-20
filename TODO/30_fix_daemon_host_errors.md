Fix any critical type errors in `packages/daemon/src/host.js`; in particular:
- line 109 `Property 'getFormulaGraphSnapshot' does not exist on type '{ provide: Provide; provideController: (id: FormulaIdentifier) => Controller<unknown>; cancelValue: (id: FormulaIdentifier, reason: Error) => Promise<...>; ... 22 more ...; unpinTransient?: ((id: FormulaIdentifier) => void) | undefined; }'. typescript (2339) [109, 3]`
- line 724 `Conversion of type 'void' to type '{ syncedStoreNumber: FormulaNumber; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first. typescript (2352) [724, 20]`
- line 842 `Property 'listLocators' does not exist on type 'EndoDirectory'. typescript (2339) [842, 7]`
- line 850 `Property 'writeLocator' does not exist on type 'EndoDirectory'. typescript (2339) [850, 7]`
- line 1148 `Object literal may only specify known properties, and 'listLocators' does not exist in type 'EndoHost'. typescript (2353) [1148, 7]`
