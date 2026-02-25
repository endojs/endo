# Daemon 256-bit Identifiers

| | |
|---|---|
| **Date** | 2026-02-24 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The Endo daemon currently uses 512-bit (128-character hex) identifiers for
formula numbers, node identifiers, and content addresses. This design is larger
than necessary and misaligned with the OCapN-Noise network protocol, which uses
Ed25519 public keys (256-bit / 64-character hex) for peer identification.

Current state:

| Component          | Size     | Encoding       | Source                      |
|--------------------|----------|----------------|------------------------------|
| Node/Peer ID       | 512 bits | 128-char hex   | SHA-512(rootNonce + "node") |
| Formula Number     | 512 bits | 128-char hex   | Random or SHA-512           |
| Formula Identifier | 257 chars| `{number}:{node}` | Composite                |
| Content Address    | 512 bits | 128-char hex   | SHA-512(content)            |

Problems with the current approach:

1. **Excessive identifier size**: 512-bit random identifiers provide far more
   collision resistance than necessary (2^256 is already astronomical).
2. **Misalignment with OCapN-Noise**: The network protocol uses Ed25519 keys
   (256-bit) for peer identity. The daemon's 512-bit node identifier is
   redundant — it should be the Ed25519 public key directly.
3. **Storage inefficiency**: Every formula path, pet store entry, and message
   reference carries 128-character hex strings where 64 would suffice.
4. **SHA-256 is sufficient**: For content addressing, SHA-256 provides adequate
   collision resistance and is more widely deployed.

## Description of the Design

### Target State

| Component          | New Size | Encoding     | Source                  |
|--------------------|----------|--------------|--------------------------|
| Node/Peer ID       | 256 bits | 64-char hex  | Ed25519 public key      |
| Formula Number     | 256 bits | 64-char hex  | Random or SHA-256       |
| Formula Identifier | 129 chars| `{number}:{node}` | Composite          |
| Content Address    | 256 bits | 64-char hex  | SHA-256(content)        |

### Peer Identification

Replace the derived SHA-512 node identifier with the Ed25519 public key
directly. The daemon already needs an Ed25519 keypair for OCapN-Noise
authentication; using the public key as the node identifier eliminates
redundancy.

```js
// Current: derive node ID from root nonce
const nodeNumber = deriveId('node', rootEntropy, cryptoPowers.makeSha512());
// 128-char hex, e.g.: "a1b2c3d4...{124 more chars}"

// Proposed: use Ed25519 public key
const { publicKey } = await cryptoPowers.generateEd25519Keypair();
const nodeNumber = bufferToHex(publicKey);
// 64-char hex, e.g.: "a1b2c3d4...{60 more chars}"
```

At daemon initialization (`packages/daemon/src/daemon.js:238`), the root
entropy derivation changes from:

```js
deriveId('node', rootEntropy, cryptoPowers.makeSha512())
```

to generating an Ed25519 keypair and storing both keys (the private key is
needed for OCapN-Noise handshakes).

### Formula Number Generation

Replace 512-bit random with 256-bit random for capability formulas:

```js
// Current (daemon-node-powers.js:281-290)
const randomHex512 = () =>
  new Promise((resolve, reject) =>
    crypto.randomBytes(64, (err, bytes) => {
      if (err) {
        reject(err);
      } else {
        resolve(bytes.toString('hex'));
      }
    }),
  );

// Proposed
const randomHex256 = () =>
  new Promise((resolve, reject) =>
    crypto.randomBytes(32, (err, bytes) => {
      if (err) {
        reject(err);
      } else {
        resolve(bytes.toString('hex'));
      }
    }),
  );
```

### Content Addressing

Replace SHA-512 with SHA-256 for content-addressed formulas:

