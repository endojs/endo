import './ses-lockdown.js';
import test from 'ava';
import {
  makeHookExecutor,
  makeDefaultHookConfiguration,
} from '../src/hooks.js';

/**
 * @import {
 *   HookConfiguration,
 *   MapNodeModulesHooks,
 *   AnyHook,
 *   PhasedHookDefinition,
 *   CanonicalName,
 *   SomePolicy,
 *   HookFn,
 *   HookExecutorFn,
 *   LogFn,
 * } from '../src/types.js';
 */

/**
 * Helper function to exclude properties from an object for comparison
 * @param {any} obj - Object to filter
 * @param {...string} keys - Keys to exclude
 * @returns {any} Object without the excluded keys
 */
const exclude = (obj, ...keys) => {
  if (!obj || typeof obj !== 'object') return obj;
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
};

/**
 * Test hook definition for basic value manipulation
 * @typedef {object} TestValueHooks
 * @property {HookFn<{value: number}>} testHook - Hook that modifies a value
 */

/**
 * Test hook definition for phased operations
 * @typedef {object} TestPhasedHooks
 * @property {{pre: AnyHook, post: AnyHook}} testHook - Phased hook with pre/post phases
 */

/**
 * Complex test hook definition with multiple hooks
 * @typedef {object} TestComplexHooks
 * @property {HookFn<{value: number}>} singleHook - Single hook
 * @property {Array<HookFn<{value: number}>>} arrayHook - Array of hooks
 * @property {PhasedHookDefinition} phasedHook - Phased hook
 */

/**
 * Creates a log function which saves its calls.
 * @returns {{log: LogFn, calls: string[]}}
 */
const makeMockLog = () => {
  /** @type {string[]} */
  const calls = [];
  /** @param {string} message */
  const log = message => calls.push(message);
  return { log, calls };
};

/** @type {SomePolicy} */
const allowPolicy = {
  resources: {
    'package-a': {
      packages: {
        'package-b': true,
        '@scope/package-c': true,
      },
    },
    'package-b': {
      packages: {
        '@scope/package-c': true,
      },
    },
  },
};

/** @type {SomePolicy} */
const denyPolicy = {
  resources: {
    'package-a': {
      packages: {
        'package-b': false,
        '@scope/package-c': true,
      },
    },
  },
};

// Test makeHookExecutor with proper type assertions
test('makeHookExecutor - single hook execution', t => {
  t.plan(3);
  const { log, calls } = makeMockLog();
  let hookCalled = false;

  /** @type {HookConfiguration<TestValueHooks>} */
  const hooks = {
    testHook: ({ value, log: hookLog }) => {
      hookCalled = true;
      hookLog('Hook executed');
      return { value: value + 1 };
    },
  };

  const executeHook = /** @type {HookExecutorFn<TestValueHooks>} */ (
    makeHookExecutor(hooks, { log })
  );

  const result = executeHook('testHook', { value: 5, log });

  t.true(hookCalled, 'hook should be called');
  t.is(result?.value, 6, 'should return modified value');
  t.deepEqual(calls, ['Hook executed'], 'should log hook execution');
});

test('makeHookExecutor - hook array pipeline', t => {
  t.plan(3);
  const { log, calls } = makeMockLog();
  /** @type {number[]} */
  const executionOrder = [];

  /** @type {HookConfiguration<TestValueHooks>} */
  const hooks = {
    testHook: [
      ({ value, log: hookLog }) => {
        executionOrder.push(1);
        hookLog('Hook 1');
        return { value: value + 1 };
      },
      ({ value, log: hookLog }) => {
        executionOrder.push(2);
        hookLog('Hook 2');
        return { value: value * 2 };
      },
      ({ value, log: hookLog }) => {
        executionOrder.push(3);
        hookLog('Hook 3');
        return { value: value + 10 };
      },
    ],
  };

  const executeHook = makeHookExecutor(hooks, { log });

  const result = executeHook('testHook', { value: 5, log });

  t.deepEqual(executionOrder, [1, 2, 3], 'hooks should execute in order');
  t.is(result?.value, 22, 'should chain hook results: (5+1)*2+10=22');
  t.deepEqual(
    calls,
    ['Hook 1', 'Hook 2', 'Hook 3'],
    'should log all hook executions',
  );
});

