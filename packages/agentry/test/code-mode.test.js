// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify as nodePromisify } from 'node:util';
import { E, Far } from '@endo/far';
import {
  registerFauxProvider,
  fauxAssistantMessage,
  fauxToolCall,
} from '@earendil-works/pi-ai';
import { makeNodeFilesystem } from '@endo/platform/fs/extended';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { makeGit } from '@endo/exo-git';
import { makeNativeGitBackend } from '@endo/git';
import { makeMount, lineageOf } from '@endo/daemon/src/mount.js';
import { makeFilePowers } from '@endo/daemon/src/daemon-node-powers.js';

import { defineAgent, makeEnvCredentials } from '../src/define-agent.js';
import {
  makeExecuteTool,
  makeCompartmentExecute,
  makeCodeModeSystemPrompt,
  makeCodeModeAgent,
  makeCodeModeGitLoopAgent,
} from '../src/execute/index.js';

/** @import { CodeModeGlobal, CodeModeExecute } from '../src/execute/tool.js' */
/** @import { Model } from '@earendil-works/pi-ai' */
/** @import { PassableBytesReader, PassableBytesWriter } from '@endo/exo-stream' */

const execFileAsync = nodePromisify(execFile);

/**
 * Register a per-test faux pi-ai provider whose responses are seeded by the
 * test. Returns the faux `Model` to drive an agent with, plus the registration
 * handle (so the test can teardown the registration).
 *
 * @param {import('ava').ExecutionContext} t
 * @param {import('@earendil-works/pi-ai').AssistantMessage[]} responses
 * @returns {Model<string>}
 */
const fauxModel = (t, responses) => {
  const registration = registerFauxProvider({
    provider: 'faux',
    models: [{ id: 'faux-model' }],
  });
  registration.setResponses(responses);
  t.teardown(() => registration.unregister());
  return registration.getModel();
};

/**
 * @param {Record<string, unknown>} endowments
 * @returns {CodeModeExecute}
 */
const compartmentExecuteOver = endowments =>
  makeCompartmentExecute({ endowments: harden({ E, ...endowments }) });

/**
 * @param {string[]} calls
 */
const makeStubGit = calls =>
  Far('StubGit', {
    async branches() {
      calls.push('branches');
      return harden([{ name: 'main', kind: 'branch' }]);
    },
    async currentBranch() {
      calls.push('currentBranch');
      return harden({ name: 'main', kind: 'branch' });
    },
  });

/**
 * @param {import('ava').ExecutionContext} t
 */
const provisionGitWorktree = async t => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'agentry-git-loop-'),
  );
  t.teardown(() => fs.promises.rm(root, { recursive: true, force: true }));
  await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  await execFileAsync('git', ['config', '--local', 'commit.gpgsign', 'false'], {
    cwd: root,
  });
  await execFileAsync('git', ['config', '--local', 'tag.gpgsign', 'false'], {
    cwd: root,
  });
  await execFileAsync('git', ['config', '--local', 'user.email', 't@t'], {
    cwd: root,
  });
  await execFileAsync('git', ['config', '--local', 'user.name', 'T'], {
    cwd: root,
  });
  await fs.promises.writeFile(path.join(root, 'note.txt'), 'before\n');
  await execFileAsync('git', ['add', 'note.txt'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: root });
  return root;
};

/**
 * Build a live exo `Git` capability over a fresh real repository using the real
 * daemon mount (the same recipe `@endo/agent-tools`'s git-flow test uses): a
 * writable `EndoMount` over the worktree, a `NativeGitBackend`, and `makeGit`.
 * This exercises the real, inert `EndoMountEntry` exo and its private
 * `mountEntryRecords` WeakMap.
 *
 * @param {import('ava').ExecutionContext} t
 */
const makeRealGit = async t => {
  const repoRoot = await provisionGitWorktree(t);
  const workspace = makeNodeFilesystem({ rootPath: repoRoot });
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot });
  const git = makeGit({ mount, backend, lineageOf });
  return harden({ repoRoot, workspace, git });
};

/**
 * @param {PassableBytesReader} readerRef
 * @returns {Promise<Uint8Array>}
 */