```js
// Current (daemon-node-powers.js:272-279)
const makeSha512 = () => {
  const digester = crypto.createHash('sha512');
  return harden({
    update: chunk => digester.update(chunk),
    updateText: chunk => digester.update(textEncoder.encode(chunk)),
    digestHex: () => digester.digest('hex'),
  });
};

// Proposed
const makeSha256 = () => {
  const digester = crypto.createHash('sha256');
  return harden({
    update: chunk => digester.update(chunk),
    updateText: chunk => digester.update(textEncoder.encode(chunk)),
    digestHex: () => digester.digest('hex'),
  });
};
```

### CryptoPowers Interface Change

```typescript
// Current (types.d.ts:953-958)
export type CryptoPowers = {
  makeSha512: () => Sha512;
  randomHex512: () => Promise<string>;
};

// Proposed
export type Sha256 = {
  update: (chunk: Uint8Array) => void;
  updateText: (chunk: string) => void;
  digestHex: () => string;
};

export type Ed25519Keypair = {
  publicKey: Uint8Array;  // 32 bytes
  privateKey: Uint8Array; // 64 bytes (seed + public key, per NaCl convention)
};

export type CryptoPowers = {
  makeSha256: () => Sha256;
  randomHex256: () => Promise<string>;
  generateEd25519Keypair: () => Promise<Ed25519Keypair>;
};
```

### Validation Pattern Change

```js
// Current (formula-identifier.js:8-9)
const numberPattern = /^[0-9a-f]{128}$/;
const idPattern = /^(?<number>[0-9a-f]{128}):(?<node>[0-9a-f]{128})$/;

// Proposed
const numberPattern = /^[0-9a-f]{64}$/;
const idPattern = /^(?<number>[0-9a-f]{64}):(?<node>[0-9a-f]{64})$/;
```

### Locator Format

The locator format remains the same but with shorter identifiers:

```
// Current (257 + URL overhead characters)
endo://{128-char node}/?id={128-char number}&type={type}

// Proposed (129 + URL overhead characters)
endo://{64-char node}/?id={64-char number}&type={type}
```

### Storage Path Format

Formula storage paths change to accommodate shorter identifiers:

```js
// Current (daemon-node-powers.js:396-406)
// Path: {statePath}/formulas/{head(2)}/{tail(126)}.json
// Example: ~/.local/state/endo/formulas/a1/b2c3d4...{122 chars}.json

// Proposed
// Path: {statePath}/formulas/{head(2)}/{tail(62)}.json
// Example: ~/.local/state/endo/formulas/a1/b2c3d4...{58 chars}.json
```

### Branded Types Documentation

Update the type documentation in `types.d.ts`:

```typescript
// Current (types.d.ts:20-27)
/** A 128-character hex string identifying a formula within a node */
export type FormulaNumber = string & { [FormulaNumberBrand]: true };

/** A 128-character hex string identifying a node */
export type NodeNumber = string & { [NodeNumberBrand]: true };

// Proposed
/** A 64-character hex string identifying a formula within a node */
export type FormulaNumber = string & { [FormulaNumberBrand]: true };

/** A 64-character hex string (Ed25519 public key) identifying a node */
export type NodeNumber = string & { [NodeNumberBrand]: true };
```

## Files to Modify

### Daemon Core

**`packages/daemon/src/formula-identifier.js`** (lines 8-9)
- Change `numberPattern` regex from `{128}` to `{64}`
- Change `idPattern` regex from `{128}` to `{64}`

**`packages/daemon/src/daemon-node-powers.js`**
- Lines 272-279: Replace `makeSha512` with `makeSha256`
- Lines 281-290: Replace `randomHex512` with `randomHex256`
- Lines 292-296: Update returned object
- Lines 333-390: Update `makeContentSha512Store` to `makeContentSha256Store`
  - Line 335: Change directory from `store-sha512` to `store-sha256`
  - Line 343: Use `makeSha256` instead of `makeSha512`
- Add `generateEd25519Keypair` function

**`packages/daemon/src/daemon.js`**
- Line 202: Destructure `randomHex256` instead of `randomHex512`
- Line 238: Replace SHA-512 derivation with Ed25519 keypair generation
- Lines 2243-3045: Replace all `randomHex512()` calls with `randomHex256()`
  (approximately 30 call sites)

