Same error, different presentation

naugtur@localhoist$ node a
SES_UNCAUGHT_EXCEPTION: (Error#1)
Error#1: que?
  at Object.<anonymous> (/.../test3/a.js:9:9)
  at Module._compile (node:internal/modules/cjs/loader:1730:14)
  at Object..js (node:internal/modules/cjs/loader:1895:10)
  at Module.load (node:internal/modules/cjs/loader:1465:32)
  at Function._load (node:internal/modules/cjs/loader:1282:12)
  at TracingChannel.traceSync (node:diagnostics_channel:322:14)
  at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
  at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)
  at node:internal/main/run_main_module:36:49

Error#1 cause: (Error#2)
Nested error under Error#1
  Error#2: karramba
    at Object.<anonymous> (/.../test3/a.js:7:9)
    at Module._compile (node:internal/modules/cjs/loader:1730:14)
    at Object..js (node:internal/modules/cjs/loader:1895:10)
    at Module.load (node:internal/modules/cjs/loader:1465:32)
    at Function._load (node:internal/modules/cjs/loader:1282:12)
    at TracingChannel.traceSync (node:diagnostics_channel:322:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)
    at node:internal/main/run_main_module:36:49
  
naugtur@localhoist$ node b
/.../test3/b.js:10
  throw Error("que?", { cause: e });
  ^

[Error: que?
  at Object.<anonymous> (/.../test3/b.js:10:9)
  at Module._compile (node:internal/modules/cjs/loader:1730:14)
  at Object..js (node:internal/modules/cjs/loader:1895:10)
  at Module.load (node:internal/modules/cjs/loader:1465:32)
  at Function._load (node:internal/modules/cjs/loader:1282:12)
  at TracingChannel.traceSync (node:diagnostics_channel:322:14)
  at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
  at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)
  at node:internal/main/run_main_module:36:49] {
  [cause]: [Error: karramba
    at Object.<anonymous> (/.../test3/b.js:8:9)
    at Module._compile (node:internal/modules/cjs/loader:1730:14)
    at Object..js (node:internal/modules/cjs/loader:1895:10)
    at Module.load (node:internal/modules/cjs/loader:1465:32)
    at Function._load (node:internal/modules/cjs/loader:1282:12)
    at TracingChannel.traceSync (node:diagnostics_channel:322:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)
    at node:internal/main/run_main_module:36:49]
}

Node.js v22.17.0
naugtur@localhoist$ node c
/.../test3/c.js:5
  throw Error("que?", { cause: e });
  ^

Error: que?
    at Object.<anonymous> (/.../test3/c.js:5:9)
    at Module._compile (node:internal/modules/cjs/loader:1730:14)
    ... 6 lines matching cause stack trace ...
    at node:internal/main/run_main_module:36:49 {
  [cause]: Error: karramba
      at Object.<anonymous> (/.../test3/c.js:3:9)
      at Module._compile (node:internal/modules/cjs/loader:1730:14)
      at Object..js (node:internal/modules/cjs/loader:1895:10)
      at Module.load (node:internal/modules/cjs/loader:1465:32)
      at Function._load (node:internal/modules/cjs/loader:1282:12)
      at TracingChannel.traceSync (node:diagnostics_channel:322:14)
      at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
      at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)
      at node:internal/main/run_main_module:36:49
}

Node.js v22.17.0