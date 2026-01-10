# Chat Application Extraction Plan

## Overview

This document outlines the plan to extract the chat functionality from `packages/cli/demo/cat.js` into a standalone application that can work independently while maintaining compatibility with the Endo ecosystem.

## Dependencies to Create First

### 1. HubCap (`packages/hubcap`)

**Purpose**: WebSocket server that bridges CapTP sessions over WebSocket to powers objects identified by HTTP Authorization Bearer Token.

**Requirements**:
- Accept WebSocket connections with HTTP Authorization header (Bearer Token)
- Validate token and look up corresponding powers object
- Bridge CapTP protocol over WebSocket
- Support CORS for cross-origin requests from browser clients
- Handle connection lifecycle (connect, disconnect, errors)

**Key Components**:
- HTTP/WebSocket server setup
- Bearer token authentication middleware
- CapTP connection bridging (similar to `packages/daemon/src/web-server-node.js`)
- Token-to-powers registry/mapping
- CORS headers for WebSocket upgrade requests

**API Design**:
```js
// Server setup
const hubcap = makeHubCap({
  port: 8080,
  tokenRegistry: {
    // token -> powers lookup
    getPowers(token) => Promise<powers>
  }
});

// Client connection flow:
// 1. WebSocket connection with Authorization: Bearer <token>
// 2. Server validates token, retrieves powers
// 3. CapTP session established over WebSocket
// 4. Client receives bootstrap (powers object)
```

### 2. Exo-Stream (`packages/exo-stream`)

**Purpose**: Extract iterator ref functionality from `packages/daemon` and evolve the API to use async sink/springs instead of JavaScript iterator protocol over CapTP.

**Current Implementation** (to extract):
- `makeIteratorRef(iterable)` - creates a FarRef<AsyncIterator> from an iterable
- `makeRefIterator(iteratorRef)` - creates an AsyncIterator from a FarRef<AsyncIterator>

**Future API** (to design):
- Use async sink/springs pattern from `packages/stream`
- Avoid running JavaScript iterator protocol over CapTP
- Expose async sinks and springs as described in `packages/stream`

**Key Files to Extract**:
- `packages/daemon/src/ref-reader.js` → `packages/exo-stream/src/ref-reader.js`
- `packages/daemon/src/reader-ref.js` → `packages/exo-stream/src/reader-ref.js`
- `packages/daemon/src/interfaces.js` (if needed for AsyncIteratorInterface)

**Dependencies**:
- `@endo/exo` (for makeExo)
- `@endo/stream` (for async sink/springs)
- `@endo/base64` (for makeRefReader/makeReaderRef if kept)

## Revised Chat Application Plan

### Architecture

Instead of mocking powers locally, the chat application will:

1. **Connect to HubCap** via WebSocket with Bearer Token
2. **Receive powers object** through CapTP bootstrap
3. **Use existing chat components** from `cat.js` with minimal changes
4. **Run in Vite** for development with hot module reload

### Project Structure

```
packages/chat/
├── index.html              # Vite entry point
├── vite.config.js          # Vite configuration
├── src/
│   ├── main.js             # Application entry point
│   ├── chat.js             # Main chat application (extracted from cat.js)
│   ├── connection.js       # HubCap WebSocket connection setup
│   ├── message-parse.js    # Message parsing utility
│   └── components/         # UI components
│       ├── chat.js         # Chat component
│       ├── inventory.js    # Pet name inventory component
│       └── styles.css      # Extracted styles
└── package.json
```

### Key Changes from Original Plan

1. **No Mock Powers**: Use real powers from HubCap connection
2. **WebSocket Connection**: Connect to HubCap server instead of daemon
3. **Bearer Token Auth**: Get token from environment/config for development
4. **CapTP Client**: Use CapTP client library to connect to HubCap
5. **Minimal Extraction**: Keep chat components mostly as-is, just extract them

### Implementation Steps

1. **Set up Vite project**
   - Configure Vite for development
   - Set up HTML entry point
   - Configure build output

2. **Create HubCap connection module**
   - WebSocket connection with Bearer Token
   - CapTP client setup
   - Bootstrap retrieval (powers object)
   - Connection lifecycle management

3. **Extract chat components**
   - Chat component (send messages)
   - Inventory component (pet name list)
   - Message parsing utility
   - Styles

4. **Integrate components**
   - Initialize connection to HubCap
   - Pass powers to chat components
   - Set up DOM mounting

5. **Development setup**
   - Dev server script
   - Environment variables for HubCap URL and token
   - Hot module reload

### Dependencies

**Runtime**:
- `@endo/far` - Eventual send (E)
- `@endo/captp` - CapTP client
- `@endo/exo-stream` - Iterator refs (once created)
- `@endo/pass-style` - Value rendering
- `@endo/daemon` - makeRefIterator (temporary, until exo-stream ready)

**Development**:
- `vite` - Development server and build tool
- Standard Endo dev dependencies

### Token Management

For development, tokens can be:
- Provided via environment variable
- Stored in localStorage (for browser persistence)
- Provided via URL parameter (for testing)
- Generated by a token service endpoint

For production, tokens should be:
- Securely obtained from authentication service
- Stored securely (not in localStorage for sensitive apps)
- Rotated periodically

## Implementation Order

1. ✅ Create HubCap (`packages/hubcap`) - **COMPLETE**
2. ⏳ Extract exo-stream (`packages/exo-stream`)
3. ✅ Set up chat application with Vite - **COMPLETE**
4. ✅ Extract chat components from cat.js - **COMPLETE**
5. ✅ Integrate gateway connection - **COMPLETE** (gateway integrated into daemon)
6. ✅ Vite plugin auto-starts Endo daemon - **COMPLETE**
7. ⏳ Test end-to-end flow

## Architecture Update

The original plan called for HubCap as a separate server. Instead, the gateway functionality
has been integrated directly into the Endo daemon:

- Daemon starts a gateway HTTP/WebSocket server on a configurable port (ENDO_PORT)
- Gateway provides `fetch(token)` interface over CapTP
- Vite plugin starts a temporary daemon and injects connection parameters
- Chat app connects to `ws://127.0.0.1:${ENDO_PORT}/`, fetches ENDO, calls `host()` for powers

This simplifies the developer experience to just `yarn dev`.

