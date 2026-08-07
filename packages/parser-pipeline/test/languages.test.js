/**
 * Unit tests for the internal LANGUAGES registry.
 *
 * These tests catch the class of mistake where someone adds a new language to
 * the `PipelineLanguage` union but forgets to register it — or registers it
 * with missing required fields.
 */
import test from '@endo/ses-ava/prepare-endo.js';
import { LANGUAGES } from '../src/languages.js';

/** @import { PipelineLanguage } from '../src/types/pipeline.js' */

/** @type {PipelineLanguage[]} */
const KNOWN_LANGUAGES = ['mjs', 'cjs', 'mts'];

test('every PipelineLanguage has a LANGUAGES entry', t => {
  for (const lang of KNOWN_LANGUAGES) {
    t.truthy(LANGUAGES[lang], `LANGUAGES['${lang}'] is defined`);
  }
});

test('every LANGUAGES entry has a sourceType string', t => {
  for (const [lang, def] of Object.entries(LANGUAGES)) {
    t.is(
      typeof def.sourceType,
      'string',
      `LANGUAGES['${lang}'].sourceType is a string`,
    );
    t.true(
      def.sourceType === 'module' || def.sourceType === 'commonjs',
      `LANGUAGES['${lang}'].sourceType is a valid Babel sourceType`,
    );
  }
});

test('every LANGUAGES entry has a createAnalysisContext function', t => {
  for (const [lang, def] of Object.entries(LANGUAGES)) {
    t.is(
      typeof def.createAnalysisContext,
      'function',
      `LANGUAGES['${lang}'].createAnalysisContext is a function`,
    );
  }
});

test('every LANGUAGES entry has a heuristicImports boolean', t => {
  for (const [lang, def] of Object.entries(LANGUAGES)) {
    t.is(
      typeof def.heuristicImports,
      'boolean',
      `LANGUAGES['${lang}'].heuristicImports is a boolean`,
    );
  }
});

test('only cjs has heuristicImports = true', t => {
  for (const [lang, def] of Object.entries(LANGUAGES)) {
    if (lang === 'cjs') {
      t.true(def.heuristicImports, 'cjs.heuristicImports is true');
    } else {
      t.false(def.heuristicImports, `${lang}.heuristicImports is false`);
    }
  }
});

test('mts has a preProcessSource function', t => {
  t.is(
    typeof LANGUAGES.mts.preProcessSource,
    'function',
    'mts.preProcessSource is a function',
  );
});

test('mjs and cjs have no preProcessSource', t => {
  t.is(
    LANGUAGES.mjs.preProcessSource,
    undefined,
    'mjs.preProcessSource is undefined',
  );
  t.is(
    LANGUAGES.cjs.preProcessSource,
    undefined,
    'cjs.preProcessSource is undefined',
  );
});

test('cjs has a defaultFinalizeRecord function', t => {
  t.is(
    typeof LANGUAGES.cjs.defaultFinalizeRecord,
    'function',
    'cjs.defaultFinalizeRecord is a function',
  );
});

test('mjs and mts have no defaultFinalizeRecord', t => {
  t.is(
    LANGUAGES.mjs.defaultFinalizeRecord,
    undefined,
    'mjs.defaultFinalizeRecord is undefined',
  );
  t.is(
    LANGUAGES.mts.defaultFinalizeRecord,
    undefined,
    'mts.defaultFinalizeRecord is undefined',
  );
});

test('createAnalysisContext() returns an object with analyzePass and transformPass', t => {
  for (const [lang, def] of Object.entries(LANGUAGES)) {
    const ctx = def.createAnalysisContext();
    t.truthy(ctx.analyzePass?.visitor, `${lang} analyzePass.visitor exists`);
    t.truthy(
      ctx.transformPass?.visitor,
      `${lang} transformPass.visitor exists`,
    );
    t.is(
      typeof ctx.buildRecord,
      'function',
      `${lang} buildRecord is a function`,
    );
  }
});
