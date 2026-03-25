// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/far';
import {
  COMMANDS,
  getCommand,
  filterCommands,
  getCommandsByCategory,
} from '../../command-registry.js';
import { createCommandExecutor } from '../../command-executor.js';
import { inferLanguage } from '../../language-detect.js';

// ============ LANGUAGE INFERENCE TESTS ============

test('inferLanguage maps JavaScript extensions', t => {
  t.is(inferLanguage('index.js'), 'javascript');
  t.is(inferLanguage('module.mjs'), 'javascript');
  t.is(inferLanguage('common.cjs'), 'javascript');
  t.is(inferLanguage('component.jsx'), 'javascript');
});

test('inferLanguage maps TypeScript extensions', t => {
  t.is(inferLanguage('types.ts'), 'typescript');
  t.is(inferLanguage('component.tsx'), 'typescript');
});

test('inferLanguage maps markup extensions', t => {
  t.is(inferLanguage('README.md'), 'markdown');
  t.is(inferLanguage('docs.markdown'), 'markdown');
  t.is(inferLanguage('page.html'), 'html');
  t.is(inferLanguage('page.htm'), 'html');
  t.is(inferLanguage('config.xml'), 'xml');
});

test('inferLanguage maps style extensions', t => {
  t.is(inferLanguage('styles.css'), 'css');
  t.is(inferLanguage('styles.scss'), 'scss');
  t.is(inferLanguage('styles.less'), 'less');
});

test('inferLanguage maps data format extensions', t => {
  t.is(inferLanguage('config.json'), 'json');
  t.is(inferLanguage('config.yaml'), 'yaml');
  t.is(inferLanguage('config.yml'), 'yaml');
  t.is(inferLanguage('config.toml'), 'ini');
  t.is(inferLanguage('config.ini'), 'ini');
});

test('inferLanguage maps other language extensions', t => {
  t.is(inferLanguage('script.py'), 'python');
  t.is(inferLanguage('app.rb'), 'ruby');
  t.is(inferLanguage('main.go'), 'go');
  t.is(inferLanguage('main.rs'), 'rust');
  t.is(inferLanguage('Main.java'), 'java');
  t.is(inferLanguage('main.c'), 'cpp');
  t.is(inferLanguage('main.cpp'), 'cpp');
  t.is(inferLanguage('query.sql'), 'sql');
  t.is(inferLanguage('schema.graphql'), 'graphql');
  t.is(inferLanguage('deploy.sh'), 'shell');
});

test('inferLanguage handles special filenames', t => {
  t.is(inferLanguage('Dockerfile'), 'dockerfile');
  t.is(inferLanguage('Makefile'), 'shell');
});

test('inferLanguage returns plaintext for unknown extensions', t => {
  t.is(inferLanguage('file.xyz'), 'plaintext');
  t.is(inferLanguage('noext'), 'plaintext');
});

test('inferLanguage is case insensitive for extensions', t => {
  t.is(inferLanguage('file.JS'), 'javascript');
  t.is(inferLanguage('file.JSON'), 'json');
  t.is(inferLanguage('file.MD'), 'markdown');
});

test('inferLanguage handles paths with directories', t => {
  // inferLanguage works on filename only — but the caller passes
  // just the last segment. Test the extension extraction still works.
  t.is(inferLanguage('component.test.js'), 'javascript');
  t.is(inferLanguage('file.config.json'), 'json');
});

// ============ COMMAND REGISTRY TESTS ============

test('COMMANDS contains view and edit', t => {
  t.true('view' in COMMANDS);
  t.true('edit' in COMMANDS);
});

test('view command has correct properties', t => {
  const cmd = COMMANDS.view;
  t.is(cmd.name, 'view');
  t.is(cmd.label, 'View');
  t.is(cmd.category, 'storage');
  t.is(cmd.mode, 'inline');
  t.deepEqual(cmd.aliases, ['cat']);
  t.is(cmd.fields.length, 1);
  t.is(cmd.fields[0].name, 'petName');
  t.is(cmd.fields[0].type, 'petNamePath');
  t.true(cmd.fields[0].required);
});

test('edit command has correct properties', t => {
  const cmd = COMMANDS.edit;
  t.is(cmd.name, 'edit');
  t.is(cmd.label, 'Edit');
  t.is(cmd.category, 'storage');
  t.is(cmd.mode, 'inline');
  t.is(cmd.fields.length, 1);
  t.is(cmd.fields[0].name, 'petName');
  t.is(cmd.fields[0].type, 'petNamePath');
  t.true(cmd.fields[0].required);
});

