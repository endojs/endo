#![no_std]

use ed25519_dalek::{SigningKey, VerifyingKey};
use noise_protocol::patterns::noise_ik;
use noise_protocol::{CipherState, HandshakeState, U8Array, DH};
use noise_rust_crypto::{Blake2s, ChaCha20Poly1305, X25519};
use rand_core::{OsRng, RngCore};

// These bindings are deliberately not thread safe.
// The intention is that the JavaScript driver will create an instance
// of this virtual machine for each OCapN session.
const SIZE: usize = 65535;
static mut BUFFER: [u8; SIZE] = [0u8; SIZE];
static mut HS: Option<HandshakeState<X25519, ChaCha20Poly1305, Blake2s>> = None;
static mut ENCRYPT: Option<CipherState<ChaCha20Poly1305>> = None;
static mut DECRYPT: Option<CipherState<ChaCha20Poly1305>> = None;

// BUFFER layout for the Noise_IK_25519_ChaChaPoly_BLAKE2s handshake.
//
// Identity convention: the OCapN identity is an Ed25519 keypair.  Both
// the X25519 keypair used by Noise IK and the Ed25519 verifying key
// advertised in the SYN payload are derived from the same 32-byte
// Ed25519 seed via:
//
//   * private X25519 = `SigningKey::to_scalar_bytes()` (the clamped scalar)
//   * public  X25519 = `VerifyingKey::to_montgomery().to_bytes()`
//     (Edwards -> Montgomery birational map; the same convention used by
//     libsodium / age / wireguard-tools)
//
// IK msg 1 = e, es, s, ss
// IK msg 2 = e, ee, se
//
// The handshake completes after msg 2; there is no msg 3 (ACK) on the
// wire.  After each message Rust copies `hs.get_hash()` to the
// HANDSHAKE_HASH offset so the JavaScript layer can read it as the
// channel-binding value for the post-handshake op:start-session
// signature.
//
// 32   @64     SIGNING_KEY                Ed25519 seed (input)
// 32   @96     INTENDED_RESPONDER_KEY     Ed25519 cleartext routing prefix
//                                         AND prologue input (input)
//
//            SYN payload (36 bytes, encrypted in msg 1):
// 32   @128     INITIATOR_VERIFYING_KEY   Ed25519 verifying key
// 2    @160     FIRST_ENCODING            big-endian uint16
// 2    @162     OTHER_ENCODINGS           big-endian uint16 bit-mask
//
// 132  @256    SYN  Noise message 1 (e || encrypted s || encrypted payload)
//
//            SYNACK payload (1 byte, encrypted in msg 2):
// 1    @416     ACCEPTED_ENCODING         responder's chosen encoding
//
// 49   @544    SYNACK  Noise message 2 (e || encrypted payload)
//
// 32   @800    HANDSHAKE_HASH             hs.get_hash() snapshot
//                                         (channel-binding value)

const SIGNING_KEY_OFFSET: usize = 64;
const SIGNING_KEY_LENGTH: usize = 32;
const INTENDED_RESPONDER_KEY_OFFSET: usize = 96;
const INTENDED_RESPONDER_KEY_LENGTH: usize = 32;
const INITIATOR_VERIFYING_KEY_OFFSET: usize = 128;
const VERIFYING_KEY_LENGTH: usize = 32;
const SYN_PAYLOAD_OFFSET: usize = 128;
const SYN_PAYLOAD_LENGTH: usize = 36;
const SYN_OFFSET: usize = 256;
// SYN = 32 (e) + 32 + 16 (encrypted s) + 36 + 16 (encrypted payload).
const SYN_LENGTH: usize = 132;
const SYNACK_PAYLOAD_OFFSET: usize = 416;
const SYNACK_PAYLOAD_LENGTH: usize = 1;
const SYNACK_OFFSET: usize = 544;
// SYNACK = 32 (e) + 1 + 16 (encrypted payload).
const SYNACK_LENGTH: usize = 49;
const HANDSHAKE_HASH_OFFSET: usize = 800;
const HANDSHAKE_HASH_LENGTH: usize = 32;

// Domain-separation prefix mixed into the Noise prologue. Binds the
// handshake transcript against cross-protocol/downgrade attacks.
const PROLOGUE_PREFIX: &[u8] = b"OCapN/np/1\0";

unsafe extern "C" {
    fn buffer_callback(buffer: *const u8);
}