const collectBytes = async readerRef => {
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for await (const chunk of iterateBytesReader(readerRef)) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
};

/**
 * @param {unknown} file
 */
const readFileText = async file => {
  const fileRef = /** @type {any} */ (file);
  const stat = await E(fileRef).getStat();
  const openFile = await E(fileRef).open({ read: true });
  try {
    const reader = await E(openFile).read(0n, stat.size ?? 0n);
    return new TextDecoder().decode(await collectBytes(reader));
  } finally {
    await E(openFile).close();
  }
};

/**
 * @param {unknown} file
 * @param {string} text
 */
const writeFileText = async (file, text) => {
  const bytes = new TextEncoder().encode(text);
  const fileRef = /** @type {any} */ (file);
  const openFile = await E(fileRef).open({ write: true });
  try {
    const writer = iterateBytesWriter(await E(openFile).write(0n));
    await writer.next(bytes);
    await writer.return();
    await E(openFile).truncate(BigInt(bytes.length));
  } finally {
    await E(openFile).close();
  }
};

test('the system prompt carries name + one-line description, no type blob', t => {
  /** @type {CodeModeGlobal[]} */
  const globals = harden([
    {
      name: 'git',
      petName: 'git',
      description: 'Read/write @endo/exo-git Git capability for the repo.',
    },
    {
      name: 'repoName',
      description: 'Human-readable repository name.',
    },
  ]);
  const systemPrompt = makeCodeModeSystemPrompt(globals);

  t.true(systemPrompt.includes('declare const git;'));
  t.true(systemPrompt.includes('declare const repoName;'));
  t.true(
    systemPrompt.includes(
      '// Read/write @endo/exo-git Git capability for the repo.',
    ),
  );
  // No hand-maintained TS type declarations leak into the prompt; the model
  // introspects live caps via __getMethodNames__ at runtime.
  t.false(systemPrompt.includes('declare const git: {'));
  t.false(systemPrompt.includes('currentBranch(): Promise'));
  t.true(systemPrompt.includes('__getMethodNames__'));
});

test('makeEnvCredentials is the single env reader and reads through .get', t => {
  const credentials = makeEnvCredentials({ TOKEN: 'secret', EMPTY: '' });
  t.is(credentials.get('TOKEN'), 'secret');
  // Empty values read as undefined.
  t.is(credentials.get('EMPTY'), undefined);
  t.is(credentials.get('ABSENT'), undefined);
});

test('defineAgent returns a maker that builds a powered agent', t => {
  /** @type {Model<string>} */
  const model = harden({
    id: 'm',
    name: 'faux/m',
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: 'http://invalid.example',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 4096,
    maxTokens: 1024,
  });
  const tool = makeExecuteTool(async () => 'ok', []);
  const makeCodeModeAgentMaker = defineAgent({
    model,
    instructions: 'You are codeMode.',
    tools: [
      {
        name: 'execute',
        label: 'execute',
        description: tool.description,
        parameters: /** @type {any} */ (tool.parameters),
        execute: async () => ({ content: [], details: undefined }),
      },
    ],
  });
  t.is(typeof makeCodeModeAgentMaker, 'function');
  const agent = makeCodeModeAgentMaker();
  t.deepEqual(
    agent.state.tools.map(agentTool => agentTool.name),
    ['execute'],
  );
  t.is(agent.state.systemPrompt, 'You are codeMode.');
});

test('makeCodeModeAgent exposes only execute and rejects non-readOnly git in readOnly mode', async t => {
  const { workspace, git } = await makeRealGit(t);
  const model = fauxModel(t, [fauxAssistantMessage('done')]);

  t.throws(
    () =>
      makeCodeModeAgent({
        model,
        powers: { workspace, git, gitMode: 'readOnly' },
      }),
    { message: /requires an already read-only Git capability/ },
  );

  const readOnlyGit = /** @type {{ readOnly: () => unknown }} */ (
    /** @type {unknown} */ (git)
  ).readOnly();
  const { agent, globals } = makeCodeModeAgent({
    model,
    powers: { workspace, git: readOnlyGit, gitMode: 'readOnly' },
  });
  t.deepEqual(
    agent.state.tools.map(tool => tool.name),
    ['execute'],
  );
  t.deepEqual(
    globals.map(global => global.name),
    ['workspace', 'git'],
  );
});

