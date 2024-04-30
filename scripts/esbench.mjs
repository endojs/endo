#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
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
    Code to execute once, before anything else (including setup, which runs once
    per measurement iteration).
    Each use extends initialization code.
    Example: --init 'import "/path/to/module.js";'
    Example: --init-file \\
      <(npx rollup -p @rollup/plugin-node-resolve -i /path/to/module.js -f iife)

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

const makePromiseKit = () => {
  let resolve, reject;
  const promise = new Promise((...fns) => ([resolve, reject] = fns));
  return { promise, resolve, reject };
};

const parseNumber = str => (/[0-9]/.test(str || '') ? Number(str) : NaN);

const q = str => JSON.stringify(str);

const toSource = (value, space) =>
  JSON.stringify(value, undefined, space)
    // Escape "{" in strings, replace "__proto__" with a computed property,
    // and make all objects null-prototype (ensuring that absent fields are
    // undefined).
    .replaceAll(/"(\\.|[^\\"])*"/gs, s => s.replaceAll('{', '\\x7B'))
    .replaceAll('"__proto__":', '["__proto__"]:')
    .replaceAll('{', '{__proto__: null,');

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
      cleanups.unshift(callback);
    },
    cleanup: async () => {
      const settlements = await Promise.allSettled(
        cleanups.map(async callback => callback()),
      );
      for (const { status, reason } of settlements) {
        if (status !== 'fulfilled') raiseError(reason);
      }
    },
  };
})();

const CMD_OPTION_NAMES = [
  '--host',
  '-h',
  '--hostGroup',
  '-g',
  '--options',
  '-o',
];
const INIT_OPTION_NAMES = ['--init', '-i', '--init-file', '-f'];

const parseArgs = (argv, fail) => {
  // DEFAULT VALUES

  let dump = false;
  let cmdOptions = [];
  let awaitSnippets = undefined;
  let budget = 10;
  let asModule = false;
  let inits = [];
  let args = Object.create(null);
  let scalingArg;
  let setups = [];
  let snippets = Object.create(null);

  // HELPERS

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
      // If every value is a normal-looking numeric string with no
      // unnecessary leading whitespace or zero, try promoting them all
      // to actual numbers.
      const numberValues = values.map(v =>
        /^-?(?:[1-9]|0[^0-9]|0$|[.])/.test(v) ? parseNumber(v) : NaN,
      );
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
    const { code, label = code } =
      def.match(snippetPatt)?.groups || fail(`bad snippet ${def}`);
    !(label in snippets) || fail(`duplicate snippet label ${q(label)}`);
    snippets[label] = code === '-' ? readStdin() : code;
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
      return { help: true };
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
      }
      inits.push(code);
    } else if (opt === '--arg' || opt === '-a') {
      const def = takeValue();
      !def.includes('\\') ||
        fail(
          `for future extensibility, ${opt} values may not include backslash`,
        );
      pushArg(opt, def);
    } else if (opt === '--setup' || opt === '-s') {
      const setup = takeValue();
      try {
        Function(setup);
      } catch (_err) {
        fail(`syntax error in setup ${setup}`);
      }
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
    dump,
    cmdOptions,
    awaitSnippets,
    // Convert seconds to milliseconds.
    budget: budget * 1000,
    asModule,
    inits,
    args,
    scalingArg,
    setups,
    snippets,
  };
};

