# Repro multiline error

When a multiline message is thrown in Node.js, SES will print all lines of the message, except first, twice.

The problem goes away when `errorTrapping: "none"` is added to lockdown options

If relevant, first `yarn build` in the ancestral `ses` directory above.

---
## `errorTrapping: 'platform'`

```
$ node error-trapping-platform.demo.js
SES_UNCAUGHT_EXCEPTION: (Error#1)
Error#1: Does this place have an
  echo?

  echo?

  at packages/ses/test/error/issue-2941/test2/error-trapping-platform.demo.js:9:7
```

---
## `errorTrapping: 'platform', errorTaming: 'safe'`

```
$ node error-trapping-platform-safe.demo.js
SES_UNCAUGHT_EXCEPTION: (Error#1)
Error#1: Does this place have an
  echo?


  at packages/ses/test/error/issue-2941/test2/error-trapping-platform-safe.demo.js:9:7
```

---

## `errorTrapping: 'none'`

```
$ node error-trapping-none.demo.js
file:///Users/markmiller/src/ongithub/endojs/endo/packages/ses/test/error/issue-2941/test2/error-trapping-none.demo.js:9
throw Error(`Does this place have an
      ^

[Error: Does this place have an
  echo?

  at packages/ses/test/error/issue-2941/test2/error-trapping-none.demo.js:9:7]

Node.js v22.16.0
```
