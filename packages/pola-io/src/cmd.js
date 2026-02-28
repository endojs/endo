// freeze() rather than harden() to stay with ZERO dependencies.
// expected to be compatible with HardenedJS / ses.
// XXX what hazards does this expose us to?
const { freeze } = Object;

/**
 * Access to run a command with flags appended.
 *
 * @example
 * const execP = promisify(childProcess.execFile);
 * const lsPlain = makeCmdRunner('ls', { execFile: execP });
 * const ls = ls.withFlags('-F')
 * await ls.exec('/tmp') // runs: ls /tmp -F
 *
 * TODO? .withPath('/opt') or .withEnv({PATH: `${env.PATH}:/opt`})
 *
 * XXX use a different name from execFile since the meaning is different
 * @param {string} file
 * @param {{ execFile: any }} io XXX expects promisify
 */
export const makeCmdRunner = (file, { execFile }) => {
  /** @param {{ preArgs?: string[], postArgs?: string[] }} [opts] */
  const make = ({ preArgs = [], postArgs = [] } = {}) => {
    return freeze({
      /**
       * @param {string[]} args
       * @param {*} [opts]
       */
      exec: (
        args,
        opts = { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
      ) => execFile(file, [...preArgs, ...args, ...postArgs], opts),
      /**
       * @param {string} name
        @param {string[]} [opts] */
      subCommand: (name, opts = []) =>
        make({ preArgs: [...preArgs, name, ...opts], postArgs }),
      /** @param {string[]} tailFlags */
      withFlags: (...tailFlags) =>
        make({ preArgs, postArgs: [...postArgs, ...tailFlags] }),
    });
  };
  return make();
};
freeze(makeCmdRunner);
/** @typedef {ReturnType<makeCmdRunner>} CmdRunner */

/**
 * @param {Record<string, string | string[] | undefined>} record - e.g. { color: 'blue' }
 * @returns {string[]} - e.g. ['--color', 'blue']
 */
export const flags = record => {
  // TODO? support --yes with boolean?

  /** @type {[string, string][]} */
  // @ts-expect-error undefined is filtered out
  const skipUndef = Object.entries(record).filter(([_k, v]) => v !== undefined);
  return skipUndef.flatMap(([key, value]) => {
    if (Array.isArray(value)) {
      return value.flatMap(v => [`--${key}`, v]);
    }
    return [`--${key}`, value];
  });
};
freeze(flags);
