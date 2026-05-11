# @endo/familiar

TODO what is this

## Development

### Quick Start

```bash
cd packages/familiar
yarn build
yarn dev
```

### Electron Install Problems

If you get:
```
/home/user/endo/node_modules/electron/index.js:17
    throw new Error('Electron failed to install correctly, please delete node_modules/electron and try installing again');
    ^
```

```bash
cd packages/familiar
yarn allow-scripts run
```

### Unix Socket Leftovers

If you ungloriously stop the electron app, say with `SIGINT`, you may see this at next start:
```
[🐈‍⬛ Familiar] Starting...
[🐈‍⬛ Familiar] Dev mode: true
[Familiar] Starting Endo daemon...
[🐈‍⬛ Familiar] Fatal error: Error: listen EADDRINUSE: address already in use /run/user/1000/endo/captp0.sock
    at ChildProcess.<anonymous> (file:///home/jcorbin/endo/packages/familiar/src/daemon-manager.js:188:18)
    at ChildProcess.emit (node:events:518:28)
    at emit (node:internal/child_process:950:14)
    at process.processTicksAndRejections (node:internal/process/task_queues:83:21)
```

A swift `rm /run/user/1000/endo/captp0.sock` shall get you back in business.

**NOTE**: your value of `XDG_RUNTIME_DIR=/run/user/1000` may be different
