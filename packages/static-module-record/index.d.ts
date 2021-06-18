import type { PrecompiledStaticModuleInterface } from 'ses';

export class StaticModuleRecord implements PrecompiledStaticModuleInterface {
  constructor(source: string, location?: string);
  imports: Array<string>;
  exports: Array<string>;
  reexports: Array<string>;
  __syncModuleProgram__: string;
  __liveExportsMap__: __LiveExportsMap__;
  __fixedExportsMap__: __FixedExportsMap__;
}
