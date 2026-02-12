---
'@endo/init': patch
---

Remove async_hooks patch for Node.js compatibility

The async_hooks patch was originally added in #1115 to address debugger issues (#1105) for local debugging of Node.js processes in lockdown mode. However, the patch is breaking in Node.js 24, and it's unclear whether it's still necessary in Node.js 20+. Since Node.js's inspector support has stopped relying on async_hooks, we're removing the patch. If it turns out to be still necessary, we'll restore the functionality in a new way that is compatible with Node.js 24.
