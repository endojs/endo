#![no_std]

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use noise_protocol::patterns::noise_xx;
use noise_protocol::{CipherState, HandshakeState, U8Array, DH};
use noise_rust_crypto::{Blake2s, ChaCha20Poly1305, X25519};
use rand_core::OsRng;

// These bindings are deliberately not thread safe.
// The intention is that the JavaScript driver will create an instance
// of this virtual machine for each OCapN session.
const SIZE: usize = 65535;
static mut BUFFER: [u8; SIZE] = [0u8; SIZE];
static mut HS: Option<HandshakeState<X25519, ChaCha20Poly1305, Blake2s>> = None;
static mut ENCRYPT: Option<CipherState<ChaCha20Poly1305>> = None;
static mut DECRYPT: Option<CipherState<ChaCha20Poly1305>> = None;

// BUFFER layout
//            local (initiator for SYN and ACK, resonder for SYNACK):
// 32   @0      PRIVATE_CRYPT_KEY
// 32   @32     PUBLIC_CRYPT_KEY
// 32   @64     SIGNING_KEY
//
//            SYN
// 100  @128    SYN_PAYLOAD:
// 32   @128      INITIATOR_VERIFYING_KEY
// 64   @160      INITIATOR_SIGNATURE of initiator's PUBLIC_CRYPT_KEY
// 2    @224      FIRST_ENCODINGS supported
// 1    @226      OTHER_ENCODINGS supported bit vector (first + 1 + bit)
//      @228    padding
// 130  @256    SYN noise protocol message from initiator to responder
// 32             noise protocol message overhead
// 98             encoding SYN_PAYLOAD
//      @386    padding
//
//            SYNACK
// 97   @416    SYNACK_PAYLOAD:
// 32   @416      RESPONDER_VERIFYING_KEY
// 64   @448      RESPONDER_SIGNATURE of responder's PUBLIC_CRYPT_KEY
// 1    @512      ACCEPTED_ENCODING last of initiator supported encodings in responder supported
//                encodings
//      @513    padding
// 193  @544    SYNACK noise protocol message from responder to initiator
// 96             noise protocol message overhead
// 97             encoded SYNACK_PAYLOAD
//      @737
//
//      @768  ACK
// 0    @768    ACK_PAYLOAD
//      @768    ACK noise protocol message from initiator to responder
// 64             noise protocol message overhead
// 0              encoded ACK_PAYLOAD

const PRIVATE_CRYPT_KEY_OFFSET: usize = 0;
const PRIVATE_CRYPT_KEY_LENGTH: usize = 32;
const PUBLIC_CRYPT_KEY_OFFSET: usize = 32;
const PUBLIC_CRYPT_KEY_LENGTH: usize = 32;
const SIGNING_KEY_OFFSET: usize = 64;
const SIGNING_KEY_LENGTH: usize = 32;
const INITIATOR_VERIFYING_KEY_OFFSET: usize = 128;
const VERIFYING_KEY_LENGTH: usize = 32;
const INITIATOR_SIGNATURE_OFFSET: usize = 160;
const SIGNATURE_LENGTH: usize = 64;
// const FIRST_ENCODING_OFFSET: usize = 226;
// const OTHER_ENCODINGS_OFFSET: usize = 228;
const SYN_PAYLOAD_OFFSET: usize = 128;
const SYN_PAYLOAD_LENGTH: usize = 100;
const SYN_OFFSET: usize = 256;
const SYN_LENGTH: usize = 32 + SYN_PAYLOAD_LENGTH;
const SYNACK_PAYLOAD_OFFSET: usize = 416;
const SYNACK_PAYLOAD_LENGTH: usize = 97;
const SYNACK_OFFSET: usize = 544;
const SYNACK_LENGTH: usize = 96 + SYNACK_PAYLOAD_LENGTH; // 193
const RESPONDER_VERIFYING_KEY_OFFSET: usize = 416;
const RESPONDER_SIGNATURE_OFFSET: usize = 448;
// const ACCEPTED_ENCODING_OFFSET: usize = 512;
const ACK_OFFSET: usize = 768;
const ACK_LENGTH: usize = 64;