test('faux provider drives a scripted execute-only code-mode agent', async t => {
  const gitCalls = [];
  const git = makeStubGit(gitCalls);
  const executions = [];
  const source =
    '(async () => (await E(git).branches()).map(branch => branch.name))()';
  const model = fauxModel(t, [
    fauxAssistantMessage(fauxToolCall('execute', { source }), {
      stopReason: 'toolUse',
    }),
    fauxAssistantMessage('done'),
  ]);
  const { agent } = makeCodeModeAgent({
    model,
    powers: { git, gitPetName: 'git', gitMode: 'readOnly' },
    execute: async input => {
      const result = await compartmentExecuteOver({ git })(input);
      executions.push(result);
      return result;
    },
  });

  await agent.prompt('List branch names.');
  await agent.waitForIdle();

  t.deepEqual(gitCalls, ['branches']);
  t.deepEqual(executions, [['main']]);
});

test('git-loop preset edits the workspace, commits, and reads HEAD~1 over a real mount', async t => {
  const { repoRoot, workspace, git } = await makeRealGit(t);

  const executions = [];
  const source = `\
(async () => {
  const root = await E(workspace).root();
  const cursor = await E(root).list();
  const listed = await E(cursor).toArray();
  const note = await E(root).lookup('note.txt');
  const beforeStat = await E(note).getStat();

  await writeFileText(note, 'after\\n');

  const rows = await E(git).status();
  const row = rows.find(candidate => candidate.path === 'note.txt');
  if (row === undefined) {
    throw new Error('note.txt did not appear in git status');
  }
  await E(git).add([row.entry]);
  const stagedDiff = await E(git).diff({ cached: true, entries: [row.entry] });
  const commit = await E(git).commit('agent edit');

  const previousFs = await E(git).filesystemAt('HEAD~1');
  const previousRoot = await E(previousFs).root();
  const previousNote = await E(previousRoot).lookup('note.txt');
  const previousText = await readFileText(previousNote);
  const currentText = await readFileText(note);

  return {
    listed: listed.map(entry => entry.name).sort(),
    beforeSize: String(beforeStat.size),
    status: { path: row.path, index: row.index, worktree: row.worktree },
    stagedDiffHasEdit: stagedDiff.includes('+after'),
    commitSummary: commit.summary,
    previousText,
    currentText,
  };
})()`;
  const execute = async input => {
    const result = await compartmentExecuteOver({
      git,
      workspace,
      readFileText,
      writeFileText,
    })(input);
    executions.push(result);
    return result;
  };
  const model = fauxModel(t, [
    fauxAssistantMessage(fauxToolCall('execute', { source }), {
      stopReason: 'toolUse',
    }),
    fauxAssistantMessage('done'),
  ]);
  const agent = makeCodeModeGitLoopAgent({
    model,
    workspace,
    git,
    execute,
    globals: harden([
      {
        name: 'workspace',
        description: 'Writable repository Filesystem.',
      },
      {
        name: 'git',
        description: 'Read/write repository Git capability.',
      },
      {
        name: 'readFileText',
        description: 'Read a UTF-8 file through an endo-fs File capability.',
      },
      {
        name: 'writeFileText',
        description: 'Write UTF-8 text through an endo-fs File capability.',
      },
    ]),
  });

  await agent.prompt('Edit note.txt, commit the change, and inspect HEAD~1.');
  await agent.waitForIdle();

  t.is(executions.length, 1);
  t.deepEqual(executions[0], {
    listed: ['.git', 'note.txt'],
    beforeSize: '7',
    status: { path: 'note.txt', index: 'clean', worktree: 'modified' },
    stagedDiffHasEdit: true,
    commitSummary: 'agent edit',
    previousText: 'before\n',
    currentText: 'after\n',
  });
  t.is(
    await fs.promises.readFile(path.join(repoRoot, 'note.txt'), 'utf8'),
    'after\n',
  );
  const { stdout } = await execFileAsync('git', ['log', '-1', '--format=%s'], {
    cwd: repoRoot,
  });
  t.is(stdout.trim(), 'agent edit');
});
