/* eslint-disable no-restricted-globals */
import {
  PrecompiledStaticModuleInterface,
  __LiveExportMap__,
  __FixedExportMap__,
} from 'ses';

export class StaticModuleRecord implements PrecompiledStaticModuleInterface {
  constructor(source: string, location?: string);

  imports: Array<string>;

  exports: Array<string>;

  reexports: Array<string>;

  __syncModuleProgram__: string;

  __liveExportMap__: __LiveExportMap__;

  __fixedExportMap__: __FixedExportMap__;
}
