# repro

When a multiline message is thrown in Node.js, SES will print all lines of the message, except first, twice.

The problem goes away when `errorTrapping: "none"` is added to lockdown options

```
$ node index.js
SES_UNCAUGHT_EXCEPTION: (Error#1)
Error#1: Does this place have an
  echo?
  
  echo?
  
  at Object.<anonymous> (/.../test2/index.js:7:7)
  at Module._compile (node:internal/modules/cjs/loader:1730:14)
  at Object..js (node:internal/modules/cjs/loader:1895:10)
  at Module.load (node:internal/modules/cjs/loader:1465:32)
  at Function._load (node:internal/modules/cjs/loader:1282:12)
  at TracingChannel.traceSync (node:diagnostics_channel:322:14)
  at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
  at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)
  at node:internal/main/run_main_module:36:49
```