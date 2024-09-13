import { parseArgs } from 'util';
import { fileURLToPath } from 'url';

import TestStream from 'test262-stream';

// agents:
import { testSesNodeModule, testSesNodeLockdownModule } from './agents/node.js';
import { testXs } from './agents/xs.js';

const options = /** @type {const} */ ({
  list: {
    type: 'boolean',
    multiple: false,
  },
  flag: {
    type: 'string',
    short: 'f',
    multiple: true,
  },
  agent: {
    type: 'string',
    short: 'a',
    multiple: true,
  },
  compact: {
    type: 'boolean',
    multiple: false,
  },
});

const strictPragma = '"use strict";\n';

const strictTest = test => {
  const { contents, insertionIndex } = test;
  return {
    ...test,
    contents: `${strictPragma}${contents}`,
    insertionIndex: insertionIndex + strictPragma.length,
  };
};

async function* generateScenariosForTests(tests, agents, extraFlags) {
  for await (const test of tests) {
    const { attrs } = test;
    const { flags } = attrs;
    // promote these ad-hoc conventions so they are observed by the only/no
    // filters.
    flags.onlyModule = flags.module;
    flags.onlyStrict = flags.strict;
    for (const agent of agents) {
      for (const mode of ['Sloppy', 'Strict', 'Module']) {
        for (const lockdown of [false, true]) {
          for (const compartment of [false, true]) {
            const scenario = [];
            if (lockdown) {
              scenario.push('Lockdown');
            }
            if (compartment) {
              scenario.push('Compartment');
            }
            scenario.push(mode);
            scenario[0] = scenario[0].toLowerCase();
            if (test.attrs.flags.raw && mode === 'Strict') {
              continue;
            }
            yield {
              ...(mode === 'Strict' ? strictTest(test) : test),
              attrs: {
                ...attrs,
                flags: {
                  ...flags,
                  ...extraFlags,
                },
              },
              agent,
              scenario: scenario.join(''),
              mode: mode.toLowerCase(),
              lockdown,
              compartment,
              qualifiers: {
                [agent]: true,
                [mode.toLowerCase()]: true,
                compartment,
                lockdown,
                lockdownCompartment: lockdown && compartment,
              },
              tmp: [
                agent,
                mode.toLowerCase(),
                ...(compartment ? ['compartment'] : []),
                ...(lockdown ? ['lockdown'] : []),
                test.file,
              ].join('/'),
            };
          }
        }
      }
    }
  }
}

async function* filterNoRules(tests) {
  for await (const test of tests) {
    const { attrs, qualifiers } = test;
    const { flags } = attrs;
    const noFlags = Object.keys(flags).filter(
      flag => flags[flag] && flag.match(/^no[A-Z]/),
    );
    if (
      !noFlags.some(noFlag => {
        const condition = noFlag.replace(/^no([A-Z])/, (_, $1) =>
          $1.toLowerCase(),
        );
        return qualifiers[condition];
      })
    ) {
      yield test;
    }
  }
}

async function* filterOnlyRules(tests) {
  for await (const test of tests) {
    const { attrs, qualifiers } = test;
    const { flags } = attrs;
    const onlyFlags = Object.keys(flags).filter(
      flag => flags[flag] && flag.match(/^only[A-Z]/),
    );
    if (
      onlyFlags.every(onlyFlag => {
        const condition = onlyFlag.replace(/^only([A-Z])/, (_, $1) =>
          $1.toLowerCase(),
        );
        return qualifiers[condition];
      })
    ) {
      yield test;
    }
  }
}

const scenariosForTests = (tests, agents, conditions) => {
  tests = generateScenariosForTests(tests, agents, conditions);
  tests = filterNoRules(tests);
  tests = filterOnlyRules(tests);
  return tests;
};

const verboseBegin = test => {
  console.error(
    `## ${test.agent} ${test.mode}${test.lockdown ? ' lockdown' : ''}${test.compartment ? ' compartment' : ''}${test.description ? `${test.description}` : ''} ${test.file}`,
  );
};

const terseEnd = test => {
  console.error(
    `# ${test.ok ? 'ok' : `not ok code=${test.code} signal=${test.signal}`}`,
  );
};

const compactEnd = test => {
  console.error(
    [
      test.ok ? 'pass' : 'fail',
      test.file,
      test.agent,
      test.mode,
      test.lockdown ? 'lockdown' : '',
      test.compartment ? 'compartment' : '',
    ].join(':'),
  );
};

async function* runTests({ tacet, begin }, tests) {
  for await (const test of tests) {
    const { agent, scenario } = test;
    if (agent === 'xs') {
      if (scenario === 'lockdownModule' || scenario === 'module') {
        begin(test);
        yield await testXs(test, { ses: false, tacet });
      }
    }
    if (agent === 'sesXs') {
      if (scenario === 'lockdownModule' || scenario === 'module') {
        begin(test);
        yield await testXs(test, { ses: true, tacet });
      }
    } else if (agent === 'sesNode') {
      if (scenario === 'lockdownModule') {
        begin(test);
        yield await testSesNodeLockdownModule(test, { tacet });
      }
      if (scenario === 'module') {
        begin(test);
        yield await testSesNodeModule(test, { tacet });
      }
    }
  }
}

const main = async () => {
  const {
    values: {
      flag: flagArguments,
      agent: agentArguments,
      list: showList,
      compact: compactReport,
    },
    positionals,
  } = parseArgs({
    args: process.argv.slice(2),
    options,
    allowPositionals: true,
  });

  // These agent names leave a open space for bare XS and node agents to check
  // for progress toward obviating the shim.
  const stream = new TestStream(fileURLToPath(new URL('..', import.meta.url)), {
    paths: positionals.length ? positionals : undefined,
  });
  const conditions = Object.fromEntries(
    (flagArguments ?? []).map(flag => [flag, true]),
  );
  const agents = agentArguments ?? ['xs', 'sesXs', 'sesNode'];
  const tests = scenariosForTests(stream, agents, conditions);

  if (showList) {
    if (compactReport) {
      let prev;
      for await (const test of tests) {
        if (test.file !== prev) {
          console.log(test.file);
          prev = test.file;
        }
      }
    } else {
      for await (const test of tests) {
        const { file, agent, mode, lockdown, compartment } = test;
        console.log(
          `${file}:${agent}:${mode}:${lockdown ? 'lockdown' : ''}:${compartment ? 'compartment' : ''}`,
        );
      }
    }
  } else {
    const begin = compactReport ? Function.prototype : verboseBegin;
    const end = compactReport ? compactEnd : terseEnd;
    for await (const test of runTests({ tacet: compactReport, begin }, tests)) {
      end(test);
    }
  }
};

main().catch(err => {
  console.error('Error running main:', err);
  process.exitCode = 1;
});