unsafe extern "C" {
    fn buffer_callback(buffer: *const u8);
}

unsafe extern "Rust" {
    fn __getrandom_v03_custom(_dest: *mut u8, _len: usize) -> Result<(), getrandom::Error>;
}

#[unsafe(no_mangle)]
fn buffer() {
    unsafe {
        #[allow(static_mut_refs)]
        buffer_callback(BUFFER.as_ptr());
    }
}

#[unsafe(no_mangle)]
fn generate_initiator_keys() {
    unsafe {
        let mut csprng = OsRng;
        let signing_key: SigningKey = SigningKey::generate(&mut csprng);
        let verifying_key: VerifyingKey = signing_key.verifying_key();

        BUFFER[SIGNING_KEY_OFFSET..][..SIGNING_KEY_LENGTH]
            .copy_from_slice(&signing_key.to_bytes().as_slice());
        BUFFER[INITIATOR_VERIFYING_KEY_OFFSET..][..VERIFYING_KEY_LENGTH]
            .copy_from_slice(&verifying_key.to_bytes().as_slice());

        #[allow(static_mut_refs)]
        buffer_callback(BUFFER.as_ptr());
    }
}

#[unsafe(no_mangle)]
fn generate_responder_keys() {
    unsafe {
        let mut csprng = OsRng;
        let signing_key: SigningKey = SigningKey::generate(&mut csprng);
        let verifying_key: VerifyingKey = signing_key.verifying_key();

        BUFFER[SIGNING_KEY_OFFSET..][..SIGNING_KEY_LENGTH]
            .copy_from_slice(&signing_key.to_bytes().as_slice());
        BUFFER[RESPONDER_VERIFYING_KEY_OFFSET..][..VERIFYING_KEY_LENGTH]
            .copy_from_slice(&verifying_key.to_bytes().as_slice());

        #[allow(static_mut_refs)]
        buffer_callback(BUFFER.as_ptr());
    }
}

#[unsafe(no_mangle)]
fn initiator_write_syn() -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let initiator_private_crypt_key = X25519::genkey();
        let initiator_public_crypt_key = X25519::pubkey(&initiator_private_crypt_key);
        BUFFER[PRIVATE_CRYPT_KEY_OFFSET..][..PRIVATE_CRYPT_KEY_LENGTH]
            .copy_from_slice(initiator_private_crypt_key.as_slice());
        BUFFER[PUBLIC_CRYPT_KEY_OFFSET..][..PUBLIC_CRYPT_KEY_LENGTH]
            .copy_from_slice(initiator_public_crypt_key.as_slice());

        let initiator_signing_key =
            SigningKey::try_from(&BUFFER[SIGNING_KEY_OFFSET..][..SIGNING_KEY_LENGTH]).unwrap();
        let signature = initiator_signing_key.sign(initiator_public_crypt_key.as_slice());
        BUFFER[INITIATOR_SIGNATURE_OFFSET..][..SIGNATURE_LENGTH]
            .copy_from_slice(signature.to_bytes().as_slice());

        HS = Some(HandshakeState::new(
            noise_xx(),                        // XX handshake pattern
            true,                              // Initiator
            [],                                // Empty prologue
            Some(initiator_private_crypt_key), // Initiator's private key
            None,                              // Ephemeral key auto-generated
            None,                              // Bob's public key learned during handshake
            None,                              // No pre-shared key
        ));
        let hs = HS.as_mut().unwrap();
        assert!(hs.is_write_turn());
        assert!(hs.get_next_message_overhead() == 32);
        assert!(BUFFER[SYN_OFFSET..][..SYN_LENGTH].len() == SYN_LENGTH);
        match hs.write_message(
            &BUFFER[SYN_PAYLOAD_OFFSET..][..SYN_PAYLOAD_LENGTH],
            &mut BUFFER[SYN_OFFSET..][..SYN_LENGTH],
        ) {
            Err(_) => {
                return 1;
            }
            Ok(()) => (),
        };

        buffer_callback(BUFFER.as_ptr());
        return 0;
    }
}