const main = async argv => {
  const failArg = (msg, usage = USAGE.replace(/\n {3}.*/g, '')) => {
    process.exitCode = EX_USAGE;
    throw makeSimpleError(`${msg}\n\n${usage}`);
  };
  const {
    help,
    dump,
    cmdOptions,
    awaitSnippets,
    budget,
    asModule,
    inits,
    args,
    scalingArg,
    setups,
    snippets,
  } = parseArgs(argv, failArg);
  if (help) {
    console.log(USAGE);
    process.exitCode = EX_USAGE;
    return;
  } else if (Object.keys(snippets).length === 0) {
    failArg('at least one snippet is required');
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
  // makeDedent robustly makes a dedent function from primordials.
  function makeDedent() {
    const { call } = Function.prototype;
    const join = call.bind(Array.prototype.join);
    const push = call.bind(Array.prototype.push);
    const exec = call.bind(RegExp.prototype.exec);
    const replace = call.bind(String.prototype.replace);
    const split = call.bind(String.prototype.split);
    const dedent = (strings, ...subs) => {
      const parts = [];
      for (let rIndent, i = 0; i < strings.length; i += 1) {
        if (i > 0) push(parts, '' + subs[i - 1]);

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
            const m = exec(/\S/, line) || (!more && { index: line.length });
            if (m) rIndent = RegExp(replace('^\\s{1,n}', 'n', m.index));
          }

          // Skip an isolated initial line feed in strings[0].
          push(parts, i > 0 || j > start ? '\n' : '');
          push(parts, rIndent ? replace(line, rIndent, '') : line);
        }
      }
      return join(parts, '');
    };
    return dedent;
  }
  const dedent = makeDedent();
  const scriptAsFn = async (
    config,
    infrastructure,
    // Bindings whose names should have been keywords.
    [undefined, Infinity, NaN] = [void 0, 1 / 0, +'NaN'],
  ) => {
    // Capture primordials to be robust against manipulation in init/setup/etc.
    // This is probably paranoid, but we *do* want to benchmark shims/polyfills/etc.
    const { print, Array, Function, RegExp } = infrastructure;
    const AsyncFunction = Function(
      'try { return (async () => {}).constructor; } catch (_err) {}',
    )();
    const { now } = Date;
    const { stringify } = JSON;
    const { ceil, floor, max, min, random } = Math;
    const { isFinite } = Number;
    const { entries, keys, values } = Object;
    const { apply, construct, ownKeys } = Reflect;
    const { raw } = String;
    // Avoid Object.fromEntries, which reads its argument as an iterable and is
    // therefore susceptible to replacement of Array.prototype[Symbol.iterator].
    const assignEntries = (entries, obj = {}) => {
      for (let i = 0; i < entries.length; i += 1) {
        obj[entries[i][0]] = entries[i][1];
      }
      return obj;
    };
    const freeMethods = ({ prototype: proto }) => {
      const discardOrGenerateEntry = name => {
        try {
          return [[name, Function.prototype.call.bind(proto[name])]];
        } catch (_err) {
          return [];
        }
      };
      return assignEntries(ownKeys(proto).flatMap(discardOrGenerateEntry));
    };
    const {
      indexOf,
      fill,
      filter,
      flatMap,
      forEach,
      join,
      map,
      push,
      slice,
      sort,
      unshift,
    } = freeMethods(Array);
    const { toString: numberToString } = freeMethods(Number);
    const { repeat, replace, split, slice: stringSlice } = freeMethods(String);
    const { exec } = freeMethods(RegExp);

    const { awaitSnippets, budget, init, args, scalingArg, setup, snippets } =
      config;
    const randomHex = byteLen => {
      let s = replace(numberToString(random(), 16), /0?\W/g, '') || '0';
      if (s.length < byteLen * 2) s += randomHex(byteLen - (s.length >> 1));
      return stringSlice(s, 0, byteLen * 2);
    };
    const { r = randomHex(16) } = config;

    // dummy is an object with no extractable properties.
    const dummy = Object.freeze(Object.create(null));
    // dedent with String.raw is safe but incorrect.
    const {
      dedent = (strings, ...subs) =>
        apply(raw, undefined, prepended(subs, { raw: strings })),
    } = infrastructure;
    // prepended(arr, ...items) returns [...items, ...arr].
    const prepended = (arr, ...items) => {
      const arr2 = slice(arr);
      for (let i = items.length - 1; i >= 0; i -= 1) unshift(arr2, items[i]);
      return arr2;
    };
    const appended = (arr, ...items) => {
      const arr2 = slice(arr);
      for (let i = 0; i < items.length; i += 1) push(arr2, items[i]);
      return arr2;
    };
    // ifEmpty maps a nonempty array to itself and an empty array to a substitute.
    const ifEmpty = (arr, sub) => (arr.length === 0 ? sub : arr);
    // crossJoin returns the Cartesian product of input arrays (replacing an empty
    // input with [undefined]) as an array of arrays.
    const crossJoin = arrays => {
      if (arrays.length === 0) return [];
      const arr0 = ifEmpty(arrays[0], [undefined]);
      const rest = slice(arrays, 1);
      const suffixes = ifEmpty(crossJoin(rest), [[]]);
      return flatMap(arr0, val => map(suffixes, rest => prepended(rest, val)));
    };
    // shuffle performs an in-place Fisher-Yates shuffle.
    const shuffle = arr =>
      forEach(arr, (v, i, arr) => {
        const j = i + floor(random() * (arr.length - i));
        arr[i] = arr[j];
        arr[j] = v;
      });

    init();

    const nonScalingArgs = assignEntries(
      filter(entries(args), ([name, _arr]) => name !== scalingArg),
    );
    // makeTimer returns a function that reports metrics for a single execution of
    // repeated code.
    const makeTimer = (code, data) => {
      data.i += 1;
      const { i, n } = data;
      // Suffix embedded binding names to make them unguessable and
      // collision-resistant against input and unique against runtime
      // compilation optimizations.
      const v = { now: '', dummy: '', i: '', t0: '', t1: '', tF: '' };
      forEach(entries(v), ([name]) => (v[name] = join([name, r, i], '_')));
      let ctor = Function;
      let repeatable = code + ';';
      let hideFromCode = values(v);
      if (awaitSnippets === true) {
        ctor = AsyncFunction;
        if (!ctor) throw 'Error: missing AsyncFunction constructor!';
        repeatable = 'await (' + code + ');';
      } else if (awaitSnippets === undefined && AsyncFunction) {
        ctor = AsyncFunction;
        repeatable =
          code +
          `; if (typeof (result || ${v.dummy}).then === 'function') await result;`;
        hideFromCode = flatMap(entries(v), ([k, as]) =>
          k === 'dummy' ? [] : [as],
        );
      }
      // To avoid a size explosion, limit the repeated code to 1000 instances
      // inside a loop body plus a literal remainder.
      const R = n => fill(Array(n), repeatable);
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
      // A scale argument is always present, but might not be named.
      const ctorArgs = keys(nonScalingArgs);
      if (scalingArg !== undefined) push(ctorArgs, scalingArg);
      // Shadow `arguments` to avoid leaking infrastructure details.
      push(ctorArgs, '...arguments');
      const body = dedent`
        const { now: ${v.now}, dummy: ${v.dummy} } =
          arguments[arguments.length - 1];
        arguments.length = 0;
        let ${v.i}, result;

        // --setup
        ${setup};

        // Find a clock edge, then measure n snippet repetitions.
        const ${v.t0} = ${v.now}();
        let ${v.t1} = ${v.t0};
        for (; ${v.t1} === ${v.t0}; ${v.t1} = ${v.now}());
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
            map(entries(v), ([k, as]) => k + ': ' + as),
            ',\n  ',
          )},
        };
      `;
      push(ctorArgs, body);
      const inner = construct(ctor, ctorArgs);
      // The final item in `args` must supply the `now` function used
      // for getting current time in milliseconds.
      return async args => {
        const { now: nowIn } = args[args.length - 1];
        const result = await apply(inner, undefined, args);
        const { now: nowOut, t0, t1, tF } = result;
        if (nowOut !== nowIn) throw 'Error: early return ' + stringify(result);
        return { duration: tF - t1, resolution: t1 - t0 };
      };
    };

    const dataByLabel = {};
    const sample = async (label, code, budget, args) => {
      const data = (dataByLabel[label] ||= { i: 0, n: 1 });
      const fullArgs = appended(args, { now, dummy });

      // Make a timer function with repetition count tuned to foster
      // durations of (30 +/- 20) increments of timer resolution.
      let timer,
        duration,
        resolution = Infinity;
      for (let a = 1, b = Infinity, n = data.n; ; n = max(a, min(n, b))) {
        data.n = n;
        timer = makeTimer(code, data);
        const firstData = await timer(fullArgs);
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
        const { duration } = await timer(fullArgs);
        samples.push(duration);
        totalDuration += duration;
      }
      return { n: data.n, totalDuration, samples };
    };

    // For each non-final scaling value and each combination of non-scaling
    // arguments, collect samples from the snippets in random order.
    const argCombos = ifEmpty(crossJoin(values(nonScalingArgs)), [[]]);
    const snippetEntries = entries(snippets);
    const snippetOrder = assignEntries(
      map(snippetEntries, ([label], i) => [label, i]),
    );
    const liveSnippetsForCombo = map(argCombos, () => keys(snippetOrder));
    const scaling = scalingArg !== undefined ? args[scalingArg] : { max: 0 };
    const maxScale = isFinite(scaling.max) ? scaling.max : Infinity;
    for (let C = argCombos.length, scale = 0; scale <= maxScale; scale += 1) {
      for (let i = 0; i < argCombos.length; i += 1) {
        if (!liveSnippetsForCombo[i]) continue;
        shuffle(snippetEntries);
        const output = [];
        for (let j = 0; j < snippetEntries.length; j += 1) {
          const [label, code] = snippetEntries[j];
          const k = indexOf(liveSnippetsForCombo[i], label);
          if (k < 0) continue;
          const resolvedArgs = appended(argCombos[i], scale);
          const data = await sample(label, code, budget, resolvedArgs);
          const { n, totalDuration, samples } = data;
          push(output, {
            label,
            i: snippetOrder[label],
            data,
            line: `${label} (${stringSlice(stringify(resolvedArgs), 1, -1)}) ${
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
  };
  const scriptFnSource = dedent(['  ' + scriptAsFn.toString()]);
  const script = dedent`
    (${scriptFnSource})(

    // config
    {
    ...${toSource(config, 2)},
    init() {\n${inits.join(';\n')}\n},
    },

    // infrastructure
    {
      ...{ print, Array, Function, RegExp },
      dedent: (${makeDedent})(),
    },

    )
  `;

  // Dump the script if so requested.
  if (dump) {
    console.log(script);
    return;
  }

  // Write the script to a temp file.
  const tmpDir = mkdtempSync(pathJoin(tmpdir(), 'esbench-'));
  addCleanup(() => rmSync(tmpDir, { force: true, recursive: true }));
  const tmpName = pathJoin(tmpDir, 'script.js');
  writeFileSync(tmpName, script, { flush: true });

  // Spawn `eshost $tmpName` with null stdin and direct access to stdout/stderr.
  const doneKit = makePromiseKit();
  const cmd = ['eshost', '--raw', ...(asModule ? ['-m'] : [])];
  const child = spawn(cmd[0], [...cmd.slice(1), ...cmdOptions, tmpName], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('error', err => {
    if (err.code === 'ENOENT') {
      raiseError(`missing required dependency ${cmd}`, EX_NOT_FOUND);
    } else if (err.code === 'EACCES') {
      raiseError(`could not spawn ${cmd}`, EX_NOT_EXECUTABLE);
    } else {
      raiseError(err);
    }
    doneKit.reject(err);
  });
  child.on('exit', (exitCode, signal) => {
    process.exitCode ||= exitCode || (signal ? 1 : 0);
    doneKit.resolve();
  });
  return doneKit.promise;
};

const isEntryPoint = typeof module === 'undefined' || !module.parent;
if (!isEntryPoint) throw Error(`${__filename} is a non-importable script`);
main(argv).catch(raiseError).finally(cleanup);
