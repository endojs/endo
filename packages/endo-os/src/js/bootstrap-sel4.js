// Endo OS — Full Pet Daemon Shell
//
// The daemon IS the terminal.  This implements the core Endo CLI
// command set running on seL4 + QuickJS.
//
// Supported commands (matching the real `endo` CLI):
//
//   EVAL & NAMING
//     eval <js> [name:pet ...]    Evaluate JS with endowments
//     name <n> <js>               Eval and store as pet name (alias for store)
//     list [dir]                  List pet names
//     show <name>                 Print a named value
//     remove <name>               Remove a pet name
//     move <from> <to>            Rename
//     copy <from> <to>            Duplicate
//     mkdir <path>                Make a directory
//     cancel <name>               Cancel/remove a value
//     locate <name>               Show a value's identity
//
//   STORAGE
//     store --text <t> -n <name>  Store text
//     store --json <j> -n <name>  Store JSON
//
//   MESSAGING
//     inbox                       Read messages
//     send <agent> <msg @refs>    Send a message
//     request <desc> [-t agent]   Ask for something
//     resolve <num> <name>        Grant a request
//     reject <num> [reason]       Deny a request
//     adopt <num> <edge> -n <n>   Adopt a value from a message
//     dismiss <num>               Delete a message
//     clear                       Dismiss all messages
//     reply <num> <msg @refs>     Reply to a message
//
//   AGENTS
//     mkhost <handle> [name]      Create a host agent
//     mkguest <handle> [name]     Create a guest agent
//
//   SYSTEM
//     help [command]              Show help
//     where                       Show system info
//     inspect <name>              Show methods of a capability
//     ?                           Quick help
//     status                      Daemon status