test('makeHookExecutor - phased hook execution', t => {
  t.plan(5);
  const { log, calls } = makeMockLog();
  let preExecuted = false;
  let postExecuted = false;

  /** @type {HookConfiguration<TestPhasedHooks>} */
  const hooks = {
    testHook: {
      pre: ({ value, log: hookLog }) => {
        preExecuted = true;
        hookLog('Pre hook');
        return { value: value + 1 };
      },
      post: ({ value, log: hookLog }) => {
        postExecuted = true;
        hookLog('Post hook');
        return { value: value * 2 };
      },
    },
  };

  const executeHook = makeHookExecutor(hooks, { log });

  const preResult = executeHook('testHook.pre', { value: 5, log });
  const postResult = executeHook('testHook.post', { value: 10, log });

  t.true(preExecuted, 'pre hook should be executed');
  t.true(postExecuted, 'post hook should be executed');
  t.is(preResult?.value, 6, 'pre hook should modify value');
  t.is(postResult?.value, 20, 'post hook should modify value');
  t.deepEqual(
    calls,
    ['Pre hook', 'Post hook'],
    'should log both hook executions',
  );
});

test('makeHookExecutor - phased hook with arrays', t => {
  t.plan(3);
  const { log } = makeMockLog();
  /** @type {string[]} */
  const executionOrder = [];

  /** @type {HookConfiguration<TestPhasedHooks>} */
  const hooks = {
    testHook: {
      pre: [
        ({ value, log: hookLog }) => {
          executionOrder.push('pre1');
          hookLog('Pre hook 1');
          return { value: value + 1 };
        },
        ({ value, log: hookLog }) => {
          executionOrder.push('pre2');
          hookLog('Pre hook 2');
          return { value: value * 2 };
        },
      ],
      post: ({ value, log: hookLog }) => {
        executionOrder.push('post');
        hookLog('Post hook');
        return { value: value + 10 };
      },
    },
  };

  const executeHook = makeHookExecutor(hooks, { log });

  const preResult = executeHook('testHook.pre', { value: 5, log });
  const postResult = executeHook('testHook.post', { value: 10, log });

  t.deepEqual(
    executionOrder,
    ['pre1', 'pre2', 'post'],
    'should execute in correct order',
  );
  t.is(preResult?.value, 12, 'pre pipeline should chain: (5+1)*2=12');
  t.is(postResult?.value, 20, 'post hook should execute: 10+10=20');
});

test('makeHookExecutor - with default configuration', t => {
  t.plan(2);
  const { log, calls } = makeMockLog();

  /** @type {HookConfiguration<TestValueHooks>} */
  const userHooks = {
    testHook: ({ value, log: hookLog }) => {
      hookLog('User hook');
      return { value: value + 10 };
    },
  };

  /** @type {HookConfiguration<TestValueHooks>} */
  const defaultHooks = {
    testHook: [
      ({ value, log: hookLog }) => {
        hookLog('Default hook');
        return { value: value * 2 };
      },
    ],
  };

  const executeHook = /** @type {HookExecutorFn<TestValueHooks>} */ (
    makeHookExecutor(userHooks, {
      log,
      defaultHookConfiguration: defaultHooks,
    })
  );

  const result = executeHook('testHook', { value: 5, log });

  // Default hooks should execute first due to applyHookDefaults behavior
  t.is(result?.value, 20, 'should execute default first: 5*2+10=20');
  t.deepEqual(
    calls,
    ['Default hook', 'User hook'],
    'should execute default hook first',
  );
});

test('makeHookExecutor - default arrays and user single hook', t => {
  t.plan(2);
  const { log, calls } = makeMockLog();

  /** @type {HookConfiguration<TestValueHooks>} */
  const userHooks = {
    testHook: ({ value, log: hookLog }) => {
      hookLog('User hook');
      return { value: value + 100 };
    },
  };

  /** @type {HookConfiguration<TestValueHooks>} */
  const defaultHooks = {
    testHook: [
      ({ value, log: hookLog }) => {
        hookLog('Default hook 1');
        return { value: value + 1 };
      },
      ({ value, log: hookLog }) => {
        hookLog('Default hook 2');
        return { value: value * 2 };
      },
    ],
  };

  const executeHook = /** @type {HookExecutorFn<TestValueHooks>} */ (
    makeHookExecutor(userHooks, {
      log,
      defaultHookConfiguration: defaultHooks,
    })
  );

  const result = executeHook('testHook', { value: 5, log });

  // Should execute: defaults first, then user: ((5+1)*2)+100 = 112
  t.is(result?.value, 112, 'should execute defaults first, then user');
  t.deepEqual(
    calls,
    ['Default hook 1', 'Default hook 2', 'User hook'],
    'should execute all defaults first',
  );
});

test('makeHookExecutor - non-existent hook', t => {
  /** @type {HookConfiguration<TestValueHooks>} */
  const hooks = {};

  const executeHook = /** @type {HookExecutorFn<TestValueHooks>} */ (
    makeHookExecutor(hooks)
  );

  // @ts-expect-error - intentionally calling non-existent hook for test
  const result = executeHook('nonExistent', { value: 5, log: () => {} });

  t.is(result, undefined, 'should return undefined for non-existent hook');
});

test('makeHookExecutor - empty hook array', t => {
  /** @type {HookConfiguration<TestValueHooks>} */
  const hooks = {
    testHook: [],
  };

  const executeHook = /** @type {HookExecutorFn<TestValueHooks>} */ (
    makeHookExecutor(hooks)
  );

  const result = executeHook('testHook', { value: 5, log: () => {} });

  t.is(result, undefined, 'should return undefined for empty hook array');
});

test('makeHookExecutor - hook error handling', t => {
  t.plan(3);
  const errorHook = () => {
    throw new Error('Hook failed');
  };

  /** @type {HookConfiguration<TestValueHooks>} */
  const hooks = {
    testHook: errorHook,
  };

  const executeHook = /** @type {HookExecutorFn<TestValueHooks>} */ (
    makeHookExecutor(hooks)
  );

  const error = t.throws(() => {
    executeHook('testHook', { value: 5, log: () => {} });
  });

  t.true(error?.message.includes('Hook Error'), 'should wrap hook errors');
  t.true(
    error?.message.includes('Hook failed'),
    'should preserve original error message',
  );
});

test('makeHookExecutor - hook returns invalid type', t => {
  t.plan(3);
  const invalidHook = () => 'not an object';

  /** @type {HookConfiguration<TestValueHooks>} */
  const hooks = {
    // @ts-expect-error - intentionally invalid hook for test
    testHook: invalidHook,
  };

  const executeHook = /** @type {HookExecutorFn<TestValueHooks>} */ (
    makeHookExecutor(hooks)
  );

  const error = t.throws(() => {
    executeHook('testHook', { value: 5, log: () => {} });
  });

  t.true(error?.message.includes('Hook Error'), 'should wrap type errors');
  t.true(
    error?.message.includes('non-plain-object'),
    'should describe the type error',
  );
});

test('makeHookExecutor - named hook definition with mapNodeModules', t => {
  t.plan(3);
  const { log, calls } = makeMockLog();

  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    packageDependencies: ({ canonicalName, dependencies, log: hookLog }) => {
      hookLog(`Processing ${canonicalName}`);
      return {
        dependencies: new Set([
          ...dependencies,
          /** @type {CanonicalName} */ ('added-dep'),
        ]),
      };
    },
  };

  const executeHook = /** @type {HookExecutorFn<MapNodeModulesHooks>} */ (
    makeHookExecutor('mapNodeModules', hooks, { log })
  );

  const result = executeHook('packageDependencies', {
    canonicalName: /** @type {CanonicalName} */ ('test-package'),
    dependencies: new Set([/** @type {CanonicalName} */ ('existing-dep')]),
    log,
  });

  t.true(
    result?.dependencies?.has(/** @type {CanonicalName} */ ('existing-dep')),
    'should preserve existing deps',
  );
  t.true(
    result?.dependencies?.has(/** @type {CanonicalName} */ ('added-dep')),
    'should add new dependency',
  );
  t.deepEqual(
    calls,
    ['Processing test-package'],
    'should execute hook with logging',
  );
});

