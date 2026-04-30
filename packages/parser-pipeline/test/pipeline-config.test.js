import test from '@endo/ses-ava/prepare-endo.js';
import { definePipelineConfig } from '../src/pipeline-config.js';

/**
 * @import {VisitorPassFactory, RecordFinalizer} from '../src/types/pipeline.js'
 */

test('returns configs with empty visitorFactories by default', t => {
  const configs = definePipelineConfig();
  t.deepEqual(configs.mjs.visitorFactories, []);
  t.deepEqual(configs.cjs.visitorFactories, []);
  t.truthy('cjs' in configs);
  // CJS always has the built-in finalizeRecord (buildCjsExecuteRecord wrapper).
  t.is(typeof configs.cjs.finalizeRecord, 'function');
});

test('merges shared visitorFactories into both languages when cjs is supplied', t => {
  /** @type {VisitorPassFactory} */
  const sharedFactory = (_loc, _spec) => ({
    visitor: {},
    done: () => 42,
  });
  /** @type {RecordFinalizer<'cjs'>} */
  const finalize = record => /** @type {any} */ (record);
  const configs = definePipelineConfig({
    visitorFactories: [sharedFactory],
    cjs: { finalizeRecord: finalize },
  });
  t.is(configs.mjs.visitorFactories.length, 1);
  t.is(configs.cjs.visitorFactories.length, 1);
  t.is(configs.mjs.visitorFactories[0], sharedFactory);
  t.is(configs.cjs.visitorFactories[0], sharedFactory);
  t.is(configs.cjs.finalizeRecord, finalize);
});

test('per-language visitorFactories are concatenated with shared', t => {
  /** @type {VisitorPassFactory} */
  const shared = (_loc, _spec) => ({ visitor: {}, done: () => 'shared' });
  /** @type {VisitorPassFactory} */
  const mjsOnly = (_loc, _spec) => ({ visitor: {}, done: () => 'mjs' });
  /** @type {RecordFinalizer<'cjs'>} */
  const finalize = record => /** @type {any} */ (record);
  const configs = definePipelineConfig({
    visitorFactories: [shared],
    mjs: { visitorFactories: [mjsOnly] },
    cjs: { finalizeRecord: finalize },
  });
  t.is(configs.mjs.visitorFactories.length, 2);
  t.is(configs.cjs.visitorFactories.length, 1);
});

test('cjs finalizeRecord is passed through', t => {
  /** @type {RecordFinalizer<'cjs'>} */
  const finalize = record => /** @type {any} */ (record);
  const configs = definePipelineConfig({ cjs: { finalizeRecord: finalize } });
  t.is(configs.cjs.finalizeRecord, finalize);
  t.is(configs.mjs.finalizeRecord, undefined);
});

test('shared babelParserOptions appears in both mjs and cjs', t => {
  const opts = { plugins: /** @type {any} */ (['decorators']) };
  const configs = definePipelineConfig({ babelParserOptions: opts });
  t.is(configs.mjs.babelParserOptions, opts);
  t.is(configs.cjs.babelParserOptions, opts);
});

test('per-language babelParserOptions wins over shared', t => {
  const shared = { plugins: /** @type {any} */ (['decorators']) };
  const mjsOpts = { plugins: /** @type {any} */ (['typescript']) };
  const configs = definePipelineConfig({
    babelParserOptions: shared,
    mjs: { babelParserOptions: mjsOpts },
  });
  t.is(configs.mjs.babelParserOptions, mjsOpts);
  t.is(configs.cjs.babelParserOptions, shared);
});

test('shared babelGeneratorOptions appears in both mjs and cjs', t => {
  const opts = { compact: true };
  const configs = definePipelineConfig({ babelGeneratorOptions: opts });
  t.is(configs.mjs.babelGeneratorOptions, opts);
  t.is(configs.cjs.babelGeneratorOptions, opts);
});

test('per-language babelGeneratorOptions wins over shared', t => {
  const shared = { compact: true };
  const cjsOpts = { compact: false };
  const configs = definePipelineConfig({
    babelGeneratorOptions: shared,
    cjs: { babelGeneratorOptions: cjsOpts },
  });
  t.is(configs.mjs.babelGeneratorOptions, shared);
  t.is(configs.cjs.babelGeneratorOptions, cjsOpts);
});

test('shared log appears in both mjs and cjs', t => {
  const log = () => {};
  const configs = definePipelineConfig({ log });
  t.is(configs.mjs.log, log);
  t.is(configs.cjs.log, log);
});

test('per-language log wins over shared', t => {
  const sharedLog = () => {};
  const mjsLog = () => {};
  const configs = definePipelineConfig({
    log: sharedLog,
    mjs: { log: mjsLog },
  });
  t.is(configs.mjs.log, mjsLog);
  t.is(configs.cjs.log, sharedLog);
});

test('shared onModuleStart appears in both mjs and cjs', t => {
  const onModuleStart = () => {};
  const configs = definePipelineConfig({ onModuleStart });
  t.is(configs.mjs.onModuleStart, onModuleStart);
  t.is(configs.cjs.onModuleStart, onModuleStart);
});

test('per-language onModuleStart wins over shared', t => {
  const shared = () => {};
  const mjsStart = () => {};
  const configs = definePipelineConfig({
    onModuleStart: shared,
    mjs: { onModuleStart: mjsStart },
  });
  t.is(configs.mjs.onModuleStart, mjsStart);
  t.is(configs.cjs.onModuleStart, shared);
});
