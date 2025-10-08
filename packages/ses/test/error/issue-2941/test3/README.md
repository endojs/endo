# Same error, different presentation

If relevant, first `yarn build` in the ancestral `ses` directory above.

---
## `errorTrapping: 'platform'`

```
$ node error-trapping-platform.demo.js
SES_UNCAUGHT_EXCEPTION: (Error#1)
Error#1: que?
  at packages/ses/test/error/issue-2941/test3/error-trapping-platform.demo.js:12:9

Error#1 cause: (Error#2)
Nested error under Error#1
  Error#2: karramba
    at packages/ses/test/error/issue-2941/test3/error-trapping-platform.demo.js:10:9
```

---
## `errorTrapping: 'platform', errorTaming: 'safe'`

```
$ node error-trapping-platform-safe.demo.js
SES_UNCAUGHT_EXCEPTION: (Error#1)
Error#1: que?

  at packages/ses/test/error/issue-2941/test3/error-trapping-platform-safe.demo.js:12:9

Error#1 cause: (Error#2)
Nested error under Error#1
  Error#2: karramba

    at packages/ses/test/error/issue-2941/test3/error-trapping-platform-safe.demo.js:10:9
```

---

## `errorTrapping: 'none'`

```
$ node error-trapping-none.demo.js
file:///Users/markmiller/src/ongithub/endojs/endo/packages/ses/test/error/issue-2941/test3/error-trapping-none.demo.js:12
  throw Error('que?', { cause: e });
        ^

[Error: que?
  at packages/ses/test/error/issue-2941/test3/error-trapping-none.demo.js:12:9] {
  [cause]: [Error: karramba
    at packages/ses/test/error/issue-2941/test3/error-trapping-none.demo.js:10:9]
}

Node.js v22.16.0
```

---

## SES without lockdown

```
$ node error-trapping-no-lockdown.demo.js
file:///Users/markmiller/src/ongithub/endojs/endo/packages/ses/test/error/issue-2941/test3/error-trapping-no-lockdown.demo.js:6
  throw Error('que?', { cause: e });
        ^

Error: que?
    at file:///Users/markmiller/src/ongithub/endojs/endo/packages/ses/test/error/issue-2941/test3/error-trapping-no-lockdown.demo.js:6:9
    at ModuleJob.run (node:internal/modules/esm/module_job:274:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:644:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5) {
  [cause]: Error: karramba
      at file:///Users/markmiller/src/ongithub/endojs/endo/packages/ses/test/error/issue-2941/test3/error-trapping-no-lockdown.demo.js:4:9
      at ModuleJob.run (node:internal/modules/esm/module_job:274:25)
      at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:644:26)
      at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)
}

Node.js v22.16.0
```