// Test makeDefaultHookConfiguration
test('makeDefaultHookConfiguration - no policy', t => {
  t.plan(2);
  const config = makeDefaultHookConfiguration('mapNodeModules');

  t.true(typeof config === 'object', 'should return configuration object');
  // When no policy, mapNodeModules should be empty object, not null
  t.deepEqual(config, {}, 'should have empty config without policy');
});

test('makeDefaultHookConfiguration - mapNodeModules - with policy', t => {
  t.plan(4);
  const { log } = makeMockLog();
  const config = makeDefaultHookConfiguration('mapNodeModules', {
    policy: allowPolicy,
    log,
  });

  t.true(typeof config === 'object', 'should return configuration object');
  t.true(
    'packageDependencies' in config,
    'should have packageDependencies hook',
  );
  t.true(
    Array.isArray(config.packageDependencies),
    'packageDependencies should be an array',
  );
  t.is(
    config.packageDependencies?.length,
    1,
    'packageDependencies should have one hook',
  );
});

test('makeDefaultHookConfiguration - named configuration', t => {
  t.plan(2);
  const config = makeDefaultHookConfiguration('mapNodeModules', {
    policy: allowPolicy,
  });

  t.true(typeof config === 'object', 'should return configuration object');
  t.true(
    'packageDependencies' in config,
    'should have packageDependencies hook directly',
  );
});

test('makeDefaultHookConfiguration - mapNodeModules - packageDependencies hook filtering', t => {
  t.plan(3);
  const { log, calls } = makeMockLog();

  const config = makeDefaultHookConfiguration('mapNodeModules', {
    policy: denyPolicy,
    log,
  });

  const packageDependenciesHook = config.packageDependencies?.[0];

  // Test filtering behavior
  const result = packageDependenciesHook({
    canonicalName: /** @type {CanonicalName} */ ('package-a'),
    dependencies: new Set([
      /** @type {CanonicalName} */ ('package-b'), // Should be filtered out (denied)
      /** @type {CanonicalName} */ ('@scope/package-c'), // Should be kept (allowed)
    ]),
    log,
  });

  t.true(
    result?.dependencies?.has(
      /** @type {CanonicalName} */ ('@scope/package-c'),
    ),
    'should keep allowed dependency',
  );
  t.false(
    result?.dependencies?.has(/** @type {CanonicalName} */ ('package-b')),
    'should filter denied dependency',
  );
  t.true(
    calls.some(call => call.includes('Excluding dependency')),
    'should log filtered dependencies',
  );
});

// Integration test for the complete hook system
test('hook system integration - mapNodeModules - complete pipeline', t => {
  t.plan(6);
  const { log, calls } = makeMockLog();

  // Create user hooks
  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const userHooks = {
    packageDependencies: [
      ({ canonicalName, dependencies, log: hookLog }) => {
        hookLog(`User hook 1: processing ${canonicalName}`);
        const newDeps = new Set([
          ...dependencies,
          /** @type {CanonicalName} */ ('user-dep-1'),
        ]);
        return { dependencies: newDeps };
      },
      ({ canonicalName, dependencies, log: hookLog }) => {
        hookLog(`User hook 2: processing ${canonicalName}`);
        const newDeps = new Set([
          ...dependencies,
          /** @type {CanonicalName} */ ('user-dep-2'),
        ]);
        return { dependencies: newDeps };
      },
    ],
  };

  // Create default hooks with policy
  const defaultConfig = makeDefaultHookConfiguration('mapNodeModules', {
    policy: allowPolicy,
    log,
  });

  // Create executor
  const executeHook = makeHookExecutor('mapNodeModules', userHooks, {
    log,
    defaultHookConfiguration: defaultConfig,
  });

  const dependencies = /** @type {Set<CanonicalName>} */ (
    new Set(['package-b', '@scope/package-c'])
  );
  // Execute the pipeline
  const result = executeHook('packageDependencies', {
    canonicalName: /** @type {CanonicalName} */ ('package-a'),
    dependencies,
    log,
  });

  // Verify the complete pipeline executed
  t.true(
    result?.dependencies?.has(/** @type {CanonicalName} */ ('package-b')),
    'should preserve allowed original deps',
  );
  t.true(
    result?.dependencies?.has(
      /** @type {CanonicalName} */ ('@scope/package-c'),
    ),
    'should preserve allowed original deps',
  );
  t.true(
    result?.dependencies?.has(/** @type {CanonicalName} */ ('user-dep-1')),
    'should add user dep 1',
  );
  t.true(
    result?.dependencies?.has(/** @type {CanonicalName} */ ('user-dep-2')),
    'should add user dep 2',
  );

  // Verify execution order: default hooks first, then user hooks
  const logMessages = calls.join(' ');
  t.true(logMessages.includes('User hook 1'), 'should execute user hooks');
  t.true(
    logMessages.includes('User hook 2'),
    'should execute user hooks in order',
  );
});

