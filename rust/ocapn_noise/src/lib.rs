#![no_std]

use noise_protocol::patterns::noise_ik;
use noise_protocol::{HandshakeState, DH, CipherState, U8Array};
use noise_rust_crypto::sensitive::Sensitive;
use noise_rust_crypto::{X25519, ChaCha20Poly1305, Blake2s};

// These bindings are deliberately not thread safe.
// The intention is that the JavaScript driver will create an instance
// of this virtual machine for each OCapN session.
const SIZE: usize = 65535 + 16;
static mut BUFFER: [u8; SIZE] = [0u8; SIZE];
static mut HS: Option<HandshakeState<X25519, ChaCha20Poly1305, Blake2s>> = None;
static mut ENCRYPT: Option<CipherState<ChaCha20Poly1305>> = None;
static mut DECRYPT: Option<CipherState<ChaCha20Poly1305>> = None;

unsafe extern "C" {
    fn genkey_callback(private: *const u8, public: *const u8);
    fn buffer_callback(buffer: *const u8);
}

unsafe extern "Rust" {
    fn __getrandom_v03_custom(
        _dest: *mut u8,
        _len: usize,
    ) -> Result<(), getrandom::Error>;
}

#[unsafe(no_mangle)]
fn genkey() {
    let private = X25519::genkey();
    let public = X25519::pubkey(&private);
    unsafe {
        genkey_callback(private.as_ptr(), public.as_ptr());
    }
}

#[unsafe(no_mangle)]
fn buffer() {
    unsafe {
        #[allow(static_mut_refs)]
        buffer_callback(BUFFER.as_ptr());
    }
}

// BUFFER:
// read 32 initiator private key
// read 32 responder public key
// write 96 initial message to responder
#[unsafe(no_mangle)]
fn syn() -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let initiator_private: Sensitive<[u8; 32]> = U8Array::from_slice(&BUFFER[0..32]);
        let responder_public: [u8; 32] = U8Array::from_slice(&BUFFER[32..64]);
        HS = Some(HandshakeState::new(
            noise_ik(),              // IK handshake pattern
            true,                    // Alice is initiator
            [],                      // Empty prologue
            Some(initiator_private), // Alice's private key
            None,                    // Ephemeral key auto-generated
            Some(responder_public),  // Bob's public key (known beforehand)
            None,                    // No pre-shared key
        ));
        match &mut HS {
            None => {
                return -1; // Should be unreachable
            }
            Some(hs) => {
                assert!(hs.get_next_message_overhead() == 96);
                match hs.write_message(&[], &mut BUFFER[64..64 + 96]) {
                    Err(_) => {
                        return 1;
                    }
                    Ok(()) => (),
                };
                return 0;
            }
        }
    }
}

// BUFFER:
// reads 32 bytes for responder private key
// reads 96 bytes for initiator's first message (syn)
// write 32 bytes for initiator's public key
// write 48 bytes for responder's first message (syn-ack)
#[unsafe(no_mangle)]
fn synack() -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        let responder_private: Sensitive<[u8; 32]> = U8Array::from_slice(&BUFFER[0..32]);
        HS = Some(HandshakeState::new(
            noise_ik(),              // IK handshake pattern
            false,                   // Responding (not initiating)
            [],                      // Empty prologue
            Some(responder_private), // Responder's private key
            None,                    // Ephemeral key auto-generated
            None,                    // Alice's key learned during handshake
            None,                    // No pre-shared key
        ));
        match &mut HS {
            None => {
                return -1;
            }
            Some(hs) => {
                let mut unused = [0u8; 0];
                assert!(hs.get_next_message_overhead() == 96);
                assert!(!hs.is_write_turn());
                match hs.read_message(&mut BUFFER[32..32 + 96], &mut unused) {
                    Err(_) => {
                        return 1;
                    }
                    Ok(_) => (),
                }

                let initiator_public_key: [u8; 32] = match hs.get_rs() {
                    None => return 2,
                    Some(key) => key,
                };
                BUFFER[32 + 96..32 + 96 + 32].copy_from_slice(&initiator_public_key);

                let length = hs.get_next_message_overhead();
                assert!(length == 48);

                match hs.write_message(&[], &mut BUFFER[32 + 96 + 32..32 + 96 + 32 + 48]) {
                    Err(_) => {
                        return 3;
                    }
                    Ok(_) => (),
                }

                assert!(hs.completed());
                let (recv_cipher, send_cipher) = hs.get_ciphers(); // responder gets (recv, send)
                ENCRYPT = Some(send_cipher); // responder encrypts with send cipher
                DECRYPT = Some(recv_cipher); // responder decrypts with recv cipher
            }
        }
        return 0;
    }
}

// read 48 synack
#[unsafe(no_mangle)]
fn ack() -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        match &mut HS {
            None => return 1,
            Some(hs) => {
                let mut unused = [0u8; 0];
                match hs.read_message(&mut BUFFER[0..48], &mut unused) {
                    Err(_) => {
                        return 2;
                    }
                    Ok(_) => (),
                }
                assert!(hs.completed());
                let (send_cipher, recv_cipher) = hs.get_ciphers(); // initiator gets (send, recv)
                ENCRYPT = Some(send_cipher); // initiator encrypts with send cipher
                DECRYPT = Some(recv_cipher); // initiator decrypts with recv cipher
            }
        }
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
        match &mut ENCRYPT {
            Some(encrypter) => {
                encrypter.encrypt_in_place(&mut BUFFER, length);
                return (length + 16) as i32; // ChaCha20Poly1305 adds 16-byte tag
            }
            None => {
                return -1;
            }
        }
    }
}

// BUFFER:
// reads length bytes
// writes length-16 bytes
#[unsafe(no_mangle)]
fn decrypt(length: usize) -> i32 {
    #[allow(static_mut_refs)]
    unsafe {
        match &mut DECRYPT {
            Some(decrypter) => {
                match decrypter.decrypt_in_place(&mut BUFFER, length) {
                    Ok(_) => {
                        return (length - 16) as i32; // ChaCha20Poly1305 removes 16-byte tag
                    }
                    Err(_) => {
                        return -1;
                    }
                }
            }
            None => {
                return -2;
            }
        };
    }
}
