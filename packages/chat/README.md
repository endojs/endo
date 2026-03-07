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
2. Reads the daemon's gateway address and agent ID
3. Injects connection parameters (`ENDO_GATEWAY`, `ENDO_AGENT`) into the app

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

1. **Vite Plugin**: Ensures daemon is running, reads gateway address and agent ID
2. **WebSocket Connection**: Browser opens WebSocket to daemon's built-in gateway
3. **CapTP Handshake**: Establishes a CapTP session
4. **AGENT Fetch**: Uses the provided identifier to fetch AGENT powers
5. **UI Initialization**: Renders the chat interface with access to host capabilities

## Keyboard Shortcuts

- `"` or `'` - Open chat dialog
- `.` - Open eval dialog
- `Escape` - Close current dialog

## File Structure

```
packages/chat/
├── index.html              # Vite entry point
├── main.js                 # Application entry point
├── connection.js           # Gateway WebSocket + CapTP connection
├── chat.js                 # Main chat UI components
├── vite.config.js          # Vite configuration
├── vite-endo-plugin.js     # Vite plugin that ensures daemon is running
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
- `@endo/daemon` - Endo daemon (dev dependency)
- `ses` - Secure ECMAScript (HardenedJS)
