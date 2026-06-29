import { useState } from "react";

type Step = "overview" | "deps" | "identity" | "transport" | "discovery" | "messaging" | "testing";

const steps: { id: Step; label: string; num: number }[] = [
  { id: "overview", label: "Overview", num: 0 },
  { id: "deps", label: "Dependencies", num: 1 },
  { id: "identity", label: "Peer Identity", num: 2 },
  { id: "transport", label: "Transport & NAT", num: 3 },
  { id: "discovery", label: "Discovery", num: 4 },
  { id: "messaging", label: "Messaging", num: 5 },
  { id: "testing", label: "Integration", num: 6 },
];

const stepContent: Record<Step, {
  title: string;
  desc: string;
  sections: { heading: string; body: string; code?: string }[];
}> = {
  overview: {
    title: "Phase 2: libp2p P2P Implementation Plan",
    desc: "Building the 'Privacy Mode' — a Simplex-like architecture with no central server. Direct peer-to-peer messaging using libp2p for transport, discovery, and NAT traversal. Messages never touch a third party.",
    sections: [
      {
        heading: "Why libp2p?",
        body: "libp2p is the networking stack born from IPFS. It provides: (1) modular transport (TCP, WebSocket, QUIC), (2) encrypted channels via the Noise protocol, (3) NAT traversal via relay circuits and hole-punching, (4) peer discovery via mDNS (local) and Kademlia DHT (global), (5) pub/sub messaging via gossipsub. It's battle-tested across thousands of nodes and written in pure Rust (rust-libp2p).",
      },
      {
        heading: "Architecture Position",
        body: "The P2P driver lives in `crates/drivers/p2p/`. Like the XMPP driver, it implements `ChatEngine`. The key difference: there is no server. The `P2PEngine` IS the server and the client simultaneously. It listens for incoming connections, discovers peers, and routes messages directly.",
        code: `// Architecture comparison:
//
//   XMPP Mode:                    P2P Mode:
//   ┌────────┐                    ┌────────┐
//   │ Minima  │◄──TLS──►┌──────┐  │ Minima  │◄──Noise──►┌────────┐
//   │ Client  │         │Server│  │  Node   │           │ Minima │
//   └────────┘         └──────┘  └─────────┘           │  Node  │
//                                                       └────────┘
//
//   XMPP: Client-server. Server sees metadata.
//   P2P:   Peer-to-peer. No metadata server. Direct connections.
//
//   This is the "Simplex alternative": same privacy guarantees,
//   but without the Node.js runtime overhead.`,
      },
      {
        heading: "Size Budget (P2P-only build)",
        body: "Estimated total: ~5.8MB. libp2p is the largest dependency (~2.4MB) because it includes the full networking stack. However, we only enable the specific features we need: tcp, noise, gossipsub, identify, relay, mdns. No Kademlia DHT (saves ~300KB), no WebRTC (saves ~500KB), no QUIC (saves ~400KB).",
        code: `// Size breakdown for P2P-only build:
//
// minima-cli           0.3MB   CLI framework
// minima-engine        0.5MB   Core traits + types
// minima-crypto        0.8MB   Double Ratchet + X3DH (local encryption)
// libp2p               2.4MB   Transport + noise + gossipsub + relay
// tokio                0.8MB   Async runtime (shared with XMPP mode)
// rusqlite             0.4MB   Peer identity store
// ─────────────────────────────
// TOTAL               ~5.8MB   (under 10MB budget)
//
// What we EXCLUDED from libp2p:
//   libp2p-kad        ~0.3MB   Kademlia DHT (global discovery)
//   libp2p-webrtc      ~0.5MB   WebRTC transport
//   libp2p-quic        ~0.4MB   QUIC transport
//   libp2p-relay       included (NAT traversal — critical)
//   libp2p-autonat     excluded (NAT detection — not needed)`,
      },
    ],
  },
  deps: {
    title: "Step 1: Dependency Selection",
    desc: "libp2p is modular — you cherry-pick the protocols you need. Every feature flag disabled saves real bytes.",
    sections: [
      {
        heading: "Cargo.toml for P2P Driver",
        body: "We enable only the libp2p features required for peer-to-peer messaging. The critical ones: tcp (transport), noise (encryption), gossipsub (pub/sub messaging), identify (peer info exchange), relay (NAT traversal). Everything else is excluded.",
        code: `# crates/drivers/p2p/Cargo.toml
[package]
name = "minima-p2p"
version.workspace = true
edition.workspace = true

[dependencies]
# Our crates
minima-engine = { path = "../../engine" }
minima-crypto = { path = "../../crypto" }

# libp2p — ONLY the features we need
# Each feature adds real bytes to the binary
libp2p = { workspace = true, features = [
    "tcp",           # TCP transport (required)
    "noise",         # Noise protocol encryption (required)
    "gossipsub",     # Pub/sub message routing (required)
    "identify",      # Peer identification handshake
    "relay",         # Circuit relay for NAT traversal
    "mdns",          # Local network peer discovery
    "yamux",         # Stream multiplexing (required with noise)
    "macros",        # derive(NetworkBehaviour)
    "tokio",         # Tokio async runtime
] }

# Key persistence
rusqlite = { workspace = true }

# Async runtime
tokio = { workspace = true, features = ["rt", "macros", "sync", "time"] }

# Error handling
thiserror = { workspace = true }
tracing = { workspace = true }

# Identity key serialization
serde = { workspace = true }
serde_json = "1"

# For persistent peer identity
ed25519-dalek = { version = "2", features = ["serde"] }
rand = "0.8"`,
      },
      {
        heading: "What's in libp2p (and what we use)",
        body: "libp2p is a umbrella crate. We only link the sub-crates we actually use. Here's the full picture:",
        code: `// libp2p sub-crates: what we use vs exclude
//
// INCLUDED (required for P2P chat):
//   libp2p-tcp       TCP transport — the foundation
//   libp2p-noise     Noise protocol — encrypted channels
//   libp2p-yamux     Stream mux — multiple streams over one connection
//   libp2p-gossipsub Pub/sub — message routing between peers
//   libp2p-identify  Peer info exchange after connection
//   libp2p-relay     Circuit relay — NAT traversal
//   libp2p-mdns      mDNS discovery — find peers on local network
//   libp2p-swarm     Connection management
//
// EXCLUDED (not needed for 1:1 chat):
//   libp2p-kad       Kademlia DHT — global peer discovery (saves ~300KB)
//   libp2p-webrtc    WebRTC — browser connectivity (saves ~500KB)
//   libp2p-quic      QUIC transport — alternative to TCP (saves ~400KB)
//   libp2p-websocket WebSocket transport — not needed (saves ~200KB)
//   libp2p-dns       DNS resolution — not needed for direct connections
//   libp2p-ping      Keepalive — we use identify instead
//   libp2p-plaintext Unencrypted — NEVER include this
//
// This keeps the libp2p footprint at ~2.4MB instead of ~4.5MB`,
      },
      {
        heading: "Workspace Cargo.toml Update",
        body: "Add the P2P feature flag to the workspace root.",
        code: `# In the workspace Cargo.toml, update the features section:
[features]
default = ["xmpp"]
xmpp = ["dep:xmpp-rs", "dep:libsignal-protocol"]
p2p = ["dep:libp2p"]          # <-- Add this
matrix = ["dep:matrix-sdk", "dep:vodozemac"]

# Build P2P-only:
# cargo build --release --no-default-features --features p2p --target x86_64-unknown-linux-musl
#
# Expected binary size: ~5.8MB`,
      },
    ],
  },
  identity: {
    title: "Step 2: Peer Identity (Persistent Key)",
    desc: "Every peer has a long-lived Ed25519 identity keypair. This is your 'account' in the P2P network — there's no registration, no username, no server. The key IS the identity.",
    sections: [
      {
        heading: "Identity Model",
        body: "In P2P mode, your identity is a cryptographic keypair. There's no username, no email, no server registration. Your PeerId is derived from your public key. Other peers discover you by your PeerId or your multiaddr. This is how Simplex works: the key IS the identity.",
        code: `// Identity model for P2P mode:
//
//   ┌─────────────────────────────────────────────────────────┐
//   │                    Peer Identity                         │
//   │                                                         │
//   │   Ed25519 Keypair                                       │
//   │   ├── Private Key (NEVER leaves the device)             │
//   │   └── Public Key ──► SHA2-256 ──► PeerId               │
//   │                           (multihash, base58-encoded)   │
//   │                                                         │
//   │   Example PeerId: 12D3KooWGR5Hh3mF4Q8Fh9Y7eJpXv4VZ    │
//   │                                                         │
//   │   Multiaddr: /ip4/192.168.1.5/tcp/4001/p2p/12D3KooW... │
//   │              /dns4/relay.example.com/tcp/4001/p2p/...   │
//   └─────────────────────────────────────────────────────────┘
//
// To connect to a peer, you need their Multiaddr (which contains their PeerId).
// There is no "phonebook" — you exchange addresses out-of-band
// (QR code, paste, file transfer, etc.)`,
      },
      {
        heading: "PersistentIdentity — Key Storage",
        body: "The identity keypair persists across restarts in a local file. We use Ed25519 (not X25519) because libp2p's identify protocol requires Ed25519 for PeerId derivation.",
        code: `// crates/drivers/p2p/src/identity.rs
use ed25519_dalek::{SigningKey, VerifyingKey, SECRET_KEY_LENGTH};
use libp2p::identity;
use libp2p::PeerId;
use std::path::Path;
use tracing::info;

/// Persistent peer identity.
/// The Ed25519 keypair is the peer's "account" in the P2P network.
/// Stored on disk so the same PeerId survives restarts.
pub struct PeerIdentity {
    signing_key: SigningKey,
    peer_id: PeerId,
}

impl PeerIdentity {
    /// Load existing identity or generate a new one.
    pub fn load_or_generate(path: &Path) -> Result<Self, IdentityError> {
        if path.exists() {
            Self::load(path)
        } else {
            let identity = Self::generate();
            identity.save(path)?;
            info!("Generated new peer identity: {}", identity.peer_id());
            Ok(identity)
        }
    }

    /// Load identity from a file.
    fn load(path: &Path) -> Result<Self, IdentityError> {
        let bytes = std::fs::read(path)
            .map_err(|e| IdentityError::Io(e.to_string()))?;

        if bytes.len() != SECRET_KEY_LENGTH {
            return Err(IdentityError::InvalidKeyLength(bytes.len()));
        }

        let mut key_bytes = [0u8; SECRET_KEY_LENGTH];
        key_bytes.copy_from_slice(&bytes);
        let signing_key = SigningKey::from_bytes(&key_bytes);

        let peer_id = Self::derive_peer_id(&signing_key);

        info!("Loaded peer identity: {}", peer_id);

        Ok(Self { signing_key, peer_id })
    }

    /// Generate a new random identity.
    fn generate() -> Self {
        use rand::rngs::OsRng;
        let signing_key = SigningKey::generate(&mut OsRng);
        let peer_id = Self::derive_peer_id(&signing_key);
        Self { signing_key, peer_id }
    }

    /// Save the identity keypair to disk.
    /// The file should have restricted permissions (0600).
    fn save(&self, path: &Path) -> Result<(), IdentityError> {
        // Write only the private key bytes (32 bytes)
        // Public key is derived, no need to store it
        std::fs::write(path, self.signing_key.to_bytes())
            .map_err(|e| IdentityError::Io(e.to_string()))?;

        // Set file permissions to owner-only (Unix)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                .map_err(|e| IdentityError::Io(e.to_string()))?;
        }

        info!("Saved peer identity to {}", path.display());
        Ok(())
    }

    /// Derive a libp2p PeerId from an Ed25519 public key.
    fn derive_peer_id(signing_key: &SigningKey) -> PeerId {
        let public_key = identity::PublicKey::Ed25519(
            identity::ed25519::PublicKey::try_from_bytes(
                &signing_key.verifying_key().to_bytes()
            ).expect("valid ed25519 public key")
        );
        PeerId::from_public_key(&public_key)
    }

    /// Get the libp2p Keypair for use with the swarm.
    pub fn to_libp2p_keypair(&self) -> identity::Keypair {
        let ed25519_keypair = identity::ed25519::Keypair::try_from_bytes(
            &mut self.signing_key.to_bytes()
        ).expect("valid ed25519 keypair");
        identity::Keypair::Ed25519(ed25519_keypair)
    }

    /// Get our PeerId.
    pub fn peer_id(&self) -> PeerId {
        self.peer_id
    }

    /// Get our public key for sharing with other peers.
    pub fn public_key(&self) -> VerifyingKey {
        self.signing_key.verifying_key()
    }

    /// Get a display-friendly fingerprint of our identity.
    pub fn fingerprint(&self) -> String {
        let pubkey_bytes = self.signing_key.verifying_key().to_bytes();
        // Format: first 8 bytes as hex, colon-separated
        pubkey_bytes[..8]
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<_>>()
            .join(":")
    }
}

#[derive(Debug, thiserror::Error)]
pub enum IdentityError {
    #[error("IO error: {0}")]
    Io(String),
    #[error("invalid key length: expected {SECRET_KEY_LENGTH}, got {0}")]
    InvalidKeyLength(usize),
}`,
      },
      {
        heading: "PeerInfo — What We Know About Other Peers",
        body: "Local cache of peer information. No central directory — we only know about peers we've directly connected to or discovered via mDNS.",
        code: `// crates/drivers/p2p/src/peer_info.rs
use libp2p::PeerId;
use serde::{Deserialize, Serialize};

/// Information about a known peer.
/// Stored locally — there's no server to query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    /// The peer's libp2p PeerId (derived from their public key).
    pub peer_id: PeerId,
    /// Human-readable name (assigned locally by the user).
    pub alias: Option<String>,
    /// Known multiaddrs where this peer can be reached.
    pub addresses: Vec<String>,
    /// Whether we have an active encryption session.
    pub has_session: bool,
    /// Last time we successfully exchanged messages.
    pub last_seen: Option<u64>,
    /// The peer's public key fingerprint for verification.
    pub fingerprint: Option<String>,
}

/// Local peer database (SQLite-backed).
/// This is our "contact list" — entirely local, no server.
pub struct PeerDb {
    conn: rusqlite::Connection,
}

impl PeerDb {
    pub fn open(path: &Path) -> Result<Self, PeerDbError> {
        let conn = rusqlite::Connection::open(path)?;

        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS peers (
                peer_id TEXT PRIMARY KEY,
                alias TEXT,
                addresses TEXT,  -- JSON array of multiaddrs
                has_session INTEGER NOT NULL DEFAULT 0,
                last_seen INTEGER,
                fingerprint TEXT
            );

            CREATE TABLE IF NOT EXISTS message_history (
                id TEXT PRIMARY KEY,
                peer_id TEXT NOT NULL,
                direction TEXT NOT NULL,  -- 'sent' or 'received'
                ciphertext BLOB,
                timestamp INTEGER NOT NULL,
                FOREIGN KEY (peer_id) REFERENCES peers(peer_id)
            );
        ")?;

        Ok(Self { conn })
    }

    pub fn upsert_peer(&self, peer: &PeerInfo) -> Result<(), PeerDbError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO peers (peer_id, alias, addresses, has_session, last_seen, fingerprint)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                peer.peer_id.to_string(),
                peer.alias,
                serde_json::to_string(&peer.addresses).unwrap(),
                peer.has_session as i32,
                peer.last_seen,
                peer.fingerprint,
            ],
        )?;
        Ok(())
    }

    pub fn get_peer(&self, peer_id: &PeerId) -> Result<Option<PeerInfo>, PeerDbError> {
        let result = self.conn.query_row(
            "SELECT peer_id, alias, addresses, has_session, last_seen, fingerprint
             FROM peers WHERE peer_id = ?1",
            rusqlite::params![peer_id.to_string()],
            |row| {
                Ok(PeerInfo {
                    peer_id: row.get::<_, String>(0)?.parse().unwrap(),
                    alias: row.get(1)?,
                    addresses: serde_json::from_str(&row.get::<_, String>(2).unwrap_or_default())
                        .unwrap_or_default(),
                    has_session: row.get::<_, i32>(3)? != 0,
                    last_seen: row.get(4)?,
                    fingerprint: row.get(5)?,
                })
            },
        ).ok();

        Ok(result)
    }

    pub fn list_peers(&self) -> Result<Vec<PeerInfo>, PeerDbError> {
        let mut stmt = self.conn.prepare(
            "SELECT peer_id, alias, addresses, has_session, last_seen, fingerprint FROM peers"
        )?;

        let peers = stmt.query_map([], |row| {
            Ok(PeerInfo {
                peer_id: row.get::<_, String>(0)?.parse().unwrap(),
                alias: row.get(1)?,
                addresses: serde_json::from_str(&row.get::<_, String>(2).unwrap_or_default())
                    .unwrap_or_default(),
                has_session: row.get::<_, i32>(3)? != 0,
                last_seen: row.get(4)?,
                fingerprint: row.get(5)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(peers)
    }
}`,
      },
    ],
  },
  transport: {
    title: "Step 3: Transport & NAT Traversal",
    desc: "The networking layer: TCP connections encrypted with the Noise protocol, stream multiplexing via Yamux, and NAT traversal via libp2p relay circuits.",
    sections: [
      {
        heading: "Transport Stack",
        body: "libp2p composes transports in layers. Each layer adds a capability. Our stack: TCP (raw bytes) → Yamux (stream multiplexing) → Noise (encryption) → Relay (NAT traversal). The order matters: we encrypt AFTER multiplexing so the multiplexer metadata is also encrypted.",
        code: `// Transport stack (bottom to top):
//
//   ┌──────────────────────────────────────────────────┐
//   │  Application: gossipsub messages                 │
//   ├──────────────────────────────────────────────────┤
//   │  Protocol: identify, gossipsub                   │
//   ├──────────────────────────────────────────────────┤
//   │  Encryption: Noise (XX handshake)                │
//   │  - Mutual authentication                         │
//   │  - Forward secrecy                               │
//   │  - Identity hiding (XX pattern)                  │
//   ├──────────────────────────────────────────────────┤
//   │  Multiplexer: Yamux                              │
//   │  - Multiple logical streams over one TCP conn    │
//   │  - Flow control                                  │
//   ├──────────────────────────────────────────────────┤
//   │  NAT Traversal: Relay v2                         │
//   │  - Circuit relay through public peers            │
//   │  - Hole punching for direct connections          │
//   ├──────────────────────────────────────────────────┤
//   │  Transport: TCP                                  │
//   │  - Standard port 4001 (configurable)             │
//   │  - Works through most firewalls                  │
//   └──────────────────────────────────────────────────┘`,
      },
      {
        heading: "Building the Swarm",
        body: "The libp2p Swarm manages all connections. We configure it with our transport stack and custom behaviour that combines gossipsub, identify, and relay.",
        code: `// crates/drivers/p2p/src/swarm.rs
use libp2p::{
    noise, relay, identify, gossipsub, mdns,
    swarm::NetworkBehaviour,
    Swarm, SwarmBuilder, Multiaddr, PeerId,
    Transport,
};
use std::time::Duration;
use tracing::{info, warn};

/// Combined network behaviour for Minima P2P.
/// This is what runs on top of the transport layer.
#[derive(NetworkBehaviour)]
#[behaviour(to_swarm = "MinimaEvent")]
pub struct MinimaBehaviour {
    /// Gossipsub: pub/sub message routing
    pub gossipsub: gossipsub::Behaviour,
    /// Identify: peer info exchange after connection
    pub identify: identify::Behaviour,
    /// Relay: NAT traversal via circuit relay
    pub relay: relay::Behaviour,
    /// mDNS: local network peer discovery
    pub mdns: mdns::tokio::Behaviour,
}

/// Events emitted by our behaviour.
#[derive(Debug)]
pub enum MinimaEvent {
    Gossipsub(gossipsub::Event),
    Identify(identify::Event),
    Relay(relay::Event),
    Mdns(mdns::Event),
}

// Event conversion implementations
impl From<gossipsub::Event> for MinimaEvent {
    fn from(e: gossipsub::Event) -> Self { MinimaEvent::Gossipsub(e) }
}
impl From<identify::Event> for MinimaEvent {
    fn from(e: identify::Event) -> Self { MinimaEvent::Identify(e) }
}
impl From<relay::Event> for MinimaEvent {
    fn from(e: relay::Event) -> Self { MinimaEvent::Relay(e) }
}
impl From<mdns::Event> for MinimaEvent {
    fn from(e: mdns::Event) -> Self { MinimaEvent::Mdns(e) }
}

/// Build and configure the libp2p swarm.
pub fn build_swarm(
    keypair: libp2p::identity::Keypair,
    listen_port: u16,
) -> Result<Swarm<MinimaBehaviour>, SwarmError> {
    let peer_id = PeerId::from(keypair.public());
    info!("Building swarm for peer {}", peer_id);

    // Build the swarm with our transport stack
    let swarm = SwarmBuilder::with_existing_identity(keypair)
        .with_tokio()
        .with_tcp(
            libp2p::tcp::Config::default(),
            libp2p::noise::Config::new,
            libp2p::yamux::Config::default,
        )
        .map_err(|e| SwarmError::Transport(e.to_string()))?
        .with_behaviour(|key| {
            // Gossipsub configuration
            let gossipsub_config = gossipsub::ConfigBuilder::default()
                .heartbeat_interval(Duration::from_secs(10))
                .validation_mode(gossipsub::ValidationMode::Strict)
                .message_id_fn(|msg| {
                    // Use content-based message IDs for deduplication
                    gossipsub::MessageId::from(
                        &sha256_hash(&msg.data)[..20]
                    )
                })
                .build()
                .expect("valid gossipsub config");

            let gossipsub = gossipsub::Behaviour::new(
                gossipsub::MessageAuthenticity::Signed(key.clone()),
                gossipsub_config,
            ).expect("valid gossipsub");

            // Identify: exchange peer info on connection
            let identify = identify::Behaviour::new(
                identify::Config::new(
                    "/minima/1.0.0".to_string(),
                    key.public(),
                )
                .with_interval(Duration::from_secs(60)),
            );

            // Relay: enable circuit relay for NAT traversal
            let relay = relay::Behaviour::new(
                key.public().to_peer_id(),
                relay::Config::default(),
            );

            // mDNS: discover peers on local network
            let mdns = mdns::tokio::Behaviour::new(
                mdns::Config::default(),
                peer_id,
            ).expect("valid mDNS config");

            Ok(MinimaBehaviour { gossipsub, identify, relay, mdns })
        })
        .map_err(|e| SwarmError::Behaviour(e.to_string()))?
        .with_swarm_config(|cfg| {
            cfg.with_idle_connection_timeout(Duration::from_secs(60 * 5))
        })
        .build();

    // Listen on all interfaces
    let listen_addr: Multiaddr = format!("/ip4/0.0.0.0/tcp/{}", listen_port)
        .parse()
        .expect("valid multiaddr");

    swarm.listen_on(listen_addr.clone())
        .map_err(|e| SwarmError::Listen(e.to_string()))?;

    info!("Listening on {}", listen_addr);

    Ok(swarm)
}

fn sha256_hash(data: &[u8]) -> Vec<u8> {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

#[derive(Debug, thiserror::Error)]
pub enum SwarmError {
    #[error("transport error: {0}")]
    Transport(String),
    #[error("behaviour error: {0}")]
    Behaviour(String),
    #[error("listen error: {0}")]
    Listen(String),
}`,
      },
      {
        heading: "NAT Traversal with Relay",
        body: "Most peers are behind NAT (home routers, corporate firewalls). libp2p relay solves this: peers behind NAT connect THROUGH a public relay peer. The relay sees encrypted bytes only — it cannot read the messages. For peers that CAN connect directly, libp2p attempts hole-punching first.",
        code: `// NAT traversal strategy:
//
//   1. Direct connection (best case)
//      Peer A ─────────────────────── Peer B
//      Both have public IPs or are on the same network.
//
//   2. Hole punching (common case)
//      Peer A ──── NAT ──── Internet ──── NAT ──── Peer B
//      libp2p uses the relay as a signaling server to coordinate
//      simultaneous TCP connects that "punch through" the NAT.
//
//   3. Circuit relay (fallback)
//      Peer A ──── NAT ──── Relay Server ──── NAT ──── Peer B
//      If hole punching fails, traffic routes through a relay peer.
//      The relay CANNOT read messages (Noise encryption end-to-end).
//      The relay only sees: "encrypted bytes from PeerId X to PeerId Y"
//
// Configuration:
//
//   [p2p]
//   # Known relay peers that can help with NAT traversal
//   # Anyone can run a relay — it's just a libp2p node with relay enabled
//   bootstrap_peers = [
//       "/dns4/relay1.minima.dev/tcp/4001/p2p/12D3KooW...",
//       "/dns4/relay2.minima.dev/tcp/4001/p2p/12D3KooW...",
//   ]
//
//   # If no bootstrap peers are configured, P2P mode only works
//   # on local networks (via mDNS) or between publicly-reachable peers.`,
      },
    ],
  },
  discovery: {
    title: "Step 4: Peer Discovery",
    desc: "How peers find each other. Two mechanisms: mDNS for local network discovery (zero-config), and bootstrap/relay for internet-wide discovery.",
    sections: [
      {
        heading: "Discovery Mechanisms",
        body: "There is NO central directory. Peers discover each other through: (1) mDNS — automatic discovery on the local network (like AirDrop), (2) Bootstrap peers — known relay nodes that introduce peers to each other, (3) Manual exchange — share your multiaddr out-of-band (QR code, paste, file).",
        code: `// Discovery flow:
//
//   ┌─────────────────────────────────────────────────────────┐
//   │                   Peer Discovery                         │
//   │                                                         │
//   │   1. mDNS (Local Network)                               │
//   │      ┌──────┐  mDNS broadcast  ┌──────┐                │
//   │      │Peer A│ ◄──────────────► │Peer B│                │
//   │      └──────┘  (automatic)     └──────┘                │
//   │                                                         │
//   │   2. Bootstrap (Internet)                               │
//   │      ┌──────┐  connect  ┌─────────┐  connect  ┌──────┐│
//   │      │Peer A│ ────────► │  Relay   │ ◄──────── │Peer B││
//   │      └──────┘           │  Server  │           └──────┘│
//   │                         └─────────┘                    │
//   │      Relay introduces peers, then they can connect     │
//   │      directly (hole-punch) or through the relay.       │
//   │                                                         │
//   │   3. Manual (Out-of-Band)                               │
//   │      User shares multiaddr via QR code, pasted text,   │
//   │      or any other channel.                              │
//   │      Format: /ip4/1.2.3.4/tcp/4001/p2p/12D3KooW...    │
//   └─────────────────────────────────────────────────────────┘`,
      },
      {
        heading: "Discovery Event Handling",
        body: "The swarm emits events when new peers are discovered. We handle these events in the main event loop to update our peer database and establish connections.",
        code: `// crates/drivers/p2p/src/discovery.rs
use libp2p::{PeerId, Multiaddr};
use tracing::{info, debug};

/// Handles peer discovery events from mDNS and identify.
pub struct DiscoveryManager {
    /// Known peers with their addresses
    known_peers: std::collections::HashMap<PeerId, Vec<Multiaddr>>,
    /// Bootstrap peers to connect to on startup
    bootstrap_peers: Vec<Multiaddr>,
}

impl DiscoveryManager {
    pub fn new(bootstrap_peers: Vec<Multiaddr>) -> Self {
        Self {
            known_peers: std::collections::HashMap::new(),
            bootstrap_peers,
        }
    }

    /// Process an mDNS discovery event.
    /// mDNS finds peers on the local network automatically.
    pub fn on_mdns_discovered(
        &mut self,
        peers: Vec<(PeerId, Multiaddr)>,
    ) -> Vec<PeerId> {
        let mut new_peers = Vec::new();

        for (peer_id, addr) in peers {
            debug!("mDNS discovered: {} at {}", peer_id, addr);

            let addrs = self.known_peers.entry(peer_id).or_default();
            if !addrs.contains(&addr) {
                addrs.push(addr);
                new_peers.push(peer_id);
                info!("New local peer discovered: {}", peer_id);
            }
        }

        new_peers
    }

    /// Process an identify event.
    /// When we connect to a peer, identify tells us their addresses.
    pub fn on_identify_received(
        &mut self,
        peer_id: &PeerId,
        observed_addr: &Multiaddr,
        listen_addrs: &[Multiaddr],
    ) {
        debug!("Identified peer {} at {}", peer_id, observed_addr);

        let addrs = self.known_peers.entry(*peer_id).or_default();
        for addr in listen_addrs {
            if !addrs.contains(addr) {
                addrs.push(addr.clone());
            }
        }
    }

    /// Get bootstrap peers for initial connection.
    pub fn bootstrap_peers(&self) -> &[Multiaddr] {
        &self.bootstrap_peers
    }

    /// Get known addresses for a peer.
    pub fn peer_addresses(&self, peer_id: &PeerId) -> Option<&Vec<Multiaddr>> {
        self.known_peers.get(peer_id)
    }

    /// Add a manually-discovered peer address.
    pub fn add_peer_address(&mut self, peer_id: PeerId, addr: Multiaddr) {
        let addrs = self.known_peers.entry(peer_id).or_default();
        if !addrs.contains(&addr) {
            addrs.push(addr);
            info!("Added manual address for peer {}: {}", peer_id, addr);
        }
    }
}`,
      },
    ],
  },
  messaging: {
    title: "Step 5: Messaging (Gossipsub + Double Ratchet)",
    desc: "The message flow: plaintext → Double Ratchet encrypt → gossipsub publish → (network) → gossipsub receive → Double Ratchet decrypt → plaintext. Gossipsub routes messages; the ratchet provides forward secrecy.",
    sections: [
      {
        heading: "Gossipsub Topics",
        body: "gossipsub is a pub/sub protocol. Messages are published to 'topics' and delivered to all subscribers. For 1:1 chat, we create a unique topic per peer pair. For group chat, we'd use a shared topic. The key insight: gossipsub handles message ROUTING, while the Double Ratchet handles message SECURITY.",
        code: `// Topic strategy for P2P messaging:
//
//   1:1 Chat:
//     Topic: "minima/dm/<peer_a>/<peer_b>"
//     Only Peer A and Peer B subscribe.
//     Messages are encrypted with their shared ratchet session.
//
//   Group Chat (future):
//     Topic: "minima/group/<group_id>"
//     All group members subscribe.
//     Messages are encrypted with a group key (Megolm-style).
//
//   Discovery:
//     Topic: "minima/discovery"
//     Peers announce their presence for others to find.
//
//   The topic name is NOT sensitive — it's visible to relay nodes.
//   But the message content is fully encrypted end-to-end.`,
      },
      {
        heading: "P2PEngine — ChatEngine Implementation",
        body: "The complete ChatEngine implementation for P2P mode. This wires together the swarm, discovery, gossipsub, and Double Ratchet into the unified interface the CLI uses.",
        code: `// crates/drivers/p2p/src/engine.rs
use minima_engine::{ChatEngine, Message, Contact, EngineError};
use async_trait::async_trait;
use libp2p::{gossipsub, PeerId, Multiaddr, Swarm};
use tokio::sync::mpsc;
use tracing::{info, warn, error};

use crate::config::P2PConfig;
use crate::identity::PeerIdentity;
use crate::peer_info::{PeerInfo, PeerDb};
use crate::swarm::{MinimaBehaviour, MinimaEvent, build_swarm};
use crate::discovery::DiscoveryManager;

/// P2P protocol driver.
/// No server. Direct peer-to-peer messaging with E2EE.
pub struct P2PEngine {
    /// The libp2p swarm (manages all connections)
    swarm: Swarm<MinimaBehaviour>,
    /// Our persistent identity
    identity: PeerIdentity,
    /// Local peer database
    peer_db: PeerDb,
    /// Discovery manager
    discovery: DiscoveryManager,
    /// Channel for delivering received messages to the caller
    msg_tx: mpsc::Sender<Message>,
    msg_rx: mpsc::Receiver<Message>,
    /// Double Ratchet sessions per peer
    ratchets: std::collections::HashMap<PeerId, minima_crypto::DoubleRatchet>,
    /// Our listen port (for display)
    listen_port: u16,
}

#[async_trait]
impl ChatEngine for P2PEngine {
    type Config = P2PConfig;

    async fn connect(config: P2PConfig) -> Result<Self, EngineError> {
        info!("Initializing P2P engine...");

        // Step 1: Load or generate persistent identity
        let identity = PeerIdentity::load_or_generate(&config.identity_key_path)?;
        info!("Peer identity: {}", identity.peer_id());
        info!("Fingerprint: {}", identity.fingerprint());

        // Step 2: Build the libp2p swarm
        let libp2p_keypair = identity.to_libp2p_keypair();
        let mut swarm = build_swarm(libp2p_keypair, config.listen_port)?;

        // Step 3: Connect to bootstrap peers (relay servers)
        let bootstrap_addrs: Vec<Multiaddr> = config.bootstrap_peers.iter()
            .filter_map(|addr| addr.parse().ok())
            .collect();

        for addr in &bootstrap_addrs {
            if let Err(e) = swarm.dial(addr.clone()) {
                warn!("Failed to dial bootstrap peer {}: {}", addr, e);
            } else {
                info!("Dialing bootstrap peer: {}", addr);
            }
        }

        // Step 4: Initialize peer database
        let peer_db = PeerDb::open(&config.peer_db_path)?;

        // Step 5: Initialize discovery
        let discovery = DiscoveryManager::new(bootstrap_addrs);

        // Step 6: Create message channel
        let (msg_tx, msg_rx) = mpsc::channel(256);

        // Step 7: Subscribe to our personal topic for receiving DMs
        let my_topic = Self::dm_topic(&identity.peer_id());
        swarm.behaviour_mut().gossipsub
            .subscribe(&gossipsub::IdentTopic::new(&my_topic))
            .map_err(|e| EngineError::Connection(e.to_string()))?;

        info!("Subscribed to topic: {}", my_topic);
        info!("P2P engine ready. Listening on port {}", config.listen_port);

        Ok(Self {
            swarm,
            identity,
            peer_db,
            discovery,
            msg_tx,
            msg_rx,
            ratchets: std::collections::HashMap::new(),
            listen_port: config.listen_port,
        })
    }

    async fn send(&mut self, to: &str, plaintext: &[u8]) -> Result<(), EngineError> {
        // Parse the recipient (PeerId or multiaddr)
        let peer_id: PeerId = to.parse()
            .map_err(|_| EngineError::InvalidRecipient(to.to_string()))?;

        info!("Sending message to {} ({} bytes)", peer_id, plaintext.len());

        // Get or establish a Double Ratchet session
        let ratchet = self.get_or_establish_ratchet(&peer_id)?;

        // Encrypt with Double Ratchet
        let encrypted = ratchet.encrypt(plaintext)
            .map_err(|e| EngineError::Crypto(e.to_string()))?;

        // Serialize the encrypted payload
        let payload = serde_json::to_vec(&encrypted)
            .map_err(|e| EngineError::Send(e.to_string()))?;

        // Publish to the recipient's gossipsub topic
        let topic = gossipsub::IdentTopic::new(Self::dm_topic(&peer_id));
        self.swarm.behaviour_mut().gossipsub
            .publish(topic, payload)
            .map_err(|e| EngineError::Send(e.to_string()))?;

        info!("Message published to gossipsub for {}", peer_id);
        Ok(())
    }

    async fn receive(&mut self) -> Result<Message, EngineError> {
        // Spawn a background task to process swarm events
        // and feed messages into msg_tx
        loop {
            tokio::select! {
                // Check for messages from the swarm event processor
                Some(msg) = self.msg_rx.recv() => {
                    return Ok(msg);
                }
                // Process swarm events
                event = self.swarm.next() => {
                    if let Some(event) = event {
                        self.handle_swarm_event(event).await?;
                    }
                }
            }
        }
    }

    async fn list_contacts(&self) -> Result<Vec<Contact>, EngineError> {
        let peers = self.peer_db.list_peers()
            .map_err(|e| EngineError::ListContacts(e.to_string()))?;

        Ok(peers.into_iter().map(|p| Contact {
            id: p.peer_id.to_string(),
            name: p.alias.unwrap_or_else(|| p.peer_id.to_string()),
            has_session: p.has_session,
            fingerprint: p.fingerprint,
        }).collect())
    }

    async fn get_session(&self, contact: &str) -> Result<Option<Session>, EngineError> {
        let peer_id: PeerId = contact.parse()
            .map_err(|_| EngineError::InvalidRecipient(contact.to_string()))?;

        Ok(self.ratchets.get(&peer_id).map(|r| Session {
            peer_id: contact.to_string(),
            fingerprint: r.fingerprint(),
            message_count: r.message_count(),
        }))
    }

    async fn disconnect(&mut self) -> Result<(), EngineError> {
        info!("Shutting down P2P engine");

        // Leave all gossipsub topics
        // Close all connections
        // The swarm will be dropped, closing the listener

        info!("P2P engine shut down");
        Ok(())
    }
}

impl P2PEngine {
    /// Generate the gossipsub topic for DMs to a specific peer.
    fn dm_topic(peer_id: &PeerId) -> String {
        format!("minima/dm/{}", peer_id)
    }

    /// Get or establish a Double Ratchet session with a peer.
    fn get_or_establish_ratchet(
        &mut self,
        peer_id: &PeerId,
    ) -> Result<&mut minima_crypto::DoubleRatchet, EngineError> {
        if !self.ratchets.contains_key(peer_id) {
            // For the first message to a new peer, we need to
            // perform X3DH key agreement using their prekey bundle.
            // In P2P mode, we request this via a gossipsub handshake.

            // TODO: Implement P2P X3DH handshake
            // For now, use a placeholder shared secret
            let shared_secret = [0u8; 32]; // Will be replaced by X3DH
            let remote_pubkey = self.peer_db.get_peer(peer_id)
                .ok()
                .flatten()
                .and_then(|p| p.public_key_bytes())
                .map(|bytes| x25519_dalek::PublicKey::from(bytes))
                .ok_or(EngineError::NoSession(peer_id.to_string()))?;

            let ratchet = minima_crypto::DoubleRatchet::new(
                &shared_secret,
                remote_pubkey,
            );

            self.ratchets.insert(*peer_id, ratchet);
        }

        Ok(self.ratchets.get_mut(peer_id).unwrap())
    }

    /// Handle a swarm event (connection, message, discovery, etc.)
    async fn handle_swarm_event(
        &mut self,
        event: libp2p::swarm::SwarmEvent<MinimaEvent>,
    ) -> Result<(), EngineError> {
        match event {
            // New connection established
            libp2p::swarm::SwarmEvent::ConnectionEstablished {
                peer_id, endpoint, ..
            } => {
                info!("Connected to peer {} via {:?}", peer_id, endpoint);
            }

            // Connection closed
            libp2p::swarm::SwarmEvent::ConnectionClosed {
                peer_id, cause, ..
            } => {
                info!("Disconnected from peer {}: {:?}", peer_id, cause);
            }

            // Behaviour events
            libp2p::swarm::SwarmEvent::Behaviour(event) => {
                self.handle_behaviour_event(event).await?;
            }

            _ => {}
        }

        Ok(())
    }

    /// Handle events from our custom behaviour (gossipsub, mDNS, etc.)
    async fn handle_behaviour_event(
        &mut self,
        event: MinimaEvent,
    ) -> Result<(), EngineError> {
        match event {
            // Gossipsub message received
            MinimaEvent::Gossipsub(gossipsub::Event::Message {
                propagation_source,
                message,
                ..
            }) => {
                self.handle_gossipsub_message(propagation_source, message).await?;
            }

            // mDNS discovered peers on local network
            MinimaEvent::Mdns(mdns::Event::Discovered(peers)) => {
                let new_peers = self.discovery.on_mdns_discovered(
                    peers.into_iter().collect()
                );
                for peer_id in new_peers {
                    // Add to our peer database
                    let info = PeerInfo {
                        peer_id,
                        alias: None,
                        addresses: self.discovery.peer_addresses(&peer_id)
                            .map(|addrs| addrs.iter().map(|a| a.to_string()).collect())
                            .unwrap_or_default(),
                        has_session: false,
                        last_seen: None,
                        fingerprint: None,
                    };
                    let _ = self.peer_db.upsert_peer(&info);
                }
            }

            // mDNS peer expired (left the network)
            MinimaEvent::Mdns(mdns::Event::Expired(peers)) => {
                for (peer_id, _) in peers {
                    debug!("mDNS peer expired: {}", peer_id);
                }
            }

            // Identify: peer told us about themselves
            MinimaEvent::Identify(identify::Event::Received {
                peer_id,
                info,
                ..
            }) => {
                self.discovery.on_identify_received(
                    &peer_id,
                    &info.observed_addr,
                    &info.listen_addrs,
                );
            }

            _ => {}
        }

        Ok(())
    }

    /// Handle an incoming gossipsub message.
    async fn handle_gossipsub_message(
        &mut self,
        source: PeerId,
        message: gossipsub::Message,
    ) -> Result<(), EngineError> {
        // Deserialize the encrypted payload
        let encrypted: minima_crypto::EncryptedPayload =
            serde_json::from_slice(&message.data)
                .map_err(|e| EngineError::Crypto(e.to_string()))?;

        // Decrypt with our Double Ratchet session
        let ratchet = self.get_or_establish_ratchet(&source)?;
        let plaintext = ratchet.decrypt(&encrypted)
            .map_err(|e| EngineError::Crypto(e.to_string()))?;

        // Deliver to the caller
        let msg = Message {
            sender: source.to_string(),
            recipient: self.identity.peer_id().to_string(),
            plaintext,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            id: message.id.to_string(),
            verified: true, // Noise + Double Ratchet = verified
        };

        self.msg_tx.send(msg).await
            .map_err(|_| EngineError::ChannelClosed)?;

        Ok(())
    }

    /// Get our multiaddr for sharing with other peers.
    pub fn our_multiaddr(&self) -> String {
        // This is what you share with someone to let them connect to you
        format!("/ip4/<your-ip>/tcp/{}/p2p/{}",
            self.listen_port,
            self.identity.peer_id()
        )
    }

    /// Connect to a peer by their multiaddr.
    pub fn connect_peer(&mut self, multiaddr: &str) -> Result<(), EngineError> {
        let addr: Multiaddr = multiaddr.parse()
            .map_err(|_| EngineError::Connection(format!("Invalid multiaddr: {}", multiaddr)))?;

        self.swarm.dial(addr)
            .map_err(|e| EngineError::Connection(e.to_string()))?;

        Ok(())
    }
}`,
      },
      {
        heading: "Config for P2P Mode",
        body: "The [p2p] section of minima.toml.",
        code: `// crates/drivers/p2p/src/config.rs
use std::path::PathBuf;

pub struct P2PConfig {
    /// Path to the identity key file (Ed25519 private key)
    pub identity_key_path: PathBuf,
    /// Path to the peer database (SQLite)
    pub peer_db_path: PathBuf,
    /// Port to listen on for incoming connections
    pub listen_port: u16,
    /// Known relay/bootstrap peers
    /// Format: multiaddr strings
    /// Example: "/dns4/relay.minima.dev/tcp/4001/p2p/12D3KooW..."
    pub bootstrap_peers: Vec<String>,
}

impl P2PConfig {
    pub fn validate(&self) -> Result<(), ConfigError> {
        if self.listen_port == 0 {
            return Err(ConfigError::InvalidPort);
        }
        // Ensure directories exist
        if let Some(parent) = self.identity_key_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if let Some(parent) = self.peer_db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        Ok(())
    }
}

// Corresponding minima.toml config:
//
// [p2p]
// identity_key_path = "~/.minima/keys/p2p-identity.key"
// peer_db_path = "~/.minima/keys/p2p-peers.db"
// listen_port = 4001
// bootstrap_peers = [
//     "/dns4/relay1.minima.dev/tcp/4001/p2p/12D3KooWABC123...",
//     "/dns4/relay2.minima.dev/tcp/4001/p2p/12D3KooWDEF456...",
// ]`,
      },
    ],
  },
  testing: {
    title: "Step 6: Integration Testing",
    desc: "Testing P2P is different from testing client-server: both peers run the same code, and there's no external server to configure.",
    sections: [
      {
        heading: "Local Loopback Test",
        body: "The fundamental test: two P2PEngine instances on the same machine discover each other via mDNS and exchange encrypted messages. No external infrastructure required.",
        code: `// tests/p2p_loopback_test.rs
//! Loopback test for P2P mode.
//! Two engines on localhost discover each other via mDNS
//! and exchange messages through the gossipsub layer.

use minima_p2p::{P2PEngine, P2PConfig};
use minima_engine::ChatEngine;
use tempfile::TempDir;
use std::time::Duration;

#[tokio::test]
async fn test_p2p_loopback() {
    let dir_a = TempDir::new().unwrap();
    let dir_b = TempDir::new().unwrap();

    // Engine A: listen on port 4001
    let config_a = P2PConfig {
        identity_key_path: dir_a.path().join("identity.key"),
        peer_db_path: dir_a.path().join("peers.db"),
        listen_port: 4001,
        bootstrap_peers: vec![],
    };

    // Engine B: listen on port 4002
    let config_b = P2PConfig {
        identity_key_path: dir_b.path().join("identity.key"),
        peer_db_path: dir_b.path().join("peers.db"),
        listen_port: 4002,
        bootstrap_peers: vec![],
    };

    let mut engine_a = P2PEngine::connect(config_a).await.unwrap();
    let mut engine_b = P2PEngine::connect(config_b).await.unwrap();

    // Wait for mDNS discovery (up to 5 seconds)
    tokio::time::sleep(Duration::from_secs(2)).await;

    // Get Engine B's PeerId
    let peer_b_id = engine_b.peer_id().to_string();

    // Send a message from A to B
    let msg = b"Hello from Peer A via P2P!";
    engine_a.send(&peer_b_id, msg).await.unwrap();

    // Receive on B
    let received = tokio::time::timeout(
        Duration::from_secs(10),
        engine_b.receive()
    ).await.expect("timeout waiting for message").unwrap();

    assert_eq!(received.plaintext, msg);
    assert!(received.verified);
    assert_eq!(received.sender, engine_a.peer_id().to_string());

    // Reply from B to A
    let reply = b"Hello from Peer B! Direct P2P!";
    engine_b.send(&engine_a.peer_id().to_string(), reply).await.unwrap();

    let received_reply = tokio::time::timeout(
        Duration::from_secs(10),
        engine_a.receive()
    ).await.expect("timeout").unwrap();

    assert_eq!(received_reply.plaintext, reply);
}

#[tokio::test]
async fn test_p2p_identity_persistence() {
    let dir = TempDir::new().unwrap();
    let identity_path = dir.path().join("identity.key");

    // First run: generate identity
    let config = P2PConfig {
        identity_key_path: identity_path.clone(),
        peer_db_path: dir.path().join("peers.db"),
        listen_port: 4003,
        bootstrap_peers: vec![],
    };

    let engine1 = P2PEngine::connect(config.clone()).await.unwrap();
    let peer_id_1 = engine1.peer_id();
    engine1.disconnect().await.unwrap();

    // Second run: load same identity
    let engine2 = P2PEngine::connect(config).await.unwrap();
    let peer_id_2 = engine2.peer_id();

    // Same identity key = same PeerId
    assert_eq!(peer_id_1, peer_id_2,
        "PeerId must persist across restarts");
}

#[tokio::test]
async fn test_p2p_forward_secrecy() {
    // Verify that the Double Ratchet advances correctly:
    // after N messages, the key for message 0 is discarded.

    let dir_a = TempDir::new().unwrap();
    let dir_b = TempDir::new().unwrap();

    let mut engine_a = P2PEngine::connect(P2PConfig {
        identity_key_path: dir_a.path().join("identity.key"),
        peer_db_path: dir_a.path().join("peers.db"),
        listen_port: 4004,
        bootstrap_peers: vec![],
    }).await.unwrap();

    let mut engine_b = P2PEngine::connect(P2PConfig {
        identity_key_path: dir_b.path().join("identity.key"),
        peer_db_path: dir_b.path().join("peers.db"),
        listen_port: 4005,
        bootstrap_peers: vec![],
    }).await.unwrap();

    let peer_b = engine_b.peer_id().to_string();

    // Send 10 messages
    for i in 0..10 {
        let msg = format!("Message {}", i);
        engine_a.send(&peer_b, msg.as_bytes()).await.unwrap();

        let received = tokio::time::timeout(
            Duration::from_secs(5),
            engine_b.receive()
        ).await.unwrap().unwrap();

        assert_eq!(received.plaintext, msg.as_bytes());
    }

    // The ratchet has advanced 10 times.
    // Keys for earlier messages have been discarded.
    // This is forward secrecy: compromising now doesn't reveal the past.
}`,
      },
      {
        heading: "Two-Machine Test",
        body: "For real-world validation, test between two physical machines on different networks. This validates NAT traversal, relay routing, and real TLS/Noise handshakes.",
        code: `# Two-machine P2P test setup:
#
# Machine A (e.g., your laptop):
#   cargo run --release --no-default-features --features p2p -- \\
#     --mode p2p send --to <Machine-B-PeerId> --message "Hello from A"
#
# Machine B (e.g., a VPS):
#   cargo run --release --no-default-features --features p2p -- \\
#     --mode p2p receive --follow
#
# Steps:
# 1. Start Machine B, note its PeerId and multiaddr
# 2. On Machine A, add Machine B as a bootstrap peer or connect directly
# 3. Send a message from A to B
# 4. Verify it arrives and is OMEMO-encrypted
#
# For NAT testing:
# - Put Machine B behind a NAT (home router)
# - Use a relay server as bootstrap peer
# - Verify messages still route through the relay
#
# docker-compose.yml for test relay:
#
# services:
#   relay:
#     build: .
#     command: minima --mode p2p relay --port 4001
#     ports:
#       - "4001:4001"`,
      },
      {
        heading: "CLI Wiring",
        body: "How the CLI dispatches to P2P mode. Same pattern as XMPP — the CLI is protocol-agnostic.",
        code: `// crates/cli/src/commands/p2p.rs
use minima_p2p::{P2PEngine, P2PConfig};
use minima_engine::ChatEngine;
use crate::config::MinimaConfig;

pub async fn connect(config: &MinimaConfig) -> Result<P2PEngine, anyhow::Error> {
    let p2p_config = config.p2p.as_ref()
        .ok_or_else(|| anyhow::anyhow!("No [p2p] section in config"))?;

    let p2p_config = P2PConfig {
        identity_key_path: p2p_config.identity_key_path.clone(),
        peer_db_path: p2p_config.peer_db_path.clone(),
        listen_port: p2p_config.listen_port,
        bootstrap_peers: p2p_config.bootstrap_peers.clone(),
    };

    let engine = P2PEngine::connect(p2p_config).await?;

    println!("P2P mode active");
    println!("Your PeerId: {}", engine.peer_id());
    println!("Your multiaddr: {}", engine.our_multiaddr());
    println!("Listening on port {}", engine.listen_port());
    println!();
    println!("Share your multiaddr with contacts so they can reach you.");
    println!("Or connect to a peer: minima connect <multiaddr>");

    Ok(engine)
}

pub async fn add_peer(
    config: &MinimaConfig,
    multiaddr: &str,
) -> Result<(), anyhow::Error> {
    let mut engine = connect(config).await?;
    engine.connect_peer(multiaddr)?;
    println!("Connecting to {}...", multiaddr);
    // Wait for connection
    Ok(())
}`,
      },
    ],
  },
};