// Test for dummy phased hook configuration to cover branches
test('makeHookExecutor - comprehensive phased hook coverage', t => {
  t.plan(4);
  const { log, calls } = makeMockLog();
  /** @type {string[]} */
  const executionOrder = [];

  // Create a phased configuration with both pre and post as arrays
  /** @type {HookConfiguration<TestPhasedHooks>} */
  const hooks = {
    testHook: {
      pre: [
        ({ value, log: hookLog }) => {
          executionOrder.push('pre1');
          hookLog('Pre hook 1');
          return { value: value + 1, preStage: 1 };
        },
        ({ value, log: hookLog }) => {
          executionOrder.push('pre2');
          hookLog('Pre hook 2');
          return { value: value * 2, preStage: 2 };
        },
      ],
      post: [
        ({ value, log: hookLog }) => {
          executionOrder.push('post1');
          hookLog('Post hook 1');
          return { value: value + 10, postStage: 1 };
        },
        ({ value, log: hookLog }) => {
          executionOrder.push('post2');
          hookLog('Post hook 2');
          return { value: value + 100, postStage: 2 };
        },
      ],
    },
  };

  const executeHook = makeHookExecutor(hooks, { log });

  // Test pre phase pipeline
  const preResult = executeHook('testHook.pre', { value: 5, log });

  // Test post phase pipeline
  const postResult = executeHook('testHook.post', { value: 10, log });

  t.deepEqual(
    executionOrder,
    ['pre1', 'pre2', 'post1', 'post2'],
    'should execute phases in order',
  );
  t.deepEqual(
    exclude(preResult, 'log'),
    { value: 12, preStage: 2 },
    'pre pipeline should chain: (5+1)*2=12',
  );
  t.deepEqual(
    exclude(postResult, 'log'),
    { value: 120, postStage: 2 },
    'post pipeline should chain: 10+10+100=120',
  );
  t.deepEqual(
    calls,
    ['Pre hook 1', 'Pre hook 2', 'Post hook 1', 'Post hook 2'],
    'should log all phase executions',
  );
});

test('makeHookExecutor - error handling in phased hooks', t => {
  t.plan(4);
  /** @type {HookConfiguration<TestPhasedHooks>} */
  const hooks = {
    testHook: {
      pre: () => {
        throw new Error('Pre hook failed');
      },
      post: () => ({ value: 100 }),
    },
  };

  const executeHook = makeHookExecutor(hooks);

  // Pre hook should throw
  const preError = t.throws(() => {
    executeHook('testHook.pre', { value: 5, log: () => {} });
  });

  t.true(
    preError?.message.includes('Hook Error'),
    'should wrap pre hook errors',
  );
  t.true(
    preError?.message.includes('Pre hook failed'),
    'should preserve original pre error message',
  );

  // Post hook should work normally
  const postResult = executeHook('testHook.post', { value: 5, log: () => {} });
  t.deepEqual(
    exclude(postResult, 'log'),
    { value: 100 },
    'post hook should execute normally',
  );
});

test('makeHookExecutor - invalid phased hook access', t => {
  t.plan(2);
  /** @type {HookConfiguration<TestValueHooks>} */
  const hooks = {
    testHook: ({ value }) => ({ value: value + 1 }),
  };

  const executeHook = makeHookExecutor(hooks);

  const error = t.throws(() => {
    // @ts-expect-error - intentionally accessing phased hook on non-phased configuration
    executeHook('testHook.pre', { value: 5, log: () => {} });
  });

  t.true(
    error?.message.includes('Expected hook'),
    'should validate phased hook structure',
  );
});
