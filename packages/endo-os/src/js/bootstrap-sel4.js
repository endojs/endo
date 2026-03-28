// Endo OS Shell — the daemon IS the terminal.
//
// A minimal capability shell running on the formally verified
// seL4 kernel.  Provides:
//
//   - Pet name store (name things, look them up)
//   - eval (evaluate JS in a Compartment with named endowments)
//   - Capability objects (hardened, attenuated, delegatable)
//   - Interactive REPL over serial
//
// Commands:
//   eval <js>              Evaluate JavaScript
//   name <name> <js>       Evaluate JS and store result as <name>
//   list                   List all pet names
//   lookup <name>          Show value of a pet name
//   remove <name>          Remove a pet name
//   help [name]            Show help for a capability
//   send <name> <js>       Evaluate JS and call name.receive(result)
//   make <name> <js>       Evaluate a maker function with powers
//   inspect <name>         Show methods of a capability
//   ?                      Show this help
//   quit                   Exit

(function endoShell() {
  'use strict';

  // === Pet Name Store ===
  // The core of the Endo daemon: a mapping from human-readable
  // names to capability objects.

  const store = Object.create(null);

  function petSet(name, value) {
    store[name] = value;
  }

  function petGet(name) {
    if (!(name in store)) throw new Error('Unknown name: ' + name);
    return store[name];
  }

  function petHas(name) {
    return name in store;
  }

  function petList() {
    return Object.keys(store);
  }

  function petRemove(name) {
    delete store[name];
  }

  // === Built-in capabilities ===

  // The counter from Phase 0 — a simple example capability.
  petSet('counter', harden({
    _n: 0,
    increment() { return ++this._n; },
    read() { return this._n; },
    help() { return 'Counter: increment(), read()'; },
  }));

  // A greeter capability — demonstrates delegation.
  petSet('greeter', harden({
    greet(name) { return 'Hello, ' + name + '!'; },
    help() { return 'Greeter: greet(name)'; },
  }));

  // The host powers — what a guest would receive.
  const hostPowers = harden({
    has(name)    { return petHas(name); },
    list()       { return petList(); },
    lookup(name) { return petGet(name); },
    evaluate(source, names) {
      return evalInCompartment(source, names || []);
    },
    store(name, value) { petSet(name, value); },
    remove(name) { petRemove(name); },
    help() {
      return 'Host powers: has(n), list(), lookup(n), evaluate(src, names), store(n, v), remove(n)';
    },
  });
  petSet('host', hostPowers);

  // === Compartment evaluation ===

  function evalInCompartment(source, names) {
    const endowments = { print: print, harden: harden };
    for (const name of names) {
      if (petHas(name)) {
        endowments[name] = petGet(name);
      }
    }
    const c = new Compartment(endowments);
    return c.evaluate(source);
  }

  // === Command parser ===

  function parseCommand(line) {
    line = line.trim();
    if (!line) return null;

    const spaceIdx = line.indexOf(' ');
    if (spaceIdx < 0) return { cmd: line, args: '' };
    return {
      cmd: line.substring(0, spaceIdx),
      args: line.substring(spaceIdx + 1).trim(),
    };
  }

  // === Command handlers ===

  function cmdEval(args) {
    try {
      const result = evalInCompartment(args, petList());
      if (result !== undefined) {
        print(String(result));
      }
    } catch (e) {
      print('Error: ' + e.message);
    }
  }

  function cmdName(args) {
    const sp = args.indexOf(' ');
    if (sp < 0) { print('Usage: name <name> <expression>'); return; }
    const name = args.substring(0, sp);
    const expr = args.substring(sp + 1);
    try {
      const value = evalInCompartment(expr, petList());
      petSet(name, value);
      print(name + ' := ' + String(value));
    } catch (e) {
      print('Error: ' + e.message);
    }
  }

  function cmdList() {
    const names = petList();
    if (names.length === 0) {
      print('(no pet names)');
    } else {
      for (const name of names) {
        const val = store[name];
        const type = typeof val;
        let desc = type;
        if (val && typeof val.help === 'function') {
          try { desc = val.help(); } catch (e) { /* ignore */ }
        } else if (type === 'object') {
          desc = 'Object';
        }
        print('  ' + name + ' — ' + desc);
      }
    }
  }

  function cmdLookup(name) {
    if (!name) { print('Usage: lookup <name>'); return; }
    try {
      const val = petGet(name);
      print(String(val));
    } catch (e) {
      print(e.message);
    }
  }

  function cmdInspect(name) {
    if (!name) { print('Usage: inspect <name>'); return; }
    try {
      const val = petGet(name);
      if (typeof val !== 'object' || val === null) {
        print(typeof val + ': ' + String(val));
        return;
      }
      const keys = Object.getOwnPropertyNames(val).filter(
        function(k) { return typeof val[k] === 'function'; }
      );
      if (keys.length === 0) {
        print('(no methods)');
      } else {
        print('Methods:');
        for (const k of keys) {
          print('  ' + k + '()');
        }
      }
    } catch (e) {
      print(e.message);
    }
  }

  function cmdHelp(name) {
    if (name) {
      try {
        const val = petGet(name);
        if (val && typeof val.help === 'function') {
          print(val.help());
        } else {
          print(name + ': no help() method');
        }
      } catch (e) {
        print(e.message);
      }
      return;
    }

    print('Endo OS Shell — Capability-native operating system');
    print('Running on seL4 (formally verified kernel)');
    print('');
    print('Commands:');
    print('  eval <js>          Evaluate JavaScript expression');
    print('  name <n> <js>      Store eval result as pet name');
    print('  list               List all pet names');
    print('  lookup <name>      Show value of a name');
    print('  inspect <name>     Show methods of a capability');
    print('  remove <name>      Remove a pet name');
    print('  help [name]        Show help (or capability help)');
    print('  make <n> <js>      Create capability with host powers');
    print('  ?                  This help');
    print('');
    print('Examples:');
    print('  eval 1 + 1');
    print('  eval counter.increment()');
    print('  name x 42');
    print('  eval greeter.greet("World")');
    print('  name adder harden({add(a,b){return a+b},help(){return "add(a,b)"}})');
    print('  eval adder.add(2, 3)');
  }

  function cmdMake(args) {
    const sp = args.indexOf(' ');
    if (sp < 0) { print('Usage: make <name> <expression>'); return; }
    const name = args.substring(0, sp);
    const expr = args.substring(sp + 1);
    try {
      // Evaluate with host powers available.
      const endowments = {
        print: print,
        harden: harden,
        host: hostPowers,
      };
      // Also inject all existing names.
      for (const n of petList()) {
        endowments[n] = store[n];
      }
      const c = new Compartment(endowments);
      const value = c.evaluate(expr);
      petSet(name, value);
      print(name + ' created');
    } catch (e) {
      print('Error: ' + e.message);
    }
  }

  function cmdRemove(name) {
    if (!name) { print('Usage: remove <name>'); return; }
    if (petHas(name)) {
      petRemove(name);
      print('Removed: ' + name);
    } else {
      print('Not found: ' + name);
    }
  }

  // === REPL ===

  function dispatch(line) {
    const parsed = parseCommand(line);
    if (!parsed) return;

    switch (parsed.cmd) {
      case 'eval':    cmdEval(parsed.args); break;
      case 'name':    cmdName(parsed.args); break;
      case 'list':    cmdList(); break;
      case 'lookup':  cmdLookup(parsed.args); break;
      case 'inspect': cmdInspect(parsed.args); break;
      case 'help':    cmdHelp(parsed.args); break;
      case 'make':    cmdMake(parsed.args); break;
      case 'remove':  cmdRemove(parsed.args); break;
      case '?':       cmdHelp(''); break;
      case 'quit':
      case 'exit':
        print('Endo OS does not exit. Capabilities all the way down.');
        break;
      default:
        // If it doesn't match a command, try evaluating as JS.
        cmdEval(line);
        break;
    }
  }

  // === Boot ===

  print('========================================');
  print(' Endo OS');
  print(' Capability-native operating system');
  print(' seL4 (formally verified) + QuickJS');
  print('========================================');
  print('');
  print('Type ? for help, or just type JavaScript.');
  print('');

  // Main loop — readline() reads from serial UART.
  for (;;) {
    var line = readline('endo> ');
    if (line === undefined) break;
    if (line.length > 0) {
      dispatch(line);
    }
  }

})();