/// Compose the Noise prologue from the static fields the JS layer has
/// already placed in BUFFER.  Both peers reach the same bytes.
unsafe fn prologue() -> [u8; PROLOGUE_PREFIX.len() + INTENDED_RESPONDER_KEY_LENGTH] {
    #[allow(static_mut_refs)]
    let mut out = [0u8; PROLOGUE_PREFIX.len() + INTENDED_RESPONDER_KEY_LENGTH];
    out[..PROLOGUE_PREFIX.len()].copy_from_slice(PROLOGUE_PREFIX);
    out[PROLOGUE_PREFIX.len()..].copy_from_slice(unsafe {
        &BUFFER[INTENDED_RESPONDER_KEY_OFFSET..][..INTENDED_RESPONDER_KEY_LENGTH]
    });
    out
}

/// Derive the X25519 keypair (private clamped scalar + public Montgomery
/// point) corresponding to the Ed25519 seed at SIGNING_KEY_OFFSET.
unsafe fn derive_local_static_keypair() -> Option<(<X25519 as DH>::Key, <X25519 as DH>::Pubkey)> {
    #[allow(static_mut_refs)]
    let signing_key = unsafe {
        SigningKey::try_from(&BUFFER[SIGNING_KEY_OFFSET..][..SIGNING_KEY_LENGTH]).ok()?
    };
    let priv_bytes: [u8; 32] = signing_key.to_scalar_bytes();
    let priv_key = <X25519 as DH>::Key::from_slice(&priv_bytes);
    let pub_key = X25519::pubkey(&priv_key);
    Some((priv_key, pub_key))
}

/// Derive the X25519 public key corresponding to the Ed25519 verifying
/// key at INTENDED_RESPONDER_KEY_OFFSET.  Initiator only.
unsafe fn derive_remote_static_pubkey() -> Option<<X25519 as DH>::Pubkey> {
    #[allow(static_mut_refs)]
    let bytes = unsafe {
        let mut tmp = [0u8; 32];
        tmp.copy_from_slice(
            &BUFFER[INTENDED_RESPONDER_KEY_OFFSET..][..INTENDED_RESPONDER_KEY_LENGTH],
        );
        tmp
    };
    let vk = VerifyingKey::from_bytes(&bytes).ok()?;
    let mont_bytes: [u8; 32] = vk.to_montgomery().to_bytes();
    Some(<X25519 as DH>::Pubkey::from_slice(&mont_bytes))
}

/// Snapshot the running handshake hash into the BUFFER so the JS layer
/// can use it as the post-handshake channel-binding value.
unsafe fn snapshot_handshake_hash() {
    #[allow(static_mut_refs)]
    unsafe {
        let hs = match &HS {
            None => return,
            Some(hs) => hs,
        };
        let hash = hs.get_hash();
        let n = HANDSHAKE_HASH_LENGTH.min(hash.len());
        BUFFER[HANDSHAKE_HASH_OFFSET..][..HANDSHAKE_HASH_LENGTH].fill(0);
        BUFFER[HANDSHAKE_HASH_OFFSET..][..n].copy_from_slice(&hash[..n]);
    }
}

#[unsafe(no_mangle)]
fn buffer() {
    unsafe {
        #[allow(static_mut_refs)]
        buffer_callback(BUFFER.as_ptr());
    }
}

/// Generate a fresh Ed25519 seed for the initiator and stash both the
/// seed and the corresponding verifying key in BUFFER.  The verifying
/// key is what the SYN payload will carry to the responder; the seed
/// stays local.
#[unsafe(no_mangle)]
fn generate_initiator_keys() {
    unsafe {
        let mut seed = [0u8; 32];
        OsRng.fill_bytes(&mut seed);
        let signing_key = SigningKey::from_bytes(&seed);
        let verifying_key = signing_key.verifying_key();

        BUFFER[SIGNING_KEY_OFFSET..][..SIGNING_KEY_LENGTH]
            .copy_from_slice(signing_key.to_bytes().as_slice());
        BUFFER[INITIATOR_VERIFYING_KEY_OFFSET..][..VERIFYING_KEY_LENGTH]
            .copy_from_slice(verifying_key.to_bytes().as_slice());

        #[allow(static_mut_refs)]
        buffer_callback(BUFFER.as_ptr());
    }
}