#[unsafe(no_mangle)]
fn responder_read_syn() -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let responder_private_crypt_key = X25519::genkey();
        let responder_public_crypt_key = X25519::pubkey(&responder_private_crypt_key);
        BUFFER[PRIVATE_CRYPT_KEY_OFFSET..][..PRIVATE_CRYPT_KEY_LENGTH]
            .copy_from_slice(responder_private_crypt_key.as_slice());
        BUFFER[PUBLIC_CRYPT_KEY_OFFSET..][..PUBLIC_CRYPT_KEY_LENGTH]
            .copy_from_slice(responder_public_crypt_key.as_slice());

        let responder_signing_key =
            match SigningKey::try_from(&BUFFER[SIGNING_KEY_OFFSET..][..SIGNING_KEY_LENGTH]) {
                Err(_) => {
                    return 1;
                }
                Ok(key) => key,
            };
        let signature = responder_signing_key.sign(responder_public_crypt_key.as_slice());
        BUFFER[RESPONDER_SIGNATURE_OFFSET..][..SIGNATURE_LENGTH]
            .copy_from_slice(signature.to_bytes().as_slice());

        HS = Some(HandshakeState::new(
            noise_xx(),                        // IK handshake pattern
            false,                             // Responding (not initiating)
            [],                                // Empty prologue
            Some(responder_private_crypt_key), // Responder's private key
            None,                              // Ephemeral key auto-generated
            None,                              // Alice's key learned during handshake
            None,                              // No pre-shared key
        ));
        let hs = HS.as_mut().unwrap();
        assert!(hs.get_next_message_overhead() == 32);
        assert!(!hs.is_write_turn());
        match hs.read_message(
            &BUFFER[SYN_OFFSET..][..SYN_LENGTH],
            &mut BUFFER[SYN_PAYLOAD_OFFSET..][..SYN_PAYLOAD_LENGTH],
        ) {
            Err(_) => {
                return 2;
            }
            Ok(_) => (),
        };

        buffer_callback(BUFFER.as_ptr());
        return 0;
    }
}

#[unsafe(no_mangle)]
fn responder_write_synack() -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let hs = match &mut HS {
            None => return 1,
            Some(hs) => hs,
        };
        assert!(hs.get_next_message_overhead() == 96);
        match hs.write_message(
            &BUFFER[SYNACK_PAYLOAD_OFFSET..][..SYNACK_PAYLOAD_LENGTH],
            &mut BUFFER[SYNACK_OFFSET..][..SYNACK_LENGTH],
        ) {
            Err(_) => {
                return 2;
            }
            Ok(_) => (),
        };

        buffer_callback(BUFFER.as_ptr());
        return 0;
    }
}

#[unsafe(no_mangle)]
fn initiator_read_synack() -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let hs = match &mut HS {
            None => return 1,
            Some(hs) => hs,
        };
        assert!(hs.get_next_message_overhead() == 96);
        match hs.read_message(
            &BUFFER[SYNACK_OFFSET..][..SYNACK_LENGTH],
            &mut BUFFER[SYNACK_PAYLOAD_OFFSET..][..SYNACK_PAYLOAD_LENGTH],
        ) {
            Err(_) => {
                return 2;
            }
            Ok(_) => (),
        }

        let responder_public_crypt_key: [u8; 32] = match hs.get_rs() {
            None => return 3,
            Some(key) => key,
        };

        // Verify that the responder signed its ephemeral public encryption key with its static signing key
        let responder_signature =
            match Signature::try_from(&BUFFER[RESPONDER_SIGNATURE_OFFSET..][..SIGNATURE_LENGTH]) {
                Err(_) => {
                    return 4;
                }
                Ok(signature) => signature,
            };
        let responder_verifying_key = match VerifyingKey::try_from(
            &BUFFER[RESPONDER_VERIFYING_KEY_OFFSET..][..VERIFYING_KEY_LENGTH],
        ) {
            Err(_) => {
                return 5;
            }
            Ok(key) => key,
        };

        // Verify the signature: responder's static key signs the responder's ephemeral public key
        if !responder_verifying_key
            .verify(&responder_public_crypt_key.as_slice(), &responder_signature)
            .is_ok()
        {
            return 6;
        }

        buffer_callback(BUFFER.as_ptr());
        return 0;
    }
}