**`packages/daemon/src/types.d.ts`**
- Lines 20-27: Update type documentation for `FormulaNumber` and `NodeNumber`
- Lines 53-57: Rename `Sha512` to `Sha256`
- Lines 953-958: Update `CryptoPowers` type

**`packages/daemon/src/locator.js`**
- Update format documentation comment (lines 9-15)
- No code changes needed (uses `isValidNumber` from formula-identifier.js)

**`packages/daemon/src/mail.js`**
- Lines 130, 143: Update type annotation for `randomHex512` parameter
- Replace all `randomHex512` calls with `randomHex256` (approximately 9 sites)

### Tests

**`packages/daemon/test/endo.test.js`**
- Lines 2372-2373: Update test fixtures to use 64-char identifiers
- Any hardcoded 128-char hex patterns

**`packages/daemon/test/formula-identifier.test.js`** (if exists)
- Update test patterns

### CLI

**`packages/cli/`**
- Search for any identifier validation or display code
- Update any hardcoded length assumptions

### Chat

**`packages/chat/`**
- Search for any identifier validation or display code
- Update any hardcoded length assumptions

## Security Considerations

- **256-bit random**: Provides 2^256 collision resistance, which is
  astronomically sufficient. A collision would require ~2^128 attempts on
  average (birthday bound), which exceeds the computational capacity of any
  conceivable adversary.

- **SHA-256**: Provides 128-bit security against collision attacks (birthday
  bound) and 256-bit security against preimage attacks. This is sufficient for
  content addressing where an attacker would need to find a collision to
  substitute malicious content.

- **Ed25519**: Provides 128-bit security level. The public key serves as a
  permanent identifier, while the private key enables authentication during
  OCapN-Noise handshakes. Ed25519 signatures are deterministic, preventing
  nonce-reuse vulnerabilities.

- **No weakening of security**: The migration from 512-bit to 256-bit
  identifiers does not weaken security in any practical sense. 256-bit security
  is considered safe against quantum computers with Grover's algorithm
  (effective 128-bit security).

## Migration Notes

- **No backward compatibility**: This migration does not maintain compatibility
  with existing 512-bit identifiers. All test users must purge their daemon
  state (`rm -rf ~/.local/state/endo/`).

- **Clean slate**: The migration assumes fresh daemon state. Future work may
  introduce versioned formula identifiers if backward compatibility becomes
  necessary.

- **OCapN-Noise alignment**: After this migration, the daemon's node identifier
  will be the Ed25519 public key, which is already used by OCapN-Noise for peer
  authentication. This eliminates the need to maintain two separate peer
  identification schemes.

## Test Plan

1. **Unit tests for crypto functions**:
   - `randomHex256()` returns 64-character hex strings
   - `makeSha256()` produces correct digests
   - `generateEd25519Keypair()` returns valid keypairs

2. **Validation tests**:
   - `isValidNumber()` accepts 64-char hex, rejects 128-char
   - `parseId()` correctly parses new format
   - `formatId()` produces valid identifiers

3. **Integration tests**:
   - Fresh daemon starts with 256-bit identifiers
   - Formula storage uses new path format
   - Content addressing uses SHA-256
   - Locators parse correctly

4. **Cross-package tests**:
   - CLI commands handle new identifier format
   - Chat displays identifiers correctly

## Compatibility Considerations

- **Breaking change**: Existing daemon state is incompatible. Users must delete
  `~/.local/state/endo/` and start fresh.

- **Network protocol**: No wire protocol changes. OCapN-Noise already uses
  Ed25519 keys.

- **API stability**: The daemon API returns identifiers; callers should not
  assume identifier length. TypeScript branded types enforce this.

## Upgrade Considerations

- **State purge required**: `rm -rf ~/.local/state/endo/ ~/.config/endo/`

- **No automatic migration**: Manual state purge is required. Future work may
  provide migration tooling if backward compatibility becomes important.

- **Documentation update**: Update any user-facing documentation that references
  identifier format or length.
