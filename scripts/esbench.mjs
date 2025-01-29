#!/usr/bin/env node
/// <reference types="node" />

import { execSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import { Readable } from 'node:stream';
const [_node, self, ...argv] = process.argv;
const USAGE = `
Usage: ${self} \\
  [OPTION]... [--arg NAME[:DEF]]... [--setup SETUP] [--] [LABEL:]SNIPPET...

Measure performance of code snippets in multiple ECMAScript implementations.

Options:
  --help, --help-full
    Print full help (including argument descriptions) to standard output.

  --dump
    Rather than writing a script and invoking it, dump it to standard output.

  --host NAME_PATTERN[,NAME_PATTERN]..., -h NAME_PATTERN[,NAME_PATTERN]...
  --hostGroup TYPE_PATTERN[,TYPE_PATTERN]..., -g TYPE_PATTERN[,TYPE_PATTERN]...
  --options OPTIONS, -o OPTIONS
    Pass-through options for the command (eshost). Each use extends the list.
    Example: --options '-c ./eshost-config.json' --host 'V8,*XS'

  --async
  --no-async
    Evaluate each snippet as an expression to be awaited, or suppress such
    awaiting. Note that the value of \`result\` is always inspected and (if
    found to be a thenable) awaited *unless* --no-async is specified.

  --budget SECONDS, -b SECONDS
    How much time to spend measuring each (...arguments, snippet) tuple (or 0
    for no limit). Defaults to 10.

  --module, -m
    Evaluate code as a module which can therefore include dynamic \`import(...)\`
    expressions.

  --init CODE, -i CODE
  --init-file PATH, -f PATH
  --init-module IDENTIFIER, -M IDENTIFIER
    Code to execute once, before anything else (including setup, which runs once
    per measurement iteration).
    Each use is subject to independent preprocessing for isolated evaluation.
    Example: --init \\
      'import { foo } from "/path/to/module.js"; globalThis.foo = foo;'
    Example: --init-file /path/to/module.js
    Example: --init-file <(npx esbuild --bundle /path/to/module.js)
    Example: --init-module 'data:text/javascript,delete globalThis.harden;'
    Example: --init-module semver

  --init-preprocessor, -p
    A command to invoke for bundling init code.
    If not explicitly specified, it will default to something reasonable like
    \`npx esbuild --bundle --format=iife\` or
    \`npx rollup -p @rollup/plugin-node-resolve -f iife\`.

  --arg NAME[~MAX|[,SEP]:VALUES], -a NAME[~MAX|[,SEP]:VALUES]
    Define an argument to be used with varying values against each snippet,
    visible to both setup and snippet code.
    If VALUES is not present, the argument will use successive scaling integers
    starting at 0 until that value exceeds MAX or a measurement exceeds the
    budget (whichever comes first). Only one scaling argument is allowed.
    If VALUES is present, it is interpreted as a list with elements separated by
    either SEP or (if SEP is not present) commas or (if SEP is present but
    empty) any combination of spaces, tabs, and/or line feeds.
    Each use adds a new dimension to the matrix of measurements.
    For future extensibility, this option's value may not include a backslash.
    Example: --arg i
    Example: --arg i~9 --arg shouldMatch,:'true false'
    Example: --arg flag:foo,bar,baz

  --setup CODE, -s CODE
    Code to execute once per measurement iteration, before one or more copies of
    a snippet. Has access to argument variables, which can be used to exercise
    related scenarios such as matching vs. not matching or increasing scale.
    Declarations in setup code are visible to snippet code, and there is always
    an implicit \`let result;\` declaration.
    Example: -ai --setup 'const str = "Lorem ipsum dolor sit amet, ".repeat(i);'
`.trimStart();

const EX_USAGE = 64;
const EX_NOT_EXECUTABLE = 126;
const EX_NOT_FOUND = 127;
const IFS = /[ \t\n]+/g;
const JS_KEYWORDS = [
  // https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-keywords-and-reserved-words
  ...`await break case catch class const continue debugger default delete do
    else enum export extends false finally for function if import in instanceof
    new null return super switch this throw true try typeof var void while with
    yield`.split(IFS),
  ...'let, static, implements, interface, package, private, protected, public'.split(
    ', ',
  ),
  ...'as, async, from, get, meta, of, set, target'.split(', '),
  // ...plus our own special prohibitions
  'arguments',
  'result',
];

/**
 * @template [T=unknown]
 * @typedef {{promise: Promise<T>, resolve: (resolution: T | Promise<T>) => void, reject: (reason: unknown) => void}} PromiseKit
 */

/**
 * @template T
 * @returns {PromiseKit<T>}
 */
const makePromiseKit = () => {
  /** @type {any} */
  let resolvers;
  const promise = new Promise((resolve, reject) => {
    resolvers = { resolve, reject };
  });
  return { promise, ...resolvers };
};

/** @type {(str: string) => number} */
const parseNumber = str => (/[0-9]/.test(str) ? +str : NaN);

/** @type {(value: unknown) => string} */
const q = value => JSON.stringify(value);

/**
 * Split a simple command into POSIX tokens as if there were no expansion or
 * substitution (i.e., applying special treatment to backslash and quote
 * characters but not to dollar signs or backticks).
 * https://pubs.opengroup.org/onlinepubs/9699919799/utilities/V3_chap02.html#tag_18_03
 *
 * @param {string} simpleCommand
 * @returns {string[]}
 */
const shellTokenize = simpleCommand => {
  // Replace special sequences (i.e., those that might contain literal
  // whitespace) with dummy placeholders, but remember them.
  const extracts = [];
  const splittable = simpleCommand.replaceAll(
    /[\\](.)|'([^'']*)'|"((?:[^\\""]|\\.)*)"|(?:(^|[ \t\n])#[^\n]*)/gs,
    (_s, escaped, singleQuoted, doubleQuoted, beforeComment) => {
      if (beforeComment !== undefined) return beforeComment;
      extracts.push(
        escaped ||
          singleQuoted ||
          doubleQuoted.replaceAll(/\\(?:([$``""\\])|\n)/g, '$1'),
      );
      return '\\@';
    },
  );

  // Split the result, then replace the placeholders.
  const tokens = splittable
    .split(IFS)
    .filter(token => token !== '')
    .map(token => token.replaceAll(/\\@/g, () => extracts.shift()));
  return tokens;
};

/**
 * @typedef {object} SpawnResult
 * @property {number | null} status
 * @property {Buffer | null} stdout
 * @property {Buffer | null} stderr
 * @property {string | null} signal
 * @property {Error | null} error
 */

/**
 * Launch a child process with optional standard input.
 *
 * @param { string[] } cmd
 * @param { {input?: Parameters<typeof Readable.from>[0]} & Parameters<typeof spawn>[2] } options
 * @returns { Promise<SpawnResult & ({error: Error} | {status: number} | {signal: string})> }
 */
const spawnKit = async ([cmd, ...args], { input, ...options } = {}) => {
  const child = spawn(cmd, args, options);
  /** @type {{stdout: Buffer[], stderr: Buffer[]}} */
  const outChunks = { stdout: [], stderr: [] };
  const exitKit = makePromiseKit();
  const inKit = child.stdin && makePromiseKit();
  const outKit = child.stdout && makePromiseKit();
  const errKit = child.stderr && makePromiseKit();
  // cf. https://nodejs.org/docs/latest/api/child_process.html#child_processspawnsynccommand-args-options
  /** @type {SpawnResult} */
  const result = {
    status: null,
    stdout: null,
    stderr: null,
    signal: null,
    error: null,
  };
  child.on('error', err => {
    result.error = err;
    // An exit event *might* be coming, so wait a tick.
    setImmediate(() => exitKit.resolve(undefined));
  });
  child.on('exit', (exitCode, signal) => {
    result.status = exitCode;
    result.signal = signal;
    exitKit.resolve(undefined);
  });
  /** @type {(emitter: import('node:events').EventEmitter, kit: PromiseKit, msg: string) => void} */
  const rejectOnError = (emitter, kit, msg) => {
    emitter.on('error', err => kit.reject(Error(msg, { cause: err })));
  };
  /** @typedef {[string, Readable, Buffer[], PromiseKit]} ReadableKit */
  for (const [label, stream, chunks, kit] of /** @type {ReadableKit[]} */ ([
    ['stdout', child.stdout, outChunks.stdout, outKit],
    ['stderr', child.stderr, outChunks.stderr, errKit],
  ])) {
    if (!stream) continue;
    rejectOnError(stream, kit, `failed reading from ${q(cmd)} ${label}`);
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => kit.resolve(undefined));
  }
  if (child.stdin && inKit) {
    rejectOnError(child.stdin, inKit, `failed writing to ${q(cmd)} stdin`);
    Readable.from(input || []).pipe(child.stdin);
    child.stdin.on('finish', () => inKit.resolve(undefined));
  } else if (input) {
    throw Error(`missing ${q(cmd)} stdin`);
  }
  await Promise.all([exitKit, inKit, outKit, errKit].map(kit => kit?.promise));
  if (outKit) result.stdout = Buffer.concat(outChunks.stdout);
  if (errKit) result.stderr = Buffer.concat(outChunks.stderr);
  // @ts-expect-error result will satisfy one of the error/status/signal constraints
  return result;
};

const toSource = (value, space) =>
  // Rely on JSON.stringify, but replace `"__proto__"` property names
  // with computed equivalent `["__proto__"]` and make all objects
  // null-prototype (ensuring that absent fields are undefined).
  JSON.stringify(value, undefined, space)
    // Escape "{" in strings to avoid confusing later replacements.
    .replaceAll(/"([^\\""]|\\.)*"/gs, s => s.replaceAll('{', '\\x7B'))
    .replaceAll('"__proto__":', '["__proto__"]:')
    .replaceAll('{', '{__proto__: null,')
    // Restore "{".
    .replaceAll(/\\x7B|\\./gs, s => (s === '\\x7B' ? '{' : s));

const { makeSimpleError, raiseError } = (() => {
  const simpleErrors = new WeakSet();
  return {
    makeSimpleError: msg => {
      const err = Error(msg);
      simpleErrors.add(err);
      return err;
    },
    raiseError: (err, exitCode = 1) => {
      if (typeof err === 'string') err = makeSimpleError(err);
      console.error(
        simpleErrors.has(err) ? `${err.name}: ${err.message}` : err,
      );
      process.exitCode ||= exitCode;
    },
  };
})();

const { addCleanup, cleanup } = (() => {
  const cleanups = [];
  return {
    addCleanup: callback => {
      cleanups.push(callback);
    },
    cleanup: () => {
      while (cleanups.length) {
        const callback = cleanups.pop();
        try {
          const result = callback();
          if (result && typeof result.then === 'function') {
            const name = callback.name || `<anonymous ${callback}>`;
            throw Error(`cleanup ${name} was not synchronous!`);
          }
        } catch (err) {
          raiseError(err);
        }
      }
    },
  };
})();

const CMD_OPTION_NAMES = [
  ...['--host', '-h'],
  ...['--hostGroup', '-g'],
  ...['--options', '-o'],
];
const INIT_OPTION_NAMES = [
  ...['--init', '-i'],
  ...['--init-file', '-f'],
  ...['--init-module', '-M'],
];

/**
 * @typedef {object} CliOptions
 * @property {boolean} dump
 * @property {string[]} cmdOptions
 * @property {number} budget in milliseconds
 * @property {boolean} [awaitSnippets]
 * @property {boolean} asModule
 * @property {string[]} inits
 * @property {string} [preprocessor] command for bundling JavaScript module
 *   code into script code, e.g. `esbuild --bundle --format=iife`
 * @property {Record<string, string[] | number[] | { max: number }>} args
 *   named arguments with their corresponding values for the snippets
 * @property {string} [scalingArg] the key in `args` naming the argument that
 *   provides successive scaling integers
 * @property {string[]} setups
 * @property {Array<[label: null | string, code: string]>} snippets
 */

/**
 * @param {string[]} argv starting after $0
 * @param {(msg: string) => never} fail
 * @returns {CliOptions & {help: boolean}}
 */
const parseArgs = (argv, fail) => {
  // DEFAULT VALUES

  let dump = false;
  let cmdOptions = [];
  let awaitSnippets = undefined;
  let budget = 10;
  let asModule = false;
  let inits = [];
  let preprocessor = undefined;
  let args = Object.create(null);
  let scalingArg;
  let setups = [];
  let snippets = [];

  // HELPERS

  const AsyncFunction = Function(
    'try { return (async () => {}).constructor; } catch (_err) {}',
  )();
  const isValidSyntax = (code, validators = [AsyncFunction, Function]) => {
    return validators.some(ctor => {
      try {
        ctor(code);
        return true;
      } catch (_err) {}
    });
  };

  let readStdin = () => {
    readStdin = () => fail('duplicate `-`; stdin cannot be read twice!');
    return readFileSync(0, 'utf8');
  };

  const argPatt =
    // NAME[~MAX|[,SEP]:VALUES]
    /^(?<name>[^~,:]*)(?:~(?<max>.*)|(?:,(?<sep>[^:]*))?:(?<values>.*))?$/s;
  const argIdPatt = /^[\p{ID_Start}$_][\p{ID_Continue}$]*$/u;
  const pushArg = (opt, def) => {
    const parts = def.match(argPatt)?.groups || fail(`invalid ${opt} ${def}`);
    const { name, max: maxStr, sep, values: valuesStr } = parts;
    (name.match(argIdPatt) && !JS_KEYWORDS.includes(name)) ||
      fail(
        `argument name ${q(name)} is a (conditional) keyword or non-identifier`,
      );
    !args[name] || fail(`duplicate argument name ${q(name)}`);
    if (valuesStr !== undefined) {
      // Represent enumerated arguments as arrays.
      const values = valuesStr.split((sep ?? ',') || IFS);
      new Set(values).size === values.length ||
        fail(`argument ${q(name)} VALUES has duplicates`);
      // If every value round-trips through parseNumber, accept the coercion.
      const numberValues = values.map(v => {
        const n = parseNumber(v);
        return `${n}` === v ? n : NaN;
      });
      args[name] = numberValues.some(v => isNaN(v)) ? values : numberValues;
    } else {
      // Represent scaling arguments as { max: number } objects.
      const max = maxStr === undefined ? Infinity : parseNumber(maxStr);
      (max >= 0 && Math.floor(max) === max) ||
        fail(`argument ${q(name)} MAX must be a non-negative integer`);
      scalingArg === undefined ||
        fail(`scaling argument ${q(name)} conflicts with ${q(scalingArg)}`);
      scalingArg = name;
      args[name] = { max };
    }
  };

  const snippetPatt = /^(?:(?<label>[^:]*):)?(?<code>.*)/s;
  const pushSnippet = def => {
    let { label, code } =
      def.match(snippetPatt)?.groups || fail(`bad snippet ${def}`);
    // If the definition was pure code that happened to include a colon,
    // put back the incorrectly extracted label.
    if (code !== '-' && !isValidSyntax(code) && code !== def) {
      code = def;
      label = undefined;
    }
    if (label) {
      snippets.every(([otherLabel]) => otherLabel !== label) ||
        fail(`duplicate snippet label ${q(label)}`);
    } else {
      label = null;
    }
    if (code === '-') code = readStdin();
    isValidSyntax(code) || fail(`syntax error in snippet ${def}`);
    snippets.push([label, code]);
  };

  // PROCESSING

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    // Non-options and `-` specify snippets, as does everything after `--`.
    if (!arg.startsWith('-') || arg === '-') {
      pushSnippet(arg);
      continue;
    } else if (arg === '--') {
      for (const arg of argv.slice(i + 1)) pushSnippet(arg);
      break;
    }

    // Long options might have an `=$value` suffix;
    // short options might have a suffix of a value or more options.
    const isLongOpt = arg.startsWith('--');
    const eqPos = isLongOpt ? arg.indexOf('=') : -1;
    const opt = arg.slice(0, isLongOpt ? (eqPos >= 0 ? eqPos : undefined) : 2);
    let valueCount = 0;
    const takeValue = () => {
      const asSuffix = valueCount === 0 && opt !== arg;
      const value = asSuffix
        ? arg.slice(eqPos + 1 || opt.length)
        : argv[(i += 1)];
      typeof value === 'string' ||
        fail(
          valueCount === 0
            ? `${opt} requires a value`
            : `${opt} requires more than ${valueCount} value(s)`,
        );
      valueCount += 1;
      return value;
    };

    if (opt === '--help' || opt === '--help-full') {
      return /** @type {any} */ ({ help: true });
    } else if (opt === '--dump') {
      dump = true;
    } else if (CMD_OPTION_NAMES.includes(opt)) {
      if (opt !== '--options' && opt !== '-o') {
        cmdOptions.push(opt);
      }
      for (const arg of takeValue().split(IFS)) cmdOptions.push(arg);
    } else if (opt === '--async' || opt === '--no-async') {
      awaitSnippets = opt === '--async';
    } else if (opt === '--budget' || opt === '-b') {
      budget = parseNumber(takeValue());
      budget >= 0 || fail(`${opt} requires a non-negative number`);
    } else if (opt === '--module' || opt === '-m') {
      asModule = true;
    } else if (INIT_OPTION_NAMES.includes(opt)) {
      let code = takeValue();
      if (opt === '--init-file' || opt === '-f') {
        code = code === '-' ? readStdin() : readFileSync(code, 'utf8');
      } else if (opt === '--init-module' || opt === '-M') {
        code = `import ${q(code)};`;
      }
      inits.push(code);
    } else if (opt === '--init-preprocessor' || opt === '-p') {
      preprocessor = takeValue();
    } else if (opt === '--arg' || opt === '-a') {
      const def = takeValue();
      !def.includes('\\') ||
        fail(
          `for future extensibility, ${opt} values may not include backslash`,
        );
      pushArg(opt, def);
    } else if (opt === '--setup' || opt === '-s') {
      const setup = takeValue();
      isValidSyntax(setup) || fail(`syntax error in setup ${setup}`);
      setups.push(setup);
    } else {
      fail(`unknown option ${opt}`);
    }

    // If the argument was not an isolated option and no value was consumed,
    // check if a value was present (to reject it) and check for collapsed short
    // options (to read the remainder at the same argv index).
    if (opt !== arg && valueCount === 0) {
      !isLongOpt || fail(`${opt} does not support a value`);
      argv[i] = arg.at(0) + arg.slice(2);
      i -= 1;
    }
  }

  return {
    help: false,
    dump,
    cmdOptions,
    // Convert seconds to milliseconds.
    budget: budget * 1000,
    awaitSnippets,
    asModule,
    inits,
    preprocessor,
    args,
    scalingArg,
    setups,
    snippets,
  };
};

