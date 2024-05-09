import 'ses';
import { StaticModuleRecord as ModuleSource } from '@endo/static-module-record';
assert.equal(
  new ModuleSource(`
    import "a";
    import "a";
    import * as b from "b";
    export * from "c";
    export {} from "d";
  `).imports.join(','),
  ['a,b,c,d'].join(','),
);