/// Generate a fresh Ed25519 seed for the responder.  The verifying key
/// is *not* placed in BUFFER here because the responder's identity is
/// already known to the initiator via INTENDED_RESPONDER_KEY (which the
/// JS layer fills before invoking the responder).
#[unsafe(no_mangle)]
fn generate_responder_keys() {
    unsafe {
        let mut seed = [0u8; 32];
        OsRng.fill_bytes(&mut seed);
        let signing_key = SigningKey::from_bytes(&seed);
        let verifying_key = signing_key.verifying_key();

        BUFFER[SIGNING_KEY_OFFSET..][..SIGNING_KEY_LENGTH]
            .copy_from_slice(signing_key.to_bytes().as_slice());
        // For symmetry with `generate_initiator_keys`, write the
        // verifying key into INTENDED_RESPONDER_KEY so the JS layer can
        // read it back as the responder's identity.
        BUFFER[INTENDED_RESPONDER_KEY_OFFSET..][..INTENDED_RESPONDER_KEY_LENGTH]
            .copy_from_slice(verifying_key.to_bytes().as_slice());

        #[allow(static_mut_refs)]
        buffer_callback(BUFFER.as_ptr());
    }
}

/// Initiator side, IK message 1 (`e, es, s, ss`).
///
/// Reads:
///   - SIGNING_KEY (Ed25519 seed)
///   - INTENDED_RESPONDER_KEY (responder's Ed25519)
///   - SYN_PAYLOAD (initiator's verifying key + encoding negotiation)
///
/// Writes:
///   - SYN noise message (132 bytes)
///   - HANDSHAKE_HASH (running transcript hash)
///
/// Error codes:
///   1 = could not load initiator's Ed25519 signing key from BUFFER
///   2 = could not derive initiator's static X25519 keypair
///   3 = INTENDED_RESPONDER_KEY is not a valid Ed25519 verifying key
///   4 = Noise handshake state initialization or write_message failed
#[unsafe(no_mangle)]
fn initiator_write_syn() -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let (initiator_priv, _initiator_pub) = match derive_local_static_keypair() {
            None => return 1,
            Some(kp) => kp,
        };
        let responder_pub = match derive_remote_static_pubkey() {
            None => return 3,
            Some(pk) => pk,
        };
        let pro = prologue();

        HS = Some(HandshakeState::new(
            noise_ik(),
            true,                 // initiator
            &pro[..],             // OCapN-bound prologue
            Some(initiator_priv), // s: our static
            None,                 // e: auto-generated
            Some(responder_pub),  // rs: responder's static (pre-known)
            None,                 // re: none
        ));
        let hs = HS.as_mut().unwrap();
        if !hs.is_write_turn() {
            return 4;
        }
        if hs
            .write_message(
                &BUFFER[SYN_PAYLOAD_OFFSET..][..SYN_PAYLOAD_LENGTH],
                &mut BUFFER[SYN_OFFSET..][..SYN_LENGTH],
            )
            .is_err()
        {
            return 4;
        }
        snapshot_handshake_hash();

        buffer_callback(BUFFER.as_ptr());
        0
    }
}

/// Responder side, step 1: read IK msg 1 (`e, es, s, ss`).  Decrypts
/// the SYN payload (initiator's verifying key + encoding offers) into
/// BUFFER so the JS layer can negotiate the accepted encoding byte
/// before invoking `responder_write_synack`.
///
/// Reads:
///   - SIGNING_KEY (Ed25519 seed)
///   - INTENDED_RESPONDER_KEY (must equal our verifying key)
///   - SYN noise message
///
/// Writes:
///   - SYN_PAYLOAD (decrypted: initiator's verifying key + encoding)
///
/// Error codes:
///   1 = could not load responder's Ed25519 signing key
///   2 = could not derive responder's static X25519 keypair
///   3 = INTENDED_RESPONDER_KEY does not match our derived verifying key
///       (SYN intended for a different responder; relays should reroute)
///   4 = Noise read_message failed (auth tag mismatch / replay /
///       prologue mismatch / wrong responder static)
#[unsafe(no_mangle)]
fn responder_read_syn() -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let signing_key =
            match SigningKey::try_from(&BUFFER[SIGNING_KEY_OFFSET..][..SIGNING_KEY_LENGTH]) {
                Err(_) => return 1,
                Ok(key) => key,
            };
        let our_verifying_key_bytes = signing_key.verifying_key().to_bytes();
        if BUFFER[INTENDED_RESPONDER_KEY_OFFSET..][..INTENDED_RESPONDER_KEY_LENGTH]
            != our_verifying_key_bytes
        {
            return 3;
        }

        let (responder_priv, _responder_pub) = match derive_local_static_keypair() {
            None => return 2,
            Some(kp) => kp,
        };
        let pro = prologue();

        HS = Some(HandshakeState::new(
            noise_ik(),
            false,
            &pro[..],
            Some(responder_priv),
            None,
            None,
            None,
        ));
        let hs = HS.as_mut().unwrap();

        if hs.is_write_turn() {
            return 4;
        }
        if hs
            .read_message(
                &BUFFER[SYN_OFFSET..][..SYN_LENGTH],
                &mut BUFFER[SYN_PAYLOAD_OFFSET..][..SYN_PAYLOAD_LENGTH],
            )
            .is_err()
        {
            return 4;
        }

        buffer_callback(BUFFER.as_ptr());
        0
    }
}

