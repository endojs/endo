import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

export const testSesNodeModule = (test, { tacet }) =>
  testNode(test, { tacet, lockdownFlag: 'no-lockdown' });
export const testSesNodeLockdownModule = (test, { tacet }) =>
  testNode(test, { tacet, lockdownFlag: 'lockdown' });

const testNode = async (test, { tacet, lockdownFlag }) => {
  const runPath = fileURLToPath(new URL('../node-helper.js', import.meta.url));
  const args = [
    runPath,
    test.file,
    lockdownFlag,
    ...(test.attrs.includes ?? ['assert.js', 'sta.js']).map(include =>
      fileURLToPath(new URL(`../../harness/${include}`, import.meta.url)),
    ),
  ];
  // console.error(`# node ${args.join(' ')}`);
  const child = spawn('node', args, {
    stdio: [
      'ignore',
      tacet ? 'ignore' : 'inherit',
      tacet ? 'ignore' : 'inherit',
    ],
  });
  const { code, signal } = await new Promise(resolve => {
    child.on('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });
  if (code === 0) {
    return { ok: true, ...test };
  } else {
    return { ok: false, code, signal, ...test };
  }
};