#[unsafe(no_mangle)]
fn initiator_write_ack() -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let hs = match &mut HS {
            None => return 1,
            Some(hs) => hs,
        };
        assert!(hs.get_next_message_overhead() == 64);
        assert!(hs.is_write_turn());
        match hs.write_message(&[], &mut BUFFER[ACK_OFFSET..][..ACK_LENGTH]) {
            Err(_) => {
                return 1;
            }
            Ok(()) => (),
        };
        assert!(hs.completed());
        let (send_cipher, recv_cipher) = hs.get_ciphers(); // initiator gets (send, recv)
        ENCRYPT = Some(send_cipher); // initiator encrypts with send cipher
        DECRYPT = Some(recv_cipher); // initiator decrypts with recv cipher
                                     //
        buffer_callback(BUFFER.as_ptr());
        return 0;
    }
}

#[unsafe(no_mangle)]
fn responder_read_ack() -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let hs = match &mut HS {
            None => return 1,
            Some(hs) => hs,
        };
        match hs.read_message(&BUFFER[ACK_OFFSET..][..ACK_LENGTH], &mut []) {
            Err(_) => {
                return 2;
            }
            Ok(_) => (),
        }
        assert!(hs.completed());

        // Verify that the initiator signed its static public encryption
        // key with its purported verifying key, establishing that the
        // initiator does in fact hold the corresponding signing key.
        // In Noise XX handshake, after ACK, we can get the initiator's static key
        let initiator_public_crypt_key: [u8; 32] = match hs.get_rs() {
            None => return 3,
            Some(key) => key,
        };
        let initiator_signature =
            match Signature::try_from(&BUFFER[INITIATOR_SIGNATURE_OFFSET..][..SIGNATURE_LENGTH]) {
                Err(_) => {
                    return 4;
                }
                Ok(signature) => signature,
            };
        let initiator_verifying_key = match VerifyingKey::try_from(
            &BUFFER[INITIATOR_VERIFYING_KEY_OFFSET..][..VERIFYING_KEY_LENGTH],
        ) {
            Err(_) => {
                return 5;
            }
            Ok(key) => key,
        };
        if !initiator_verifying_key
            .verify(&initiator_public_crypt_key.as_slice(), &initiator_signature)
            .is_ok()
        {
            return 6;
        }

        let (recv_cipher, send_cipher) = hs.get_ciphers(); // responder gets (recv, send)
        ENCRYPT = Some(send_cipher); // responder encrypts with send cipher
        DECRYPT = Some(recv_cipher); // responder decrypts with recv cipher

        buffer_callback(BUFFER.as_ptr());
        return 0;
    }
}

// BUFFER:
// reads length bytes
// writes length+16 bytes
#[unsafe(no_mangle)]
fn encrypt(length: usize) -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let encrypter = match &mut ENCRYPT {
            None => {
                return 1;
            }
            Some(encrypter) => encrypter,
        };
        encrypter.encrypt_in_place(&mut BUFFER, length);
        buffer_callback(BUFFER.as_ptr());
        return 0;
    }
}

// BUFFER:
// reads length bytes
// writes length-16 bytes
#[unsafe(no_mangle)]
fn decrypt(length: usize) -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let decrypter = match &mut DECRYPT {
            None => {
                return 1;
            }
            Some(decrypter) => decrypter,
        };
        match decrypter.decrypt_in_place(&mut BUFFER, length) {
            Err(_) => {
                return 2;
            }
            Ok(_) => {}
        };
        buffer_callback(BUFFER.as_ptr());
        return 0;
    }
}
