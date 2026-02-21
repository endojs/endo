# @endo/chat

A web-based chat application for the Endo daemon, providing a permission management UI for the pet daemon.

## Overview

This package extracts the chat functionality from `packages/cli/demo/cat.js` into a standalone Vite-based application that connects to an Endo daemon via a gateway WebSocket interface.

## Features

- **Inbox**: View and manage incoming messages and requests
- **Inventory**: Browse and manage pet names (capabilities)
- **Chat**: Send messages with capability references to other guests
- **Eval**: Evaluate JavaScript expressions with pet name endowments

## Development

### Quick Start

```bash
yarn dev
```

That's it! The application will be available at `http://localhost:5173`.

The Vite Endo plugin:
1. Ensures the system Endo daemon is running (using this repo's CLI)
2. Starts a gateway server for WebSocket access
3. Injects connection parameters (`ENDO_PORT`, `ENDO_ID`) into the app

### Using the System Daemon

The development server uses your system's Endo daemon (at `~/.local/state/endo/`), which means:

- You can use the Endo CLI for debugging: `endo inbox`, `endo list`, etc.
- State persists across dev server restarts
- Changes made via CLI are reflected in the UI

### Building for Production

```bash
yarn build
```

The built files will be in the `dist/` directory.

For production deployment, you'll need to:
1. Run an Endo daemon with a gateway or proxy
2. Configure the app to connect to that gateway

## Architecture

The chat application connects to the Endo daemon through the following flow:

1. **Vite Plugin**: Ensures daemon is running, starts gateway server
2. **Gateway Server**: Connects to daemon via Unix socket, exposes WebSocket
3. **WebSocket Connection**: Browser opens WebSocket to gateway
4. **CapTP Handshake**: Establishes a CapTP session
5. **AGENT Fetch**: Uses the provided identifier to fetch AGENT powers
6. **UI Initialization**: Renders the chat interface with access to host capabilities

## Keyboard Shortcuts

- `"` or `'` - Open chat dialog
- `.` - Open eval dialog
- `Escape` - Close current dialog

## File Structure

```
packages/chat/
├── index.html              # Vite entry point
├── vite.config.js          # Vite configuration
├── vite-endo-plugin.js     # Vite plugin that manages daemon and gateway
├── scripts/
│   └── gateway-server.js   # Gateway WebSocket server
├── src/
│   ├── main.js             # Application entry point
│   ├── chat.js             # Main chat UI components
│   ├── connection.js       # Gateway WebSocket + CapTP connection
│   ├── message-parse.js    # Message parsing for pet name references
│   └── ref-iterator.js     # Remote async iterator adapter
└── package.json
```

## Message Syntax

Messages can include pet name references using the `@` syntax:

- `@pet-name` - Reference a pet name
- `@pet-name:edge-name` - Reference with a specific edge name

Example: `Hello! Here is @my-file for you.`

## Dependencies

- `@endo/captp` - Capability Transfer Protocol
- `@endo/far` - Eventual send (E) for remote method calls
- `@endo/exo` - Exo objects for defining remotely-callable interfaces
- `@endo/pass-style` - Value rendering based on pass style
- `@endo/daemon` - Endo daemon (dev dependency for gateway server)
- `ses` - Secure ECMAScript (HardenedJS)