const main = async argv => {
  for (const fatal of ['SIGINT', 'SIGQUIT', 'SIGTERM']) {
    process.on(fatal, cleanup);
  }
  const usageSummary = USAGE.replace(/\n {3}.*|\n+$/g, '');
  const failArg = msg => {
    process.exitCode = EX_USAGE;
    throw makeSimpleError(`${msg}\n\n${usageSummary}`);
  };
  const {
    help,
    dump,
    cmdOptions,
    budget,
    awaitSnippets,
    asModule,
    inits: rawInits,
    preprocessor,
    args,
    scalingArg,
    setups,
    snippets,
  } = parseArgs(argv, failArg);
  if (help) {
    console.log(USAGE);
    process.exitCode = EX_USAGE;
    return;
  } else if (snippets.length === 0) {
    failArg('at least one snippet is required');
  }

  // Preprocess init code.
  let inits = [...rawInits];
  if (rawInits.length > 0) {
    /** @type {undefined | string[]} */
    let cmd;
    if (preprocessor) {
      cmd = shellTokenize(preprocessor);
    } else {
      const npx = 'npm exec --no --'.split(IFS);
      const bundlers = [
        'esbuild --bundle --format=iife'.split(IFS),
        'rollup -p @rollup/plugin-node-resolve -f iife'.split(IFS),
      ];
      const settlements = await Promise.allSettled(
        bundlers.map(npxCmd =>
          spawnKit([...npx, npxCmd[0], '--help'], {
            stdio: 'ignore',
            timeout: 15000,
            killSignal: 'SIGKILL',
          }).then(result => ({ npxCmd, ...result })),
        ),
      );
      /** @typedef {Extract<typeof settlements[number], {status: 'fulfilled'}>} FoundBundler */
      const bestResult = /** @type {FoundBundler[]} */ (settlements).find(
        ({ status, value }) => status === 'fulfilled' && value.status === 0,
      )?.value;
      if (bestResult) cmd = [...npx, ...bestResult.npxCmd];
    }
    const preprocess = !cmd
      ? code => code
      : async code => {
          const result = await spawnKit(cmd, { input: code });
          const { status: exitCode, stdout, stderr } = result;
          if (exitCode !== 0) {
            const { signal: exitSignal, error } = result;
            const err = Error(
              `preprocess with ${q(cmd)} failed: ${stderr?.toString()}`,
              { cause: error },
            );
            const wrappedErr = /** @type {any} */ (err);
            wrappedErr.exitCode = exitCode;
            wrappedErr.exitSignal = exitSignal;
            wrappedErr.stdout = stdout && stdout.toString();
            wrappedErr.stderr = stderr && stderr.toString();
            throw wrappedErr;
          }
          return /** @type {any} */ (stdout).toString();
        };
    inits = await Promise.all(rawInits.map(preprocess));
    // Module code is always strict, so prefix it with a Use Strict Directive
    // (this import/export detection heuristic will also catch some non-module
    // code, but so be it).
    const importOrExportPatt =
      /^\s*(import|export)(\s*[*{"''"](?:.*?[}])?|\s+[\p{ID_Start}$_])/mu;
    const isModuleLike = rawInits.some(code => code.match(importOrExportPatt));
    if (isModuleLike) inits.unshift('"use strict"');
  }

  // Assemble script source.
  const config = {
    awaitSnippets,
    budget,
    args,
    scalingArg,
    setup: setups.join(';\n'),
    snippets,
    r: randomBytes(16).toString('hex'),
  };
  /** Robustly make a dedent tag function from primordials. */
  function makeDedent() {
    const { getOwnPropertyDescriptors, defineProperties, seal } = Object;
    const { call } = Function.prototype;
    const join = call.bind(Array.prototype.join);
    const push = call.bind(Array.prototype.push);
    const exec = call.bind(RegExp.prototype.exec);
    const stringSlice = call.bind(String.prototype.slice);
    const split = call.bind(String.prototype.split);
    const regexpDescriptors = getOwnPropertyDescriptors(RegExp.prototype);
    Reflect.ownKeys(regexpDescriptors).forEach(key => {
      const desc = regexpDescriptors[/** @type {any} */ (key)];
      desc.configurable = false;
      if (desc.writable) desc.writable = false;
    });
    const sealedRegexp = patt =>
      seal(defineProperties(RegExp(patt), regexpDescriptors));
    const rNonSpace = sealedRegexp(/\S/.source);
    const dedent = (strings, ...subs) => {
      const parts = [];
      for (let rIndent, i = 0; i < strings.length; i += 1) {
        if (i > 0) push(parts, `${subs[i - 1]}`);

        // Split each string into lines, immediately consuming the first unless it
        // might include initial indentation in strings[0].
        const lines = split(strings[i], '\n');
        const start = i === 0 && lines[0] !== '' ? 0 : 1;
        if (start !== 0) push(parts, lines[0]);

        for (let j = start; j < lines.length; j += 1) {
          // Capture indentation before non-whitespace or the end of strings[i].
          const line = lines[j];
          const more = j < lines.length - 1;
          if (!rIndent) {
            const m =
              exec(rNonSpace, line) || (!more && { index: line.length });
            if (m && m.index) rIndent = sealedRegexp(`^\\s{1,${m.index}}`);
          }

          // Skip an isolated initial line feed in strings[0].
          push(parts, i > 0 || j > start ? '\n' : '');
          const found = rIndent && exec(rIndent, line);
          push(parts, found ? stringSlice(line, found[0].length) : line);
        }
      }
      return join(parts, '');
    };
    return dedent;
  }
  const dedent = makeDedent();
  async function benchmark(
    // Extract as parameters identifiers that should have been keywords.
    { undefined, Infinity = 1 / 0, NaN = +'NaN', ...powers },
    config,
  ) {
    // Validate captured primitives and capture further primordials to be robust
    // against manipulation in init/setup/etc.
    // This is probably paranoid, but we *do* want to benchmark shims/polyfills/etc.
    if (undefined !== void 0) throw 'Error: bad `undefined`!';
    if (Infinity !== 1 / 0) throw 'Error: bad `Infinity`!';
    if (NaN === NaN) throw 'Error: bad `NaN`!';
    // Capture callables for later use.
    const { Function, Symbol } = globalThis;
    const AsyncFunction = Function(
      'try { return (async () => {}).constructor; } catch (_err) {}',
    )();
    const { from: arrayFrom } = Array;
    const { now } = Date;
    const { stringify } = JSON;
    const { ceil, floor, max, min, random } = Math;
    const { isFinite } = Number;
    const { create, isSealed } = Object;
    const { entries, getOwnPropertyDescriptors, keys, values } = Object;
    const { defineProperties, freeze, seal, setPrototypeOf } = Object;
    const { apply, construct, ownKeys } = Reflect;
    const { raw } = String;
    const fullArray = (n, value) => {
      const sparse = setPrototypeOf({ length: n }, null);
      return arrayFrom(sparse, () => value);
    };
    const defineName = (name, fn) =>
      defineProperties(fn, { name: { value: name } });
    const uncurryThis = fn => {
      const uncurried = defineName(
        `unbound ${fn.name || ''}`,
        (receiver, ...args) => apply(fn, receiver, args),
      );
      return uncurried;
    };
    // Avoid Object.fromEntries, which reads its argument as an iterable and is
    // therefore susceptible to replacement of Array.prototype[Symbol.iterator]
    // (and for the same reason, also avoid array destructuring like
    // `([k, v]) => ...`).
    const assignEntries = (entries, obj = {}) => {
      for (let i = 0; i < entries.length; i += 1) {
        obj[entries[i][0]] = entries[i][1];
      }
      return obj;
    };
    const uncurryMethods = ({ prototype: proto }) => {
      const makeEntryOrDiscard = name => {
        const method = proto[name];
        return name !== 'constructor' && typeof method === 'function'
          ? [[name, uncurryThis(method)]]
          : [];
      };
      return assignEntries(ownKeys(proto).flatMap(makeEntryOrDiscard));
    };
    const arrayPowers = uncurryMethods(Array);
    const {
      indexOf,
      filter,
      flatMap,
      forEach,
      join,
      map,
      push,
      slice,
      sort,
      unshift,
    } = arrayPowers;
    const numberPowers = uncurryMethods(Number);
    const { toExponential } = numberPowers;
    const numberToString = /** @type {(x: number, base?: number) => string} */ (
      numberPowers.toString
    );
    const stringPowers = uncurryMethods(String);
    const { padEnd, repeat, split, slice: stringSlice } = stringPowers;
    const { exec: regexpExec, [Symbol.replace]: regexpReplace } =
      uncurryMethods(RegExp);

    // Primordially, String.prototype.replace [[Get]]s %Symbol.replace%, and
    // RegExp.prototype[%Symbol.replace%] [[Get]]s "flags" and "exec" (and
    // transitively "hasIndices"/"global"/"ignoreCase"/etc.), so a
    // tamper-resistant `replace` function must be written manually.
    // This one requires its search argument to be a regular expression, upon
    // which it copies own properties from the primordial prototype.
    const regexpDescriptors = getOwnPropertyDescriptors(RegExp.prototype);
    forEach(ownKeys(regexpDescriptors), key => {
      const desc = regexpDescriptors[key];
      desc.configurable = false;
      if (desc.writable) desc.writable = false;
    });
    const replace = (str, re, replacer) => {
      if (!isSealed(re)) seal(defineProperties(re, regexpDescriptors));
      return regexpReplace(re, str, replacer);
    };
    const exec = (re, str) => {
      if (!isSealed(re)) seal(defineProperties(re, regexpDescriptors));
      return regexpExec(re, str);
    };

    const rFracPrefix = /0?[.]/g;

    const {
      awaitSnippets,
      budget,
      init,
      args,
      scalingArg,
      setup,
      snippets,
    } = config;
    const randomHex = byteLen => {
      let s = replace(numberToString(random(), 16), rFracPrefix, '') || '0';
      if (s.length < byteLen * 2) s += randomHex(byteLen - (s.length >> 1));
      return stringSlice(s, 0, byteLen * 2);
    };
    const { r = randomHex(16) } = config;

    // dummy is an object with no extractable properties.
    const dummy = freeze(create(null));
    // dedent with String.raw is safe but incorrect.
    const {
      print,
      dedent = (strings, ...subs) =>
        apply(raw, undefined, prepended(subs, { raw: strings })),
    } = powers;
    /**
     * prepended(arr, ...items) returns [...items, ...arr].
     *
     * @template T=unknown
     * @param {T[]} arr
     * @param {...T} items
     * @returns {T[]}
     */
    const prepended = (arr, ...items) => {
      const arr2 = slice(arr);
      for (let i = items.length - 1; i >= 0; i -= 1) unshift(arr2, items[i]);
      return arr2;
    };
    /** @type {typeof prepended} */
    const appended = (arr, ...items) => {
      const arr2 = slice(arr);
      for (let i = 0; i < items.length; i += 1) push(arr2, items[i]);
      return arr2;
    };
    /**
     * Map a nonempty array to itself and an empty array to a substitute.
     *
     * @template T=unknown
     * @param {T[]} arr
     * @param {T[]} sub
     * @returns {T[]}
     */
    const ifEmpty = (arr, sub) => (arr.length === 0 ? sub : arr);
    /**
     * Return the Cartesian product of input arrays (replacing an empty input
     * with [undefined]) as an array of arrays.
     *
     * @template T=unknown
     * @param {T[][]} arrays
     * @returns {T[][]}
     */
    const crossJoin = arrays => {
      if (arrays.length === 0) return [];
      const arr0 = ifEmpty(arrays[0], [undefined]);
      const rest = slice(arrays, 1);
      const suffixes = ifEmpty(crossJoin(rest), [[]]);
      return flatMap(arr0, val => map(suffixes, rest => prepended(rest, val)));
    };
    /** Perform an in-place Fisher-Yates shuffle. */
    const shuffle = arr =>
      forEach(arr, (v, i, arr) => {
        const j = i + floor(random() * (arr.length - i));
        arr[i] = arr[j];
        arr[j] = v;
      });

    init();

    const nonScalingArgs = assignEntries(
      filter(entries(args), ({ 0: name }) => name !== scalingArg),
    );
    const argNames = keys(nonScalingArgs);
    // A final scale argument is always present, but might not be named.
    if (scalingArg !== undefined) push(argNames, scalingArg);

    /**
     * @typedef SnippetMemory
     * @property {string | null} label
     * @property {number} i probe construction counter
     * @property {number} n most recent repetition count
     */
    /**
     * Return a function for measuring a single execution of repeated code.
     *
     * @param {string} code
     * @param {SnippetMemory} data
     */
    const makeTimer = (code, data) => {
      data.i += 1;
      const { label, i, n } = data;
      // Suffix embedded binding names to make them unguessable and
      // collision-resistant against input and unique against runtime
      // compilation optimizations.
      const _ = '';
      const capNamesRecord = { dummy: _, now: _, token: _ };
      const capNames = keys(capNamesRecord);
      const v = {
        // powers and capabilities
        ...capNamesRecord,
        // bookkeeping
        ...{ awaited: _, i: _, t0: _, t1: _, tF: _ },
      };
      forEach(keys(v), name => {
        v[name] = join([name, r, i], '_');
      });
      let ctor = Function;
      let repeatable = code + ';';
      let hideFromCode = values(v);
      if (awaitSnippets === true) {
        ctor = AsyncFunction;
        if (!ctor) throw 'Error: missing AsyncFunction constructor!';
        repeatable = `await (${code});`;
      } else if (awaitSnippets === undefined) {
        ctor = AsyncFunction || Function;
        const isThenable = `typeof (result || ${v.dummy}).then === 'function'`;
        const handleThenable = `${v.awaited} = true; await result;`;
        repeatable = `${code}; if (${isThenable}) { ${handleThenable} }`;
        hideFromCode = filter(hideFromCode, name => {
          const baseName = split(name, '_')[0];
          return baseName !== 'awaited' && baseName !== 'dummy';
        });
      }
      // To avoid a size explosion, limit the repeated code to 1000 instances
      // inside a loop body plus a literal remainder.
      const R = n => fullArray(n, repeatable);
      const repeats =
        n <= 1000
          ? R(n)
          : prepended(
              R(n % 1000),
              // prettier-ignore
              `for (let ${v.i} = 0; ${v.i} < ${floor(n / 1000)}; ${v.i} += 1) {\n${
                join(R(1000), '\n')
              }\n}`,
            );
      const ctorArgs = slice(argNames);
      // Shadow `arguments` to avoid leaking infrastructure details.
      push(ctorArgs, '...arguments');
      const body = dedent`
        // Consume capabilities into variables with suffixed names.
        const {
          ${join(
            map(capNames, name => `${name}: ${v[name]}`),
            ', ',
          )}
        } = arguments[arguments.length - 1];
        arguments.length = 0;
        let ${v.i}, result;
        let ${v.awaited} = false;

        // --setup
        ${setup};
        result = undefined;

        // Find a clock edge, then measure n snippet repetitions.
        const ${v.t0} = ${v.now}();
        let ${v.t1} = ${v.t0};
        for (; ${v.t1} === ${v.t0}; ${v.t1} = ${v.now}()) {}
        // Note that this block is not a \`for\` body.
        {
          let ${join(hideFromCode, ', ')};
          {
            ${join(repeats, '\n    ')}
          }
        }
        const ${v.tF} = ${v.now}();
        return {
          result,
          ${join(
            map(entries(v), ({ 0: k, 1: as }) => `${k}: ${as}`),
            ',\n  ',
          )},
        };
      `;
      push(ctorArgs, body);
      const inner = defineName(label || 'dynamic', construct(ctor, ctorArgs));
      const timer = async (args, getTimestamp = now) => {
        const token = Symbol();
        const powers = { dummy, now: getTimestamp, token };
        const result = await apply(inner, undefined, appended(args, powers));
        const { token: tokenOut, awaited, t0, t1, tF } = result;
        if (tokenOut !== token) {
          throw `Error: early return ${stringify(result)}`;
        }
        return { awaited, duration: tF - t1, resolution: t1 - t0 };
      };
      return timer;
    };

    /** @type {Record<PropertyKey, SnippetMemory>} */
    const dataByKey = create(null);
    /** Take a sample ({@link https://en.wikipedia.org/wiki/Sampling_(statistics)}). */
    const sample = async (key, label, code, budget, args) => {
      const data = (dataByKey[key] ||= { label, i: 0, n: 1 });

      // Make a timer function with repetition count tuned to foster
      // durations of (30 +/- 20) increments of timer resolution.
      let timer,
        duration,
        resolution = Infinity;
      for (let a = 1, b = Infinity, n = data.n; ; n = max(a, min(n, b))) {
        data.n = n;
        timer = makeTimer(code, data);
        const firstData = await timer(args);
        ({ duration } = firstData);
        // Ignore clock discontinuities that we can detect.
        if (firstData.resolution <= 0 || duration < 0) continue;
        resolution = min(resolution, firstData.resolution);
        if (duration < 10 * resolution) {
          a = n + 1;
          if (duration > 0) {
            n = ceil((n / duration) * 30 * resolution);
          } else {
            n = b < Infinity ? ceil((a + b) / 2) : n * 2;
          }
        } else if (duration > 50 * resolution) {
          b = n - 1;
          n = ceil((n / duration) * 30 * resolution);
        } else {
          break;
        }
        if (a >= b) {
          data.n = max(1, b);
          timer = makeTimer(code, data);
          duration = undefined;
          break;
        }
      }

      // Collect data from the timer.
      const samples = duration ? [duration] : [];
      let totalDuration = duration || 0;
      while (totalDuration < budget) {
        const { duration } = await timer(args);
        samples.push(duration);
        totalDuration += duration;
      }
      return { n: data.n, totalDuration, samples };
    };

    // For each non-final scaling value and each combination of non-scaling
    // arguments, collect samples from the snippets in random order.
    const argCombos = ifEmpty(crossJoin(values(nonScalingArgs)), [[]]);
    const snippetIdxs = map(snippets, (_, i) => i);
    const liveSnippetsForCombo = map(argCombos, () => slice(snippetIdxs));
    const scaling = scalingArg !== undefined ? args[scalingArg] : { max: 0 };
    const maxScale = isFinite(scaling.max) ? scaling.max : Infinity;
    for (let C = argCombos.length, scale = 0; scale <= maxScale; scale += 1) {
      for (let i = 0; i < argCombos.length; i += 1) {
        if (!liveSnippetsForCombo[i]) continue;
        shuffle(snippetIdxs);
        const output = [];
        for (let j = 0; j < snippetIdxs.length; j += 1) {
          const snippetIdx = snippetIdxs[j];
          const k = indexOf(liveSnippetsForCombo[i] || [], snippetIdx);
          if (k < 0) continue;
          const { 0: label, 1: code } = snippets[snippetIdx];
          const resolvedArgs = appended(argCombos[i], scale);
          const data = await sample(
            snippetIdx,
            label,
            code,
            budget,
            resolvedArgs,
          );
          const { n, totalDuration, samples } = data;
          push(output, {
            label,
            i: snippetIdx,
            data,
            line: `${label || code} (${stringSlice(stringify(resolvedArgs), 1, -1)}) ${
              (samples.length * n) / totalDuration
            } ops/ms after ${samples.length} ${n}-count samples`,
          });
          if (samples.length < 2 || samples[1] >= budget * 2) {
            const keep = (_label, index) => index !== k;
            liveSnippetsForCombo[i] = filter(liveSnippetsForCombo[i], keep);
            if (liveSnippetsForCombo[i].length === 0) {
              liveSnippetsForCombo[i] = undefined;
              C -= 1;
            }
          }
        }
        sort(output, (a, b) => a.i - b.i);
        forEach(output, ({ line }) => print(line));
      }
      if (C <= 0) break;
    }
  }
  const benchmarkFnSource = dedent(['  ' + benchmark.toString()]);
  const script = dedent`
    // As a convenience, provide a missing print/console using the other.
    globalThis.print ||= console.log;
    globalThis.console ||= Object.create(null);
    for (const m of 'debug log info warn error groupCollapsed groupEnd'.split(' ')) {
      console[m] ||= print;
    }

    // Invoke the async function with a logging catch handler that is
    // immune to later manipulation of Array/Object/Promise/console/etc.
    // Basically, spell \`((fn)(...args)).catch(die)\`
    // as \`Promise.prototype.catch.call(...reverseArgs(die, (fn)(...args)))\`.
    // (we can't use console.error because V8 defines one that swallows all input)
    Promise.prototype.catch.call(...(
      function reverseArgs(...args) {
        const last = { done: true, value: undefined };
        let i = args.length;
        return {
          [Symbol.iterator]() { return this; },
          next() { return --i >= 0 ? { done: false, value: args[i] } : last; },
        };
      }
    )(
    (log => function die(err) { log(err); throw err; })(console.log.bind(console, "ERROR")),

    (${benchmarkFnSource})(

    // infrastructure powers
    {
      print,
      dedent: (${makeDedent})(),
    },

    // config
    {
    ...${toSource(config, 2)},
    init() {\n${inits.join(';\n')}\n},
    },

    // end async function arguments
    )

    // end Promise.prototype.catch.call(...reverseArgs(handler, promise))
    ))
  `;

  // Dump the script if so requested.
  if (dump) {
    console.log(script);
    return;
  }

  // Write the script to a temp file.
  const tmpDir = mkdtempSync(pathJoin(tmpdir(), 'esbench-'));
  addCleanup(rmSync.bind(undefined, tmpDir, { force: true, recursive: true }));
  const tmpName = pathJoin(tmpDir, 'script.js');
  writeFileSync(tmpName, script, { flush: true });

  // Spawn `eshost $tmpName` with null stdin and direct access to stdout/stderr.
  const doneKit = makePromiseKit();
  const cmd = ['eshost', '--raw', ...(asModule ? ['-m'] : [])];
  const child = spawn(cmd[0], [...cmd.slice(1), ...cmdOptions, tmpName], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  // Don't orphan eshost descendants.
  // https://github.com/bterlson/eshost-cli/issues/94
  const cleanupChild = (child => {
    const { pid: cmdPid } = child;
    const childDone = () => child.exitCode !== null;
    const execOpts = /** @type {const} */ ({ stdio: 'pipe', encoding: 'utf8' });
    const pids = Object.create(null);
    const findPids = () => {
      if (childDone()) return;
      try {
        const stdout = execSync(`pstree -p ${cmdPid}`, execOpts);
        // Prefer the first appearance of each name in output like:
        //   eshost(1000)-+-node(1001)-+-bash(1002)---d8(1003)-+-{d8}(1004)
        //                |            |                       |-{d8}(1005)
        //                |            |                       `-{d8}(1006)
        //                |            |-spidermonkey(1007)
        //                |            `-{node}(1008)
        //                `-{eshost}(1009)
        const descendants = [
          ...stdout.matchAll(/(\w[\w-]*)(?:[^\w-]+)([0-9]+)/g),
        ].slice(1);
        for (const [_, name, pid] of descendants) pids[name] ||= pid;
      } catch (_err) {}
    };
    const findPidsJobID = setTimeout(findPids, 1000);

    const killSubprocesses = () => {
      clearTimeout(findPidsJobID);
      findPids();
      const pidsStr = Object.values(pids).join(' ');
      if (childDone() && !pidsStr) return;
      const killCmds = [
        `kill ${pidsStr} || [ ":${pidsStr}" != : ] && kill -l`,
        `pkill -P ${cmdPid}`,
        `taskkill /pid ${cmdPid} /T /F`,
      ];
      for (const killCmd of killCmds) {
        try {
          execSync(killCmd, execOpts);
          break;
        } catch (_err) {}
      }
    };
    return killSubprocesses;
  })(child);
  addCleanup(cleanupChild);
  /** @type {(err: Error & {code: string}) => void} */
  const onError = err => {
    if (err.code === 'ENOENT') {
      raiseError(`missing required dependency ${cmd[0]}`, EX_NOT_FOUND);
    } else if (err.code === 'EACCES') {
      raiseError(`could not spawn ${cmd[0]}`, EX_NOT_EXECUTABLE);
    } else {
      raiseError(err);
    }
    doneKit.reject(err);
  };
  child.on('error', onError);
  child.on('exit', (exitCode, signal) => {
    process.exitCode ||= exitCode || (signal ? 1 : 0);
    doneKit.resolve(undefined);
  });
  return doneKit.promise;
};

const isEntryPoint = typeof module === 'undefined' || !module.parent;
if (!isEntryPoint) throw Error(`${__filename} is a non-importable script`);
main(argv).catch(raiseError).finally(cleanup);
