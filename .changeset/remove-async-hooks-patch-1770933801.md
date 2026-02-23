---
'@endo/init': patch
---

Move async_hooks patch to dedicated entrypoint for Node.js 24 compatibility

The async_hooks patch was originally added in #1115 to address debugger issues (#1105) for local debugging of Node.js processes in lockdown mode. However, the patch is breaking in Node.js 24, and it's unclear whether it's still necessary in Node.js 20+.

To maintain backward compatibility while fixing the Node.js 24 breakage, the patch has been moved from the default import path to a new dedicated entrypoint `@endo/init/debug-async-hooks.js`. This allows users who need the async_hooks patch for debugging in older Node.js versions to opt-in explicitly, while preventing breakage for users on Node.js 24+.

If you were relying on the async_hooks patch, import `@endo/init/debug-async-hooks.js` instead of `@endo/init/debug.js`. Note that this entrypoint may not work correctly in Node.js 24+.
