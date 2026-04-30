import type { AnalysisContext } from './analyzer.js';
import type { CjsModuleSourceRecord } from './cjs-module-source.js';

/**
 * Context for CJS module analysis.
 */
export type CjsAnalysisContext = AnalysisContext<CjsModuleSourceRecord>;