/// Responder side, step 2: write IK msg 2 (`e, ee, se`) and finalize
/// the handshake.  The JS layer must have placed the negotiated
/// encoding byte at SYNACK_PAYLOAD_OFFSET before invoking this.
///
/// Reads:
///   - SYNACK_PAYLOAD (responder's accepted encoding byte)
///
/// Writes:
///   - SYNACK noise message
///   - HANDSHAKE_HASH
///
/// Error codes:
///   1 = no in-progress handshake (caller did not invoke
///       `responder_read_syn` first)
///   2 = Noise write_message failed
///   3 = handshake did not complete after writing msg 2 (invariant
///       violation; should not happen for IK)
#[unsafe(no_mangle)]
fn responder_write_synack() -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let hs = match &mut HS {
            None => return 1,
            Some(hs) => hs,
        };
        if hs
            .write_message(
                &BUFFER[SYNACK_PAYLOAD_OFFSET..][..SYNACK_PAYLOAD_LENGTH],
                &mut BUFFER[SYNACK_OFFSET..][..SYNACK_LENGTH],
            )
            .is_err()
        {
            return 2;
        }
        if !hs.completed() {
            return 3;
        }
        snapshot_handshake_hash();

        // Responder receives (i->r, r->i) ciphers; encrypt with the
        // r->i half, decrypt with the i->r half.
        let (recv_cipher, send_cipher) = hs.get_ciphers();
        ENCRYPT = Some(send_cipher);
        DECRYPT = Some(recv_cipher);

        buffer_callback(BUFFER.as_ptr());
        0
    }
}

/// Initiator side: read msg 2 and finalize the handshake.  No further
/// message is written on the wire (IK has no msg 3).
///
/// Reads:
///   - SYNACK noise message
///
/// Writes:
///   - SYNACK_PAYLOAD (decrypted accepted encoding byte)
///   - HANDSHAKE_HASH
///
/// Error codes:
///   1 = no in-progress handshake (caller did not invoke
///       `initiator_write_syn` first)
///   2 = Noise read_message failed
#[unsafe(no_mangle)]
fn initiator_read_synack() -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let hs = match &mut HS {
            None => return 1,
            Some(hs) => hs,
        };
        if hs
            .read_message(
                &BUFFER[SYNACK_OFFSET..][..SYNACK_LENGTH],
                &mut BUFFER[SYNACK_PAYLOAD_OFFSET..][..SYNACK_PAYLOAD_LENGTH],
            )
            .is_err()
        {
            return 2;
        }
        if !hs.completed() {
            return 2;
        }
        snapshot_handshake_hash();

        // Initiator receives (i->r, r->i) ciphers; encrypt with the
        // i->r half, decrypt with the r->i half.
        let (send_cipher, recv_cipher) = hs.get_ciphers();
        ENCRYPT = Some(send_cipher);
        DECRYPT = Some(recv_cipher);

        buffer_callback(BUFFER.as_ptr());
        0
    }
}

// BUFFER:
// reads `length` bytes
// writes `length + 16` bytes (ciphertext + Poly1305 tag)
#[unsafe(no_mangle)]
fn encrypt(length: usize) -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let encrypter = match &mut ENCRYPT {
            None => return 1,
            Some(encrypter) => encrypter,
        };
        encrypter.encrypt_in_place(&mut BUFFER, length);
        buffer_callback(BUFFER.as_ptr());
        0
    }
}

// BUFFER:
// reads `length` bytes (ciphertext + tag)
// writes `length - 16` bytes (plaintext)
#[unsafe(no_mangle)]
fn decrypt(length: usize) -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let decrypter = match &mut DECRYPT {
            None => return 1,
            Some(decrypter) => decrypter,
        };
        if decrypter.decrypt_in_place(&mut BUFFER, length).is_err() {
            return 2;
        }
        buffer_callback(BUFFER.as_ptr());
        0
    }
}