(function endoShell() {
  'use strict';

  // ============================================================
  // PET NAME STORE (with directory support)
  // ============================================================

  function makePetStore(name) {
    var entries = Object.create(null);
    return harden({
      _name: name,
      has: function(n) { return n in entries; },
      get: function(n) {
        if (!(n in entries)) throw new Error('Unknown: ' + n);
        return entries[n];
      },
      set: function(n, v) { entries[n] = v; },
      remove: function(n) {
        if (!(n in entries)) throw new Error('Unknown: ' + n);
        delete entries[n];
      },
      list: function() { return Object.keys(entries); },
      entries: function() { return entries; },
    });
  }

  // Resolve a slash-delimited path like "dir/sub/name".
  function resolvePath(store, path) {
    var parts = path.split('/');
    var current = store;
    for (var i = 0; i < parts.length - 1; i++) {
      var val = current.get(parts[i]);
      if (!val || !val.list) {
        throw new Error(parts[i] + ' is not a directory');
      }
      current = val;
    }
    return { store: current, name: parts[parts.length - 1] };
  }

  // ============================================================
  // AGENT SYSTEM
  // ============================================================

  var nextMsgId = 1;

  function makeAgent(name, kind) {
    var petStore = makePetStore(name);
    var messages = [];

    function addMessage(msg) {
      msg.id = nextMsgId++;
      messages.push(msg);
      return msg.id;
    }

    return {
      name: name,
      kind: kind,  // 'host' or 'guest'
      petStore: petStore,
      messages: messages,
      addMessage: addMessage,
      help: function() {
        return kind + ' agent: ' + name;
      },
    };
  }

  // The root host agent — this is "you".
  var currentAgent = makeAgent('host', 'host');
  var agents = Object.create(null);
  agents['host'] = currentAgent;

  // Convenience: get the active pet store.
  function ps() { return currentAgent.petStore; }

  // ============================================================
  // FILESYSTEM CAPABILITY — OCAP STYLE
  //
  // Every entry is a capability object:
  //   - A File has .read(), .write(text), .stat(), .remove()
  //   - A Directory has .list(), .get(name), .mkdir(name),
  //     .makeFile(name, text), .remove()
  //   - .list() returns an array of child capabilities
  //   - You explore by navigating objects, not passing paths
  //
  // Sharing a directory = passing a reference. The recipient
  // can explore children but cannot escape the root — there
  // are no ".." references, and no path strings to manipulate.
  // ============================================================

  function makeFileCap(fullPath, fileName) {
    return harden({
      read: function() {
        return typeof __readFile !== 'undefined' ? __readFile(fullPath) : undefined;
      },
      write: function(text) {
        return typeof __writeFile !== 'undefined' ? __writeFile(fullPath, text) : false;
      },
      stat: function() {
        return typeof __statFile !== 'undefined' ? __statFile(fullPath) : undefined;
      },
      remove: function() {
        return typeof __removeFile !== 'undefined' ? __removeFile(fullPath) : false;
      },
      name: function() { return fileName; },
      help: function() {
        return 'File(' + fileName + '): read(), write(text), stat(), remove()';
      },
      toString: function() { return '[File ' + fileName + ']'; },
    });
  }

  function makeDirCap(rootPath, dirName) {
    // Prevent path traversal.
    function safeName(n) {
      if (!n || n === '.' || n === '..' || n.indexOf('/') >= 0) {
        throw new Error('Invalid name: ' + n);
      }
      return n;
    }

    return harden({
      // list() → array of capability objects (files and subdirs).
      list: function() {
        if (typeof __listDir === 'undefined') return [];
        var entries = __listDir(rootPath) || [];
        var result = [];
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          var childPath = rootPath + '/' + e.name;
          if (e.isDir) {
            result.push(makeDirCap(childPath, e.name));
          } else {
            result.push(makeFileCap(childPath, e.name));
          }
        }
        return result;
      },

      // get(name) → capability for a specific child.
      get: function(childName) {
        safeName(childName);
        var childPath = rootPath + '/' + childName;
        var info = typeof __statFile !== 'undefined' ? __statFile(childPath) : undefined;
        if (!info) return undefined;
        if (info.isDir) return makeDirCap(childPath, childName);
        return makeFileCap(childPath, childName);
      },

      // mkdir(name) → new directory capability.
      mkdir: function(childName) {
        safeName(childName);
        var childPath = rootPath + '/' + childName;
        if (typeof __mkdir !== 'undefined') __mkdir(childPath);
        return makeDirCap(childPath, childName);
      },

      // makeFile(name, text) → new file capability.
      makeFile: function(childName, text) {
        safeName(childName);
        var childPath = rootPath + '/' + childName;
        if (typeof __writeFile !== 'undefined') __writeFile(childPath, text || '');
        return makeFileCap(childPath, childName);
      },

      // stat() → {size, isDir, isFile}
      stat: function() {
        return typeof __statFile !== 'undefined' ? __statFile(rootPath) : undefined;
      },

      // remove() → boolean (removes directory)
      remove: function() {
        return typeof __removeFile !== 'undefined' ? __removeFile(rootPath) : false;
      },

      name: function() { return dirName; },
      help: function() {
        return 'Dir(' + dirName + '): list(), get(name), mkdir(name), makeFile(name, text), stat(), remove()';
      },
      toString: function() { return '[Dir ' + dirName + ']'; },
    });
  }

  // ============================================================
  // NETWORK CAPABILITY — OCAP STYLE
  //
  // Network is a capability you receive, not a global.
  // Listeners produce Connection capabilities.
  // Connections are bidirectional stream capabilities.
  // ============================================================

  function makeConnectionCap(fd) {
    return harden({
      recv: function(max) {
        return __netRecv(fd, max || 4096);
      },
      send: function(data) {
        return __netSend(fd, data);
      },
      close: function() {
        __netClose(fd);
      },
      help: function() {
        return 'Connection: recv([max]), send(data), close()';
      },
      toString: function() { return '[Connection]'; },
    });
  }

  function makeListenerCap(fd) {
    return harden({
      accept: function() {
        var cfd = __netAccept(fd);
        return makeConnectionCap(cfd);
      },
      close: function() {
        __netClose(fd);
      },
      help: function() { return 'Listener: accept(), close()'; },
      toString: function() { return '[Listener]'; },
    });
  }

  function makeNetworkCap() {
    return harden({
      listen: function(port) {
        if (typeof __netListen === 'undefined') throw new Error('No network');
        var fd = __netListen(port || 0);
        return makeListenerCap(fd);
      },
      connect: function(host, port) {
        if (typeof __netConnect === 'undefined') throw new Error('No network');
        var fd = __netConnect(host, port);
        return makeConnectionCap(fd);
      },
      help: function() {
        return 'Network: listen(port), connect(host, port)';
      },
      toString: function() { return '[Network]'; },
    });
  }

  // ============================================================
  // AUTO-CREATE CAPABILITIES FROM CLI/ENV CONFIG
  // ============================================================

  if (typeof __config !== 'undefined') {
    // Mount directories from --mount name=/path or ENDO_MOUNT_name=/path.
    var mountNames = Object.keys(__config.mounts || {});
    for (var i = 0; i < mountNames.length; i++) {
      var mname = mountNames[i];
      var mpath = __config.mounts[mname];
      ps().set(mname, makeDirCap(mpath, mname));
      print('endo-os: Mounted ' + mname + ' → ' + mpath);
    }

    // Create network capability if port specified.
    if (__config.port > 0) {
      ps().set('network', makeNetworkCap());
      print('endo-os: Network capability available');
    }
  }

  // ============================================================
  // BUILT-IN CAPABILITIES
  // ============================================================

  ps().set('counter', (function() {
    var n = 0;
    return harden({
      increment: function() { return ++n; },
      read: function() { return n; },
      help: function() { return 'Counter: increment(), read()'; },
    });
  })());

  ps().set('greeter', harden({
    greet: function(name) { return 'Hello, ' + name + '!'; },
    help: function() { return 'Greeter: greet(name)'; },
  }));

  // ============================================================
  // EVAL WITH ENDOWMENTS
  // ============================================================

  // Parse "codeName:petName" pairs from args.
  function parseEndowments(args) {
    var endowments = { print: print, harden: harden };
    for (var i = 0; i < args.length; i++) {
      var pair = args[i];
      var colonIdx = pair.indexOf(':');
      var codeName, petName;
      if (colonIdx >= 0) {
        codeName = pair.substring(0, colonIdx);
        petName = pair.substring(colonIdx + 1);
      } else {
        codeName = petName = pair;
      }
      if (ps().has(petName)) {
        endowments[codeName] = ps().get(petName);
      }
    }
    return endowments;
  }

  function evalWithEndowments(source, endowmentNames) {
    var endowments = parseEndowments(endowmentNames);
    // Also inject all pet names as endowments by default.
    var names = ps().list();
    for (var i = 0; i < names.length; i++) {
      if (!(names[i] in endowments)) {
        endowments[names[i]] = ps().get(names[i]);
      }
    }

    // Try native Compartment API (QuickJS-ng native-ses).
    try {
      var c = new Compartment({ __options__: true, globals: endowments });
      return c.evaluate(source);
    } catch (e1) {
      // Fall back to plain endowments style.
      try {
        var c2 = new Compartment(endowments);
        return c2.evaluate(source);
      } catch (e2) {
        // Last resort: direct eval with endowment injection via with().
        // This is NOT isolated but at least works.
        var fn = new Function(
          Object.keys(endowments).join(','),
          '"use strict"; return (' + source + ')'
        );
        return fn.apply(undefined, Object.values(endowments));
      }
    }
  }

  // ============================================================
  // MESSAGE REFERENCE PARSING
  // ============================================================

  // Parse @petName and @edgeName:petName from message text.
  function parseMessageRefs(text) {
    var refs = Object.create(null);
    var cleaned = text.replace(/@([a-zA-Z_][a-zA-Z0-9_-]*)(?::([a-zA-Z_][a-zA-Z0-9_-]*))?/g,
      function(match, name1, name2) {
        var edgeName = name2 ? name1 : name1;
        var petName = name2 || name1;
        if (ps().has(petName)) {
          refs[edgeName] = ps().get(petName);
        }
        return '@' + edgeName;
      });
    return { text: cleaned, refs: refs };
  }

  // ============================================================
  // COMMAND ARGUMENT PARSER
  // ============================================================

  function parseArgs(line) {
    var parts = [];
    var current = '';
    var inQuote = false;
    var quoteChar = '';
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQuote) {
        if (ch === quoteChar) { inQuote = false; }
        else { current += ch; }
      } else if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === ' ') {
        if (current.length > 0) { parts.push(current); current = ''; }
      } else {
        current += ch;
      }
    }
    if (current.length > 0) parts.push(current);
    return parts;
  }

  function extractOpt(args, shortFlag, longFlag) {
    for (var i = 0; i < args.length; i++) {
      if (args[i] === shortFlag || args[i] === longFlag) {
        if (i + 1 < args.length) {
          var val = args[i + 1];
          args.splice(i, 2);
          return val;
        }
      }
    }
    return null;
  }

  function hasFlag(args, shortFlag, longFlag) {
    for (var i = 0; i < args.length; i++) {
      if (args[i] === shortFlag || args[i] === longFlag) {
        args.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  // ============================================================
  // COMMANDS
  // ============================================================

  // --- eval ---
  function cmdEval(args) {
    if (args.length === 0) { print('Usage: eval <js> [name:pet ...]'); return; }
    var source = args[0];
    var endowmentNames = args.slice(1);
    try {
      var result = evalWithEndowments(source, endowmentNames);
      if (result !== undefined) {
        print(formatValue(result));
      }
    } catch (e) {
      print('Error: ' + e.message);
    }
  }

  // --- list ---
  function cmdList(args) {
    var store = ps();
    if (args.length > 0) {
      try {
        var resolved = resolvePath(store, args[0]);
        store = resolved.store.get
          ? resolved.store
          : ps().get(args[0]);
        if (!store || !store.list) {
          print(args[0] + ' is not a directory');
          return;
        }
      } catch (e) {
        print(e.message);
        return;
      }
    }
    var names = store.list();
    if (names.length === 0) {
      print('(empty)');
      return;
    }
    for (var i = 0; i < names.length; i++) {
      var val = store.entries()[names[i]];
      var desc = describeValue(val);
      print('  ' + names[i] + '  ' + desc);
    }
  }

  // --- show ---
  function cmdShow(args) {
    if (args.length === 0) { print('Usage: show <name>'); return; }
    try {
      var val = ps().get(args[0]);
      print(formatValue(val));
    } catch (e) { print(e.message); }
  }

  // --- store ---
  function cmdStore(args) {
    var name = extractOpt(args, '-n', '--name');
    var text = extractOpt(args, null, '--text');
    var json = extractOpt(args, null, '--json');
    var bigint = extractOpt(args, null, '--bigint');

    var value;
    if (text !== null) {
      value = text;
    } else if (json !== null) {
      try { value = JSON.parse(json); } catch (e) {
        print('Invalid JSON: ' + e.message); return;
      }
    } else if (bigint !== null) {
      value = BigInt(bigint);
    } else {
      print('Usage: store --text <t> -n <name>');
      print('       store --json <j> -n <name>');
      return;
    }
    if (!name) { print('Missing -n <name>'); return; }
    ps().set(name, value);
    print(name + ' stored');
  }

  // --- name (alias: eval + store) ---
  function cmdName(line) {
    var sp = line.indexOf(' ');
    if (sp < 0) { print('Usage: name <name> <expression>'); return; }
    var name = line.substring(0, sp);
    var expr = line.substring(sp + 1);
    try {
      var value = evalWithEndowments(expr, []);
      ps().set(name, value);
      print(name + ' := ' + formatValue(value));
    } catch (e) { print('Error: ' + e.message); }
  }

  // --- remove ---
  function cmdRemove(args) {
    for (var i = 0; i < args.length; i++) {
      try {
        ps().remove(args[i]);
        print('Removed: ' + args[i]);
      } catch (e) { print(e.message); }
    }
  }

  // --- move ---
  function cmdMove(args) {
    if (args.length < 2) { print('Usage: move <from> <to>'); return; }
    try {
      var val = ps().get(args[0]);
      ps().set(args[1], val);
      ps().remove(args[0]);
      print(args[0] + ' → ' + args[1]);
    } catch (e) { print(e.message); }
  }

  // --- copy ---
  function cmdCopy(args) {
    if (args.length < 2) { print('Usage: copy <from> <to>'); return; }
    try {
      var val = ps().get(args[0]);
      ps().set(args[1], val);
      print(args[0] + ' → ' + args[1] + ' (copy)');
    } catch (e) { print(e.message); }
  }

  // --- mount (create a directory capability from a filesystem path) ---
  function cmdMount(args) {
    if (args.length < 2) {
      print('Usage: mount <name> <path>');
      print('  Creates a directory capability from a host filesystem path.');
      print('  Example: mount project /mnt/host/Documents/my-project');
      return;
    }
    var mname = args[0];
    var mpath = args[1];
    // Verify the path exists.
    if (typeof __statFile !== 'undefined') {
      var info = __statFile(mpath);
      if (!info) {
        print('Path not found: ' + mpath);
        return;
      }
      if (!info.isDir) {
        print('Not a directory: ' + mpath);
        return;
      }
    }
    ps().set(mname, makeDirCap(mpath, mname));
    print('Mounted: ' + mname + ' → ' + mpath);
  }

  // --- mkdir ---
  function cmdMkdir(args) {
    if (args.length === 0) { print('Usage: mkdir <name>'); return; }
    var dir = makePetStore(args[0]);
    ps().set(args[0], dir);
    print('Directory: ' + args[0]);
  }

  // --- cancel ---
  function cmdCancel(args) {
    cmdRemove(args);
  }

  // --- locate ---
  function cmdLocate(args) {
    if (args.length === 0) { print('Usage: locate <name>'); return; }
    try {
      var val = ps().get(args[0]);
      // In the real daemon this returns a locator URI.
      // Here we show the value's type and identity.
      var t = typeof val;
      if (val && typeof val.help === 'function') {
        print('capability:' + args[0] + ' (' + val.help() + ')');
      } else {
        print(t + ':' + args[0]);
      }
    } catch (e) { print(e.message); }
  }

  // --- inspect ---
  function cmdInspect(args) {
    if (args.length === 0) { print('Usage: inspect <name>'); return; }
    try {
      var val = ps().get(args[0]);
      if (typeof val !== 'object' || val === null) {
        print(typeof val + ': ' + String(val));
        return;
      }
      var keys = Object.getOwnPropertyNames(val).filter(
        function(k) { return typeof val[k] === 'function' && k[0] !== '_'; }
      );
      if (keys.length === 0) {
        print('(no methods)');
      } else {
        for (var i = 0; i < keys.length; i++) {
          print('  .' + keys[i] + '()');
        }
      }
    } catch (e) { print(e.message); }
  }

  // ============================================================
  // MESSAGING COMMANDS
  // ============================================================

  // --- inbox ---
  function cmdInbox(args) {
    var msgs = currentAgent.messages;
    if (msgs.length === 0) {
      print('(no messages)');
      return;
    }
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      var prefix = '#' + m.id + ' ';
      if (m.type === 'send') {
        prefix += '[from ' + m.from + '] ';
      } else if (m.type === 'request') {
        prefix += '[request from ' + m.from + '] ';
      } else if (m.type === 'reply') {
        prefix += '[reply from ' + m.from + '] ';
      }
      print(prefix + m.text);
      if (m.refs) {
        var refNames = Object.keys(m.refs);
        if (refNames.length > 0) {
          print('    refs: ' + refNames.map(function(r) {
            return '@' + r;
          }).join(', '));
        }
      }
    }
  }

  // --- send ---
  function cmdSend(rawArgs) {
    var sp = rawArgs.indexOf(' ');
    if (sp < 0) { print('Usage: send <agent> <message with @refs>'); return; }
    var agentName = rawArgs.substring(0, sp);
    var msgText = rawArgs.substring(sp + 1);

    var target = agents[agentName];
    if (!target) { print('Unknown agent: ' + agentName); return; }

    var parsed = parseMessageRefs(msgText);
    target.addMessage({
      type: 'send',
      from: currentAgent.name,
      text: parsed.text,
      refs: parsed.refs,
    });
    print('Sent to ' + agentName);
  }

  // --- request ---
  function cmdRequest(args) {
    var to = extractOpt(args, '-t', '--to') || 'host';
    var name = extractOpt(args, '-n', '--name');
    var desc = args.join(' ');
    if (!desc) { print('Usage: request <description> [-t agent]'); return; }

    var target = agents[to];
    if (!target) { print('Unknown agent: ' + to); return; }

    var msgId = target.addMessage({
      type: 'request',
      from: currentAgent.name,
      text: desc,
      resolved: false,
      resultName: name,
    });
    print('Request #' + msgId + ' sent to ' + to);
    if (name) print('Result will be stored as: ' + name);
  }

  // --- resolve ---
  function cmdResolve(args) {
    if (args.length < 2) { print('Usage: resolve <msg#> <petname>'); return; }
    var msgNum = parseInt(args[0]);
    var petName = args[1];

    var msg = findMessage(msgNum);
    if (!msg) { print('Message #' + msgNum + ' not found'); return; }
    if (msg.type !== 'request') {
      print('Message #' + msgNum + ' is not a request');
      return;
    }

    try {
      var val = ps().get(petName);
      msg.resolved = true;
      msg.resolution = val;

      // If the requester specified a name, store it for them.
      var requester = agents[msg.from];
      if (requester && msg.resultName) {
        requester.petStore.set(msg.resultName, val);
      }

      print('Resolved #' + msgNum + ' with ' + petName);
    } catch (e) { print(e.message); }
  }

  // --- reject ---
  function cmdReject(args) {
    if (args.length < 1) { print('Usage: reject <msg#> [reason]'); return; }
    var msgNum = parseInt(args[0]);
    var reason = args.slice(1).join(' ') || 'rejected';

    var msg = findMessage(msgNum);
    if (!msg) { print('Message #' + msgNum + ' not found'); return; }

    msg.resolved = true;
    msg.rejected = true;
    msg.reason = reason;
    print('Rejected #' + msgNum + ': ' + reason);
  }

  // --- adopt ---
  function cmdAdopt(args) {
    if (args.length < 2) { print('Usage: adopt <msg#> <edge> [-n name]'); return; }
    var msgNum = parseInt(args[0]);
    var edgeName = args[1];
    var saveName = extractOpt(args, '-n', '--name') || edgeName;

    var msg = findMessage(msgNum);
    if (!msg) { print('Message #' + msgNum + ' not found'); return; }
    if (!msg.refs || !(edgeName in msg.refs)) {
      print('No @' + edgeName + ' in message #' + msgNum);
      return;
    }

    ps().set(saveName, msg.refs[edgeName]);
    print('Adopted @' + edgeName + ' as ' + saveName);
  }

  // --- dismiss ---
  function cmdDismiss(args) {
    if (args.length === 0) { print('Usage: dismiss <msg#>'); return; }
    var msgNum = parseInt(args[0]);
    var msgs = currentAgent.messages;
    for (var i = 0; i < msgs.length; i++) {
      if (msgs[i].id === msgNum) {
        msgs.splice(i, 1);
        print('Dismissed #' + msgNum);
        return;
      }
    }
    print('Message #' + msgNum + ' not found');
  }

  // --- clear ---
  function cmdClear() {
    currentAgent.messages.length = 0;
    print('All messages dismissed');
  }

  // --- reply ---
  function cmdReply(rawArgs) {
    var sp = rawArgs.indexOf(' ');
    if (sp < 0) { print('Usage: reply <msg#> <message with @refs>'); return; }
    var msgNum = parseInt(rawArgs.substring(0, sp));
    var msgText = rawArgs.substring(sp + 1);

    var origMsg = findMessage(msgNum);
    if (!origMsg) { print('Message #' + msgNum + ' not found'); return; }

    var target = agents[origMsg.from];
    if (!target) { print('Agent ' + origMsg.from + ' not found'); return; }

    var parsed = parseMessageRefs(msgText);
    target.addMessage({
      type: 'reply',
      from: currentAgent.name,
      inReplyTo: msgNum,
      text: parsed.text,
      refs: parsed.refs,
    });
    print('Replied to #' + msgNum);
  }

  function findMessage(id) {
    var msgs = currentAgent.messages;
    for (var i = 0; i < msgs.length; i++) {
      if (msgs[i].id === id) return msgs[i];
    }
    return null;
  }

  // ============================================================
  // AGENT COMMANDS
  // ============================================================

  // --- mkhost ---
  function cmdMkhost(args) {
    if (args.length === 0) { print('Usage: mkhost <handle> [name]'); return; }
    var handle = args[0];
    var agentName = args[1] || handle;

    var agent = makeAgent(agentName, 'host');
    agents[agentName] = agent;
    ps().set(handle, harden({
      name: agentName,
      kind: 'host',
      send: function(text) {
        var parsed = parseMessageRefs(text);
        agent.addMessage({
          type: 'send', from: currentAgent.name,
          text: parsed.text, refs: parsed.refs,
        });
      },
      help: function() { return 'Host agent: ' + agentName; },
    }));
    print('Created host: ' + agentName + ' (handle: ' + handle + ')');
  }

  // --- mkguest ---
  function cmdMkguest(args) {
    if (args.length === 0) { print('Usage: mkguest <handle> [name]'); return; }
    var handle = args[0];
    var agentName = args[1] || handle;

    var agent = makeAgent(agentName, 'guest');
    agents[agentName] = agent;
    ps().set(handle, harden({
      name: agentName,
      kind: 'guest',
      send: function(text) {
        var parsed = parseMessageRefs(text);
        agent.addMessage({
          type: 'send', from: currentAgent.name,
          text: parsed.text, refs: parsed.refs,
        });
      },
      help: function() { return 'Guest agent: ' + agentName; },
    }));
    print('Created guest: ' + agentName + ' (handle: ' + handle + ')');
  }

  // ============================================================
  // SYSTEM COMMANDS
  // ============================================================

  function cmdWhere() {
    print('Engine:    QuickJS-ng (native lockdown)');
    print('Engine:    QuickJS (ES2023, no JIT)');
    print('Agent:     ' + currentAgent.name + ' (' + currentAgent.kind + ')');
    print('Pet names: ' + ps().list().length);
    print('Messages:  ' + currentAgent.messages.length);
    print('Agents:    ' + Object.keys(agents).join(', '));
    print('Intrinsics: frozen (native C lockdown)');
  }

  function cmdStatus() {
    print('Endo daemon: running');
    print('Status:      running');
    print('Uptime:      since boot');
    print('Agent:       ' + currentAgent.name);
    print('Pet names:   ' + ps().list().length);
    print('Inbox:       ' + currentAgent.messages.length + ' messages');
    print('Agents:      ' + Object.keys(agents).length);
  }

  // ============================================================
  // HELP SYSTEM
  // ============================================================

  var helpText = {
    eval:    'eval <js> [name:pet ...] — Evaluate JavaScript with endowments',
    name:    'name <n> <js> — Evaluate and store as pet name',
    list:    'list [dir] — List pet names (aliases: ls)',
    show:    'show <name> — Print a named value',
    store:   'store --text <t> -n <name> — Store a value',
    remove:  'remove <name> — Remove a pet name (aliases: rm)',
    move:    'move <from> <to> — Rename (aliases: mv)',
    copy:    'copy <from> <to> — Duplicate (aliases: cp)',
    mkdir:   'mkdir <name> — Make a directory',
    locate:  'locate <name> — Show identity of a value',
    inspect: 'inspect <name> — Show capability methods',
    cancel:  'cancel <name> — Cancel/remove a value',
    inbox:   'inbox — Read messages',
    send:    'send <agent> <msg with @refs> — Send a message',
    request: 'request <desc> [-t agent] [-n name] — Ask for something',
    resolve: 'resolve <msg#> <petname> — Grant a request',
    reject:  'reject <msg#> [reason] — Deny a request',
    adopt:   'adopt <msg#> <edge> [-n name] — Adopt from a message',
    dismiss: 'dismiss <msg#> — Delete a message',
    clear:   'clear — Dismiss all messages',
    reply:   'reply <msg#> <msg with @refs> — Reply to a message',
    mkhost:  'mkhost <handle> [name] — Create a host agent',
    mkguest: 'mkguest <handle> [name] — Create a guest agent',
    where:   'where — Show system info',
    status:  'status — Show daemon status',
  };

  function cmdHelp(args) {
    if (args.length > 0 && args[0] in helpText) {
      print(helpText[args[0]]);
      return;
    }
    if (args.length > 0 && ps().has(args[0])) {
      try {
        var val = ps().get(args[0]);
        if (typeof val.help === 'function') {
          print(val.help());
          return;
        }
      } catch (e) { /* fall through */ }
    }

    print('Endo OS — Capability-native operating system');
    print('QuickJS-ng (native lockdown)');
    print('');
    print('Naming:');
    print('  eval <js>                   Evaluate JavaScript');
    print('  name <n> <js>               Eval and name the result');
    print('  list [dir]                  List pet names');
    print('  show <name>                 Print a value');
    print('  remove <name>               Remove a name');
    print('  move <from> <to>            Rename');
    print('  copy <from> <to>            Duplicate');
    print('  mkdir <name>                Make a directory');
    print('  inspect <name>              Show methods');
    print('  mount <name> <path>         Mount a host directory');
    print('');
    print('Storage:');
    print('  store --text <t> -n <name>  Store text');
    print('  store --json <j> -n <name>  Store JSON');
    print('');
    print('Messaging:');
    print('  inbox                       Read messages');
    print('  send <agent> <msg @refs>    Send with capabilities');
    print('  request <desc> [-t agent]   Ask for something');
    print('  resolve <msg#> <name>       Grant a request');
    print('  reject <msg#> [reason]      Deny a request');
    print('  adopt <msg#> <edge> -n <n>  Take from a message');
    print('  dismiss <msg#>              Delete a message');
    print('  reply <msg#> <msg @refs>    Reply');
    print('');
    print('Agents:');
    print('  mkguest <handle> [name]     Create a guest');
    print('  mkhost <handle> [name]      Create a host');
    print('');
    print('System:');
    print('  where / status / help [cmd]');
    print('');
    print('Or just type JavaScript to evaluate it.');
  }

  // ============================================================
  // VALUE FORMATTING
  // ============================================================

  function formatValue(val) {
    if (val === undefined) return 'undefined';
    if (val === null) return 'null';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (typeof val === 'bigint') return String(val) + 'n';
    if (typeof val === 'function') return '[Function: ' + (val.name || 'anonymous') + ']';
    if (typeof val === 'object') {
      if (typeof val.help === 'function') {
        try { return '[' + val.help() + ']'; } catch (e) {}
      }
      if (Array.isArray(val)) {
        return '[' + val.map(formatValue).join(', ') + ']';
      }
      try { return JSON.stringify(val); } catch (e) {}
      return String(val);
    }
    return String(val);
  }

  function describeValue(val) {
    if (val === undefined) return 'undefined';
    if (val === null) return 'null';
    var t = typeof val;
    if (t === 'string') return '"' + (val.length > 30 ? val.substring(0, 30) + '...' : val) + '"';
    if (t === 'number' || t === 'boolean' || t === 'bigint') return String(val);
    if (t === 'function') return '[Function]';
    if (t === 'object') {
      if (typeof val.help === 'function') {
        try { return val.help(); } catch (e) {}
      }
      if (val.list && typeof val.list === 'function') return '[Directory]';
      return '[Object]';
    }
    return t;
  }

  // ============================================================
  // COMMAND DISPATCH
  // ============================================================

  var aliases = {
    ls: 'list', rm: 'remove', mv: 'move', cp: 'copy',
    mk: 'make', host: 'mkhost', guest: 'mkguest',
    js: 'eval', '?': 'help',
  };

  function dispatch(line) {
    line = line.trim();
    if (!line) return;

    // Split first word from rest.
    var spaceIdx = line.indexOf(' ');
    var cmd, rest;
    if (spaceIdx < 0) { cmd = line; rest = ''; }
    else { cmd = line.substring(0, spaceIdx); rest = line.substring(spaceIdx + 1); }

    // Resolve aliases.
    if (cmd in aliases) cmd = aliases[cmd];

    var args = rest.length > 0 ? parseArgs(rest) : [];

    switch (cmd) {
      // Eval & naming
      case 'eval':    cmdEval(args); break;
      case 'name':    cmdName(rest); break;
      case 'list':    cmdList(args); break;
      case 'show':    cmdShow(args); break;
      case 'store':   cmdStore(args); break;
      case 'remove':  cmdRemove(args); break;
      case 'move':    cmdMove(args); break;
      case 'copy':    cmdCopy(args); break;
      case 'mkdir':   cmdMkdir(args); break;
      case 'mount':   cmdMount(args); break;
      case 'cancel':  cmdCancel(args); break;
      case 'locate':  cmdLocate(args); break;
      case 'inspect': cmdInspect(args); break;

      // Messaging
      case 'inbox':   cmdInbox(args); break;
      case 'send':    cmdSend(rest); break;
      case 'request': cmdRequest(args); break;
      case 'resolve': cmdResolve(args); break;
      case 'reject':  cmdReject(args); break;
      case 'adopt':   cmdAdopt(args); break;
      case 'dismiss': cmdDismiss(args); break;
      case 'clear':   cmdClear(); break;
      case 'reply':   cmdReply(rest); break;

      // Agents
      case 'mkhost':  cmdMkhost(args); break;
      case 'mkguest': cmdMkguest(args); break;

      // System
      case 'where':   cmdWhere(); break;
      case 'status':  cmdStatus(); break;
      case 'help':    cmdHelp(args); break;

      default:
        // Not a known command — try evaluating as JS.
        try {
          var result = evalWithEndowments(line, []);
          if (result !== undefined) print(formatValue(result));
        } catch (e) {
          print('Error: ' + e.message);
        }
        break;
    }
  }

  // ============================================================
  // BOOT
  // ============================================================

  // The shell IS the daemon — in-memory pet names, eval,
  // messaging, agents.  No separate daemon bundle needed.

  print('========================================');
  print(' Endo OS');
  print(' Capability-native operating system');
  print(' QuickJS-ng (native lockdown)');
  print(' Daemon: in-memory (pet names + eval + messaging)');
  print('========================================');
  print('');
  print('Type ? for help, or just type JavaScript.');
  print('');

  for (;;) {
    var line = readline('endo> ');
    if (line === undefined) break;
    if (line.length > 0) dispatch(line);
  }

})();