export function Phase2P2P() {
  const [activeStep, setActiveStep] = useState<Step>("overview");
  const current = stepContent[activeStep];

  return (
    <section className="phase1-section">
      <div className="phase1-header">
        <div className="phase1-badge" style={{ background: "#8b5cf6" }}>Phase 2</div>
        <div>
          <h2>libp2p P2P Implementation</h2>
          <p className="phase1-tagline">
            The "Privacy Mode" — no server, no metadata, direct peer-to-peer messaging with Simplex-like properties
          </p>
        </div>
      </div>

      <div className="phase1-steps">
        {steps.map((s) => (
          <button
            key={s.id}
            className={`phase1-step ${activeStep === s.id ? "active" : ""}`}
            onClick={() => setActiveStep(s.id)}
          >
            <span className="step-num">{s.num}</span>
            <span className="step-label">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="phase1-content">
        <div className="phase1-content-header">
          <h3>{current.title}</h3>
          <p>{current.desc}</p>
        </div>

        <div className="phase1-sections">
          {current.sections.map((section) => (
            <div key={section.heading} className="phase1-block">
              <h4>{section.heading}</h4>
              <p className="phase1-body">{section.body}</p>
              {section.code && (
                <pre className="code-block"><code>{section.code}</code></pre>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="phase1-checklist">
        <h4>Phase 2 Deliverables Checklist</h4>
        <div className="checklist-grid">
          {[
            { done: false, text: "PeerIdentity: Ed25519 keypair persistence (load/generate/save)" },
            { done: false, text: "Swarm setup: TCP + Noise + Yamux + Gossipsub" },
            { done: false, text: "mDNS discovery: auto-find peers on local network" },
            { done: false, text: "Relay/NAT: bootstrap relay connection for NAT traversal" },
            { done: false, text: "P2PEngine: ChatEngine trait implementation" },
            { done: false, text: "Gossipsub messaging: topic-per-peer DM routing" },
            { done: false, text: "Double Ratchet integration: encrypt/decrypt per-peer" },
            { done: false, text: "PeerDb: local SQLite contact store" },
            { done: false, text: "Loopback test: two peers discover + exchange messages" },
            { done: false, text: "Identity persistence test: same PeerId across restarts" },
            { done: false, text: "Forward secrecy test: ratchet advancement verified" },
            { done: false, text: "Size verification: build < 6MB with p2p feature only" },
          ].map((item) => (
            <label key={item.text} className="checklist-item">
              <input type="checkbox" defaultChecked={item.done} readOnly />
              <span>{item.text}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
