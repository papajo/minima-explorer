export interface ScaffoldFile {
  lang: string;
  code: string;
  desc: string;
}

export const scaffoldFiles: Record<string, ScaffoldFile> = {
  "minima/Cargo.toml": {
    lang: "toml",
    desc: "Workspace root — defines all member crates and shared dependencies.",
    code: `[workspace]
resolver = "2"
members = [
    "crates/cli",
    "crates/engine",
    "crates/crypto",
    "crates/drivers/xmpp",
    "crates/drivers/p2p",
    "crates/drivers/matrix",
]

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "Apache-2.0"
authors = ["Minima Contributors"]

[workspace.dependencies]
# Shared across crates
tokio = { version = "1", features = ["rt", "macros", "sync"] }
serde = { version = "1", features = ["derive"] }
thiserror = "2"
tracing = "0.1"
rusqlite = { version = "0.31", features = ["bundled"] }

# Protocol-specific (gated by features)
xmpp-rs = { version = "0.15", optional = true }
libsignal-protocol = { version = "0.6", optional = true }
libp2p = { version = "0.54", features = ["tcp", "noise", "gossipsub", "identify", "relay", "mdns"], optional = true }
matrix-sdk = { version = "0.7", default-features = false, features = ["native-tls", "sled-state-store"], optional = true }
vodozemac = { version = "0.5", optional = true }

[profile.release]
opt-level = "z"      # Optimize for size
lto = true           # Link-time optimization
codegen-units = 1    # Single codegen unit for max optimization
panic = "abort"      # No unwinding
strip = true         # Remove debug symbols

[features]
default = ["xmpp"]
xmpp = ["dep:xmpp-rs", "dep:libsignal-protocol"]
p2p = ["dep:libp2p"]
matrix = ["dep:matrix-sdk", "dep:vodozemac"]`,
  },
  "minima/crates/engine/src/traits.rs": {
    lang: "rust",
    desc: "The core ChatEngine trait — the universal interface every protocol driver implements.",
    code: `use async_trait::async_trait;
use crate::{Message, Contact, Session};
use crate::error::EngineError;

/// The universal chat interface. Protocol drivers implement this trait.
/// The CLI layer only interacts with ChatEngine — it never touches
/// protocol-specific code directly (Strategy Pattern).
#[async_trait]
pub trait ChatEngine: Send + Sync {
    /// Configuration type specific to this protocol.
    type Config: Send + Sync;

    /// Establish a connection using the provided configuration.
    /// Handles authentication, key exchange, and session setup.
    async fn connect(config: Self::Config) -> Result<Self, EngineError>
    where
        Self: Sized;

    /// Encrypt and send a message to the given recipient.
    /// The plaintext is encrypted using the Double Ratchet before sending.
    async fn send(&mut self, to: &str, plaintext: &[u8]) -> Result<(), EngineError>;

    /// Block until the next message is received.
    /// Returns the decrypted message with metadata.
    async fn receive(&mut self) -> Result<Message, EngineError>;

    /// List all known contacts with their current session state.
    async fn list_contacts(&self) -> Result<Vec<Contact>, EngineError>;

    /// Get the current session state for a contact.
    async fn get_session(&self, contact: &str) -> Result<Option<Session>, EngineError>;

    /// Gracefully disconnect, flushing any pending messages.
    async fn disconnect(&mut self) -> Result<(), EngineError>;
}`,
  },
  "minima/crates/engine/src/message.rs": {
    lang: "rust",
    desc: "Message envelope — the universal message format across all protocols.",
    code: `use serde::{Deserialize, Serialize};

/// A decrypted message with transport metadata.
/// All protocol drivers produce this same type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    /// Who sent this message (protocol-specific identifier).
    pub sender: String,
    /// Who receives this message.
    pub recipient: String,
    /// The decrypted plaintext payload.
    pub plaintext: Vec<u8>,
    /// Unix timestamp (milliseconds) when the message was sent.
    pub timestamp: u64,
    /// Unique message identifier (protocol-specific).
    pub id: String,
    /// Whether this message was successfully decrypted.
    /// False indicates a possible key mismatch or tampering.
    pub verified: bool,
}

/// Wire format for encrypted messages before decryption.
/// What actually travels over the network.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedMessage {
    pub sender: String,
    pub recipient: String,
    pub ciphertext: Vec<u8>,
    pub nonce: Vec<u8>,
    pub ratchet_pubkey: Vec<u8>,
    pub previous_chain_length: u32,
    pub timestamp: u64,
}`,
  },
  "minima/crates/engine/src/lib.rs": {
    lang: "rust",
    desc: "Engine crate root — re-exports the public API.",
    code: `//! minima-engine: Core abstractions for the Minima chat client.
//!
//! This crate defines the \`ChatEngine\` trait and shared types.
//! It contains NO protocol-specific code — that lives in the driver crates.

pub mod traits;
pub mod message;
pub mod contact;
pub mod session;
pub mod error;

pub use traits::ChatEngine;
pub use message::{Message, EncryptedMessage};
pub use contact::Contact;
pub use session::Session;
pub use error::EngineError;`,
  },
  "minima/crates/cli/src/main.rs": {
    lang: "rust",
    desc: "CLI entry point — parses args, loads config, dispatches to the engine.",
    code: `use clap::{Parser, Subcommand};
use minima_engine::ChatEngine;
use std::path::PathBuf;

mod commands;
mod config;
mod output;

use config::MinimaConfig;

#[derive(Parser)]
#[command(name = "minima", version, about = "High-assurance privacy chat for constrained environments")]
struct Cli {
    /// Path to config file (default: ~/.minima/config.toml)
    #[arg(short, long, default_value = "~/.minima/config.toml")]
    config: PathBuf,

    /// Protocol mode to use
    #[arg(short, long, default_value = "xmpp")]
    mode: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Connect and authenticate to the configured server/peer
    Login,
    /// Send an encrypted message
    Send {
        /// Recipient identifier (JID, PeerId, or Matrix ID)
        #[arg(short, long)]
        to: String,
        /// Message body
        message: String,
    },
    /// Listen for incoming messages
    Receive {
        /// Run in continuous mode (don't exit after first message)
        #[arg(short, long)]
        follow: bool,
    },
    /// List known contacts and their session status
    ListContacts,
    /// Verify a contact's identity key
    Verify {
        /// Contact to verify
        contact: String,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let config = MinimaConfig::load(&cli.config)?;

    match cli.command {
        Commands::Login => commands::login(&config, &cli.mode).await,
        Commands::Send { to, message } => {
            commands::send(&config, &cli.mode, &to, message.as_bytes()).await
        }
        Commands::Receive { follow } => {
            commands::receive(&config, &cli.mode, follow).await
        }
        Commands::ListContacts => {
            commands::list_contacts(&config, &cli.mode).await
        }
        Commands::Verify { contact } => {
            commands::verify(&config, &cli.mode, &contact).await
        }
    }
}`,
  },
  "minima/crates/cli/src/config.rs": {
    lang: "rust",
    desc: "Configuration loader — reads ~/.minima/config.toml with per-mode sections.",
    code: `use serde::Deserialize;
use std::path::{Path, PathBuf};
use anyhow::Context;

#[derive(Debug, Deserialize)]
pub struct MinimaConfig {
    pub default_mode: Option<String>,
    pub xmpp: Option<XmppConfig>,
    pub p2p: Option<P2PConfig>,
    pub matrix: Option<MatrixConfig>,
}

#[derive(Debug, Deserialize)]
pub struct XmppConfig {
    pub server: String,
    pub port: u16,
    pub jid: String,
    pub password: String,
    pub key_store_path: PathBuf,
}

#[derive(Debug, Deserialize)]
pub struct P2PConfig {
    pub identity_key_path: PathBuf,
    pub bootstrap_peers: Vec<String>,
    pub listen_port: u16,
}

#[derive(Debug, Deserialize)]
pub struct MatrixConfig {
    pub homeserver: String,
    pub user_id: String,
    pub password: String,
    pub state_dir: PathBuf,
}

impl MinimaConfig {
    pub fn load(path: &Path) -> anyhow::Result<Self> {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read config: {}", path.display()))?;
        toml::from_str(&content)
            .with_context(|| "Failed to parse config TOML")
    }
}`,
  },
  "minima/crates/crypto/src/ratchet.rs": {
    lang: "rust",
    desc: "Double Ratchet implementation — forward secrecy for all modes.",
    code: `use x25519_dalek::{EphemeralSecret, PublicKey};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;
use hkdf::Hkdf;
use sha2::Sha256;

/// Double Ratchet state for a single session.
/// Provides forward secrecy: compromising a current key
/// does not compromise past or future messages.
pub struct DoubleRatchet {
    /// Current root key (updated with each DH ratchet step)
    root_key: [u8; 32],
    /// Current sending chain key
    sending_chain: Option<[u8; 32]>,
    /// Current receiving chain key
    receiving_chain: Option<[u8; 32]>,
    /// Our current ratchet keypair
    ratchet_secret: EphemeralSecret,
    ratchet_public: PublicKey,
    /// The remote party's current ratchet public key
    remote_public: PublicKey,
    /// Number of messages in the current sending chain
    send_count: u32,
    /// Number of messages in the current receiving chain
    recv_count: u32,
    /// Previous chain length (for out-of-order message handling)
    prev_chain_len: u32,
}

impl DoubleRatchet {
    /// Initialize from a shared secret (output of X3DH).
    pub fn new(shared_secret: &[u8; 32], remote_pubkey: PublicKey) -> Self {
        let secret = EphemeralSecret::random_from_rng(rand::thread_rng());
        let public = PublicKey::from(&secret);

        let mut root_key = [0u8; 32];
        let dh_output = secret.diffie_hellman(&remote_pubkey);
        let hk = Hkdf::<Sha256>::new(Some(shared_secret), dh_output.as_bytes());
        hk.expand(b"minima-ratchet-init", &mut root_key).unwrap();

        Self {
            root_key,
            sending_chain: None,
            receiving_chain: None,
            ratchet_secret: secret,
            ratchet_public: public,
            remote_public: remote_pubkey,
            send_count: 0,
            recv_count: 0,
            prev_chain_len: 0,
        }
    }

    /// Encrypt a plaintext message. Advances the sending chain.
    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<EncryptedPayload, CryptoError> {
        let chain_key = self.sending_chain.get_or_insert_with(|| {
            self.kdf_chain(self.root_key, b"sending")
        });

        let (message_key, new_chain) = self.kdf_message(chain_key);
        *chain_key = new_chain;

        let cipher = Aes256Gcm::new_from_slice(&message_key)
            .map_err(|_| CryptoError::KeyInitFailed)?;
        let nonce = self.generate_nonce();
        let ciphertext = cipher.encrypt(Nonce::from_slice(&nonce), plaintext)
            .map_err(|_| CryptoError::EncryptionFailed)?;

        self.send_count += 1;

        Ok(EncryptedPayload {
            ciphertext,
            nonce: nonce.to_vec(),
            ratchet_pubkey: self.ratchet_public.to_bytes().to_vec(),
            chain_index: self.send_count - 1,
            prev_chain_len: self.prev_chain_len,
        })
    }

    fn kdf_chain(&self, key: [u8; 32], info: &[u8]) -> [u8; 32] {
        let hk = Hkdf::<Sha256>::new(Some(&key), &[]);
        let mut output = [0u8; 32];
        hk.expand(info, &mut output).unwrap();
        output
    }

    fn kdf_message(&self, chain_key: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
        let hk = Hkdf::<Sha256>::new(Some(chain_key), &[]);
        let mut mk = [0u8; 32];
        let mut ck = [0u8; 32];
        hk.expand(b"message-key", &mut mk).unwrap();
        hk.expand(b"chain-key", &mut ck).unwrap();
        (mk, ck)
    }

    fn generate_nonce(&self) -> [u8; 12] {
        use rand::RngCore;
        let mut nonce = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce);
        nonce
    }
}`,
  },
  "minima/crates/crypto/src/x3dh.rs": {
    lang: "rust",
    desc: "X3DH key agreement — establishes initial shared secret between two parties.",
    code: `use x25519_dalek::{EphemeralSecret, PublicKey, SharedSecret};

/// X3DH (Extended Triple Diffie-Hellman) key agreement.
///
/// Produces a shared secret from identity keys and ephemeral keys.
/// Used once per session to bootstrap the Double Ratchet.
///
/// Protocol flow:
///   Alice (initiator)                     Bob (responder)
///   ─────────────────                     ──────────────
///   Has: IK_a, EK_a                       Has: IK_b, PK_b (signed prekey)
///   Computes:                             Verifies:
///     DH1 = DH(IK_a, PK_b)                 DH1 = DH(PK_b, IK_a)
///     DH2 = DH(EK_a, IK_b)                 DH2 = DH(IK_b, EK_a)
///     DH3 = DH(EK_a, PK_b)                 DH3 = DH(PK_b, EK_a)
///     SK = KDF(DH1 || DH2 || DH3)           SK = KDF(DH1 || DH2 || DH3)

pub struct X3DHKeys {
    pub identity_secret: EphemeralSecret,
    pub identity_public: PublicKey,
    pub ephemeral_secret: Option<EphemeralSecret>,
    pub ephemeral_public: Option<PublicKey>,
}

pub struct PreKeyBundle {
    pub identity_key: PublicKey,
    pub signed_prekey: PublicKey,
    pub prekey_signature: Vec<u8>,
}

/// Perform the X3DH agreement as the initiator (Alice).
pub fn x3dh_init(
    alice: &X3DHKeys,
    bob_bundle: &PreKeyBundle,
) -> Result<(SharedSecret, PublicKey), X3DHError> {
    let ephemeral = alice.ephemeral_secret.as_ref()
        .ok_or(X3DHError::NoEphemeralKey)?;

    // DH1: Alice's identity × Bob's signed prekey
    let dh1 = alice.identity_secret.diffie_hellman(&bob_bundle.signed_prekey);

    // DH2: Alice's ephemeral × Bob's identity
    let dh2 = ephemeral.diffie_hellman(&bob_bundle.identity_key);

    // DH3: Alice's ephemeral × Bob's signed prekey
    let dh3 = ephemeral.diffie_hellman(&bob_bundle.signed_prekey);

    // Concatenate and derive
    let mut ikm = Vec::with_capacity(96);
    ikm.extend_from_slice(dh1.as_bytes());
    ikm.extend_from_slice(dh2.as_bytes());
    ikm.extend_from_slice(dh3.as_bytes());

    let shared = derive_shared_secret(&ikm);
    let ephemeral_pub = PublicKey::from(ephemeral);

    Ok((shared, ephemeral_pub))
}

fn derive_shared_secret(ikm: &[u8]) -> SharedSecret {
    use hkdf::Hkdf;
    use sha2::Sha256;
    // Use HKDF to derive final shared secret
    let hk = Hkdf::<Sha256>::new(Some(&[0u8; 32]), ikm);
    let mut okm = [0u8; 32];
    hk.expand(b"minima-x3dh", &mut okm).unwrap();
    // Construct SharedSecret from bytes
    SharedSecret::from(okm)
}`,
  },
  "minima/crates/drivers/xmpp/src/lib.rs": {
    lang: "rust",
    desc: "XMPP driver — implements ChatEngine for XMPP+OMEMO.",
    code: `//! XMPP protocol driver with OMEMO end-to-end encryption.
//!
//! Connects to standard XMPP servers. Messages are encrypted
//! using the OMEMO extension (Double Ratchet over XMPP message stanzas).

use minima_engine::{ChatEngine, Message, Contact, EngineError};
use async_trait::async_trait;
use crate::omemo::OmemoSession;
use crate::stanza::StanzaBuilder;

mod omemo;
mod stanza;

pub struct XmppConfig {
    pub server: String,
    pub port: u16,
    pub jid: String,
    pub password: String,
    pub key_store_path: String,
}

pub struct XmppEngine {
    // xmpp_rs client for XMPP protocol handling
    client: xmpp_rs::Client,
    // OMEMO session for E2EE
    omemo: OmemoSession,
    // SQLite store for keys and message cache
    store: rusqlite::Connection,
}

#[async_trait]
impl ChatEngine for XmppEngine {
    type Config = XmppConfig;

    async fn connect(config: XmppConfig) -> Result<Self, EngineError> {
        // Connect to XMPP server
        let client = xmpp_rs::Client::builder()
            .server(&config.server, config.port)
            .jid(&config.jid)
            .password(&config.password)
            .connect()
            .await
            .map_err(|e| EngineError::Connection(e.to_string()))?;

        // Open SQLite key store
        let store = rusqlite::Connection::open(&config.key_store_path)
            .map_err(|e| EngineError::Storage(e.to_string()))?;

        // Initialize or load OMEMO session
        let omemo = OmemoSession::load_or_init(&store, &config.jid)?;

        Ok(Self { client, omemo, store })
    }

    async fn send(&mut self, to: &str, plaintext: &[u8]) -> Result<(), EngineError> {
        // Encrypt with OMEMO
        let encrypted = self.omemo.encrypt(to, plaintext).await?;

        // Build and send XMPP message stanza
        let stanza = StanzaBuilder::message(to, encrypted)?;
        self.client.send_stanza(stanza).await
            .map_err(|e| EngineError::Send(e.to_string()))?;

        Ok(())
    }

    async fn receive(&mut self) -> Result<Message, EngineError> {
        loop {
            let stanza = self.client.next_stanza().await
                .map_err(|e| EngineError::Receive(e.to_string()))?;

            // Only process encrypted message stanzas
            if let Some(encrypted) = stanza.extract_omemo_payload() {
                let plaintext = self.omemo.decrypt(&encrypted).await?;
                return Ok(Message {
                    sender: stanza.from().to_string(),
                    recipient: stanza.to().to_string(),
                    plaintext,
                    timestamp: stanza.timestamp(),
                    id: stanza.id().to_string(),
                    verified: true,
                });
            }
        }
    }

    async fn list_contacts(&self) -> Result<Vec<Contact>, EngineError> {
        // Query roster from server
        let roster = self.client.get_roster().await
            .map_err(|e| EngineError::ListContacts(e.to_string()))?;

        Ok(roster.into_iter().map(|item| Contact {
            id: item.jid.to_string(),
            name: item.name.unwrap_or_default(),
            has_session: self.omemo.has_session(&item.jid),
            fingerprint: self.omemo.fingerprint(&item.jid),
        }).collect())
    }

    async fn disconnect(&mut self) -> Result<(), EngineError> {
        self.client.disconnect().await
            .map_err(|e| EngineError::Disconnect(e.to_string()))
    }
}`,
  },
  "minima/crates/drivers/p2p/src/lib.rs": {
    lang: "rust",
    desc: "P2P driver — implements ChatEngine using libp2p for direct peer connections.",
    code: `//! Peer-to-peer protocol driver using libp2p.
//!
//! No central server. Messages go directly between peers.
//! Uses gossipsub for message routing, noise for encryption,
//! and relay circuits for NAT traversal.

use minima_engine::{ChatEngine, Message, Contact, EngineError};
use async_trait::async_trait;
use libp2p::{gossipsub, noise, Swarm, Multiaddr, PeerId};
use tokio::sync::mpsc;

mod behaviour;
mod discovery;
mod relay;

use behaviour::MinimaBehaviour;

pub struct P2PConfig {
    pub identity_key_path: String,
    pub bootstrap_peers: Vec<String>,
    pub listen_port: u16,
}

pub struct P2PEngine {
    swarm: Swarm<MinimaBehaviour>,
    msg_tx: mpsc::Sender<Message>,
    msg_rx: mpsc::Receiver<Message>,
    // Double Ratchet state per peer
    ratchets: std::collections::HashMap<PeerId, minima_crypto::DoubleRatchet>,
}

#[async_trait]
impl ChatEngine for P2PEngine {
    type Config = P2PConfig;

    async fn connect(config: P2PConfig) -> Result<Self, EngineError> {
        // Load or generate identity keypair
        let keypair = minima_crypto::load_identity(&config.identity_key_path)?;

        // Build libp2p swarm with required protocols
        let swarm = libp2p::SwarmBuilder::with_existing_identity(keypair)
            .with_tokio()
            .with_tcp(
                libp2p::tcp::Config::default(),
                libp2p::noise::Config::new,
                libp2p::yamux::Config::default,
            )
            .map_err(|e| EngineError::Connection(e.to_string()))?
            .with_behaviour(|key| MinimaBehaviour::new(key))
            .map_err(|e| EngineError::Connection(e.to_string()))?
            .build();

        // Listen on configured port
        swarm.listen_on(format!("/ip4/0.0.0.0/tcp/{}", config.listen_port).parse()?)
            .map_err(|e| EngineError::Connection(e.to_string()))?;

        // Connect to bootstrap/relay peers
        for addr in &config.bootstrap_peers {
            let addr: Multiaddr = addr.parse()
                .map_err(|e| EngineError::Connection(e.to_string()))?;
            swarm.dial(addr)
                .map_err(|e| EngineError::Connection(e.to_string()))?;
        }

        let (msg_tx, msg_rx) = mpsc::channel(256);

        Ok(Self { swarm, msg_tx, msg_rx, ratchets: Default::default() })
    }

    async fn send(&mut self, to: &str, plaintext: &[u8]) -> Result<(), EngineError> {
        let peer_id: PeerId = to.parse()
            .map_err(|_| EngineError::InvalidRecipient(to.to_string()))?;

        // Get or establish ratchet session
        let ratchet = self.ratchets.get_mut(&peer_id)
            .ok_or(EngineError::NoSession(to.to_string()))?;

        // Encrypt with Double Ratchet
        let encrypted = ratchet.encrypt(plaintext)?;

        // Publish to gossipsub topic for this peer
        let topic = gossipsub::IdentTopic::new(format!("minima/{}", peer_id));
        self.swarm.behaviour_mut().gossipsub
            .publish(topic, encrypted.to_bytes())
            .map_err(|e| EngineError::Send(e.to_string()))?;

        Ok(())
    }

    async fn receive(&mut self) -> Result<Message, EngineError> {
        // Check the message channel (fed by swarm event loop)
        self.msg_rx.recv().await
            .ok_or(EngineError::ChannelClosed)
    }

    async fn list_contacts(&self) -> Result<Vec<Contact>, EngineError> {
        Ok(self.ratchets.iter().map(|(peer_id, ratchet)| {
            Contact {
                id: peer_id.to_string(),
                name: String::new(), // No central directory in P2P
                has_session: true,
                fingerprint: ratchet.fingerprint(),
            }
        }).collect())
    }

    async fn disconnect(&mut self) -> Result<(), EngineError> {
        // Graceful: notify peers, flush pending
        Ok(())
    }
}`,
  },
  "minima/crates/drivers/matrix/src/lib.rs": {
    lang: "rust",
    desc: "Matrix driver — implements ChatEngine using the Matrix SDK (headless, no UI).",
    code: `//! Matrix protocol driver (lite implementation).
//!
//! Uses matrix-sdk with all UI components stripped.
//! Connects to standard Matrix homeservers for federated chat.

use minima_engine::{ChatEngine, Message, Contact, EngineError};
use async_trait::async_trait;
use matrix_sdk::{Client, config::SyncSettings};
use matrix_sdk::ruma::{UserId, OwnedRoomId};

mod sync;
mod rooms;

pub struct MatrixConfig {
    pub homeserver: String,
    pub user_id: String,
    pub password: String,
    pub state_dir: String,
}

pub struct MatrixEngine {
    client: Client,
    sync_handle: Option<tokio::task::JoinHandle<()>>,
    msg_rx: mpsc::Receiver<Message>,
}

#[async_trait]
impl ChatEngine for MatrixEngine {
    type Config = MatrixConfig;

    async fn connect(config: MatrixConfig) -> Result<Self, EngineError> {
        // Build headless Matrix client (no UI dependencies)
        let client = Client::builder()
            .homeserver_url(&config.homeserver)
            .sled_store(&config.state_dir, None)
            .await
            .map_err(|e| EngineError::Connection(e.to_string()))?;

        // Login with password
        client.login_username(&config.user_id, &config.password)
            .send()
            .await
            .map_err(|e| EngineError::Auth(e.to_string()))?;

        // Enable E2EE
        client.encryption().enable_cross_process_store_lock()
            .await
            .map_err(|e| EngineError::Crypto(e.to_string()))?;

        // Start background sync
        let (msg_tx, msg_rx) = mpsc::channel(256);
        let sync_client = client.clone();
        let sync_handle = tokio::spawn(async move {
            sync::background_sync(sync_client, msg_tx).await;
        });

        Ok(Self { client, sync_handle: Some(sync_handle), msg_rx })
    }

    async fn send(&mut self, to: &str, plaintext: &[u8]) -> Result<(), EngineError> {
        let room_id: OwnedRoomId = to.try_into()
            .map_err(|_| EngineError::InvalidRecipient(to.to_string()))?;

        let room = self.client.get_room(&room_id)
            .ok_or(EngineError::RoomNotFound(to.to_string()))?;

        let text = String::from_utf8(plaintext.to_vec())
            .map_err(|_| EngineError::InvalidPayload)?;
        let content = matrix_sdk::ruma::events::room::message::RoomMessageEventContent::text_plain(text);

        room.send(content).await
            .map_err(|e| EngineError::Send(e.to_string()))?;

        Ok(())
    }

    async fn receive(&mut self) -> Result<Message, EngineError> {
        self.msg_rx.recv().await
            .ok_or(EngineError::ChannelClosed)
    }

    async fn list_contacts(&self) -> Result<Vec<Contact>, EngineError> {
        let rooms = self.client.rooms();
        Ok(rooms.iter().map(|room| Contact {
            id: room.room_id().to_string(),
            name: room.display_name().await
                .unwrap_or_default()
                .to_string(),
            has_session: room.is_encrypted(),
            fingerprint: None,
        }).collect())
    }

    async fn disconnect(&mut self) -> Result<(), EngineError> {
        if let Some(handle) = self.sync_handle.take() {
            handle.abort();
        }
        self.client.logout().await
            .map_err(|e| EngineError::Disconnect(e.to_string()))?;
        Ok(())
    }
}`,
  },
  "minima/config/minima.toml.example": {
    lang: "toml",
    desc: "Example configuration file with per-mode sections.",
    code: `# Minima Configuration
# Copy to ~/.minima/config.toml and fill in your credentials.

default_mode = "xmpp"

[xmpp]
server = "xmpp.example.com"
port = 5222
jid = "user@xmpp.example.com"
password = "CHANGEME"
key_store_path = "~/.minima/keys/xmpp.db"

[p2p]
identity_key_path = "~/.minima/keys/p2p-identity.key"
listen_port = 4001
bootstrap_peers = [
    "/ip4/relay1.example.com/tcp/4001/p2p/12D3KooW...",
    "/ip4/relay2.example.com/tcp/4001/p2p/12D3KooW...",
]

[matrix]
homeserver = "https://matrix.example.com"
user_id = "@user:example.com"
password = "CHANGEME"
state_dir = "~/.minima/state/matrix"`,
  },
};