test('getCommand resolves cat alias to view', t => {
  const cmd = getCommand('cat');
  t.truthy(cmd);
  t.is(cmd?.name, 'view');
});

test('filterCommands matches view and edit', t => {
  const viewResults = filterCommands('vi');
  const viewNames = viewResults.map(cmd => cmd.name);
  t.true(viewNames.includes('view'));

  const editResults = filterCommands('ed');
  const editNames = editResults.map(cmd => cmd.name);
  t.true(editNames.includes('edit'));
});

test('view and edit appear in storage category', t => {
  const storage = getCommandsByCategory('storage');
  const names = storage.map(cmd => cmd.name);
  t.true(names.includes('view'));
  t.true(names.includes('edit'));
});

test('view and edit are available in both inbox and channel', t => {
  const viewCmd = COMMANDS.view;
  const editCmd = COMMANDS.edit;
  t.true(
    viewCmd.context === undefined || viewCmd.context === 'both',
    'view should be available in both modes',
  );
  t.true(
    editCmd.context === undefined || editCmd.context === 'both',
    'edit should be available in both modes',
  );
});

// ============ COMMAND EXECUTOR TESTS ============

/**
 * Create a mock context with openBlobViewer tracking.
 */
const createMockContext = () => {
  /** @type {Array<{method: string, args: unknown[]}>} */
  const calls = [];
  /** @type {unknown[]} */
  const showValueCalls = [];
  /** @type {string[]} */
  const showMessageCalls = [];
  /** @type {Error[]} */
  const showErrorCalls = [];
  /** @type {Array<{petNamePath: string, readOnly: boolean}>} */
  const blobViewerCalls = [];

  const powers = Far('MockPowers', {
    lookup: async (...pathParts) => {
      calls.push({ method: 'lookup', args: pathParts });
      return Far('MockBlob', {
        text: async () => 'file content',
      });
    },
    identify: async (...pathParts) => {
      calls.push({ method: 'identify', args: pathParts });
      return 'id:test';
    },
  });

  const typedPowers = /** @type {ERef<EndoHost>} */ (
    /** @type {unknown} */ (powers)
  );

  return {
    powers: typedPowers,
    calls,
    showValueCalls,
    showMessageCalls,
    showErrorCalls,
    blobViewerCalls,
  };
};

test('execute view command calls openBlobViewer with readOnly=true', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    openBlobViewer: async (petNamePath, readOnly) => {
      ctx.blobViewerCalls.push({ petNamePath, readOnly });
    },
  });

  const result = await executor.execute('view', {
    petName: 'my-mount/src/index.js',
  });

  t.true(result.success);
  t.is(ctx.blobViewerCalls.length, 1);
  t.is(ctx.blobViewerCalls[0].petNamePath, 'my-mount/src/index.js');
  t.true(ctx.blobViewerCalls[0].readOnly);
});

test('execute cat alias calls openBlobViewer with readOnly=true', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    openBlobViewer: async (petNamePath, readOnly) => {
      ctx.blobViewerCalls.push({ petNamePath, readOnly });
    },
  });

  const result = await executor.execute('cat', {
    petName: 'config.json',
  });

  t.true(result.success);
  t.is(ctx.blobViewerCalls.length, 1);
  t.is(ctx.blobViewerCalls[0].petNamePath, 'config.json');
  t.true(ctx.blobViewerCalls[0].readOnly);
});

test('execute edit command calls openBlobViewer with readOnly=false', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    openBlobViewer: async (petNamePath, readOnly) => {
      ctx.blobViewerCalls.push({ petNamePath, readOnly });
    },
  });

  const result = await executor.execute('edit', {
    petName: 'my-mount/README.md',
  });

  t.true(result.success);
  t.is(ctx.blobViewerCalls.length, 1);
  t.is(ctx.blobViewerCalls[0].petNamePath, 'my-mount/README.md');
  t.false(ctx.blobViewerCalls[0].readOnly);
});

test('view command succeeds when openBlobViewer is not provided', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
    // openBlobViewer intentionally omitted
  });

  const result = await executor.execute('view', {
    petName: 'some-file',
  });

  // Should succeed gracefully (no-op)
  t.true(result.success);
});

test('edit command succeeds when openBlobViewer is not provided', async t => {
  const ctx = createMockContext();
  const executor = createCommandExecutor({
    powers: ctx.powers,
    showValue: v => ctx.showValueCalls.push(v),
    showMessage: m => ctx.showMessageCalls.push(m),
    showError: e => ctx.showErrorCalls.push(e),
  });

  const result = await executor.execute('edit', {
    petName: 'some-file',
  });

  t.true(result.success);
});
