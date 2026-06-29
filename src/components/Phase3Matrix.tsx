import { useState } from "react";

type Step = "overview" | "deps" | "sync" | "rooms" | "messaging" | "encryption" | "testing";

const steps: { id: Step; label: string; num: number }[] = [
  { id: "overview", label: "Overview", num: 0 },
  { id: "deps", label: "Dependencies", num: 1 },
  { id: "sync", label: "Sync Loop", num: 2 },
  { id: "rooms", label: "Rooms", num: 3 },
  { id: "messaging", label: "Messaging", num: 4 },
  { id: "encryption", label: "E2EE", num: 5 },
  { id: "testing", label: "Integration", num: 6 },
];

const stepContent: Record<Step, {
  title: string;
  desc: string;
  sections: { heading: string; body: string; code?: string }[];
}> = {
  overview: {
    title: "Phase 3: Matrix-Lite Implementation Plan",
    desc: "Building the 'Community Mode' — federated chat with group rooms, server-side history, and bridges to other platforms. Uses the Matrix protocol with the Rust SDK, stripped of all UI components.",
    sections: [
      {
        heading: "Why Matrix?",
        body: "Matrix is a federated protocol for real-time communication. Unlike XMPP (1:1 focused) or P2P (no server), Matrix excels at: group rooms with thousands of members, server-side message history (offline delivery), federation (any homeserver can talk to any other), bridges to Slack/Discord/IRC/Telegram, and well-specified E2EE via Olm (1:1) and Megolm (groups). The trade-off: it's the heaviest mode (~6.1MB).",
      },
      {
        heading: "The 'Lite' Approach",
        body: "The standard Matrix SDK (matrix-rust-sdk) includes everything: a full sync engine, state store, E2EE, push notifications, room state management, and more. We use it headless — no UI crate, no FFI bindings, no WASM target. We enable only the features we need: native-tls, sled-state-store, e2e-encryption. We disable: the full emoji verification flow (saves ~200KB), room upgrade handling, spaces.",
        code: `// What "Matrix-Lite" means:
//
//   Full Element Client:
//   ┌──────────────────────────────────────────────────┐
//   │  UI Layer: React/Flutter widgets, themes, i18n   │ ~15MB
//   │  Matrix SDK: sync, rooms, E2EE, push, spaces     │ ~8MB
//   │  Crypto: Olm, Megolm, key verification           │ ~3MB
//   │  Transport: HTTPS, WebSocket, /sync              │ ~2MB
//   └──────────────────────────────────────────────────┘   ~28MB total
//
//   Matrix-Lite (Minima):
//   ┌──────────────────────────────────────────────────┐
//   │  Matrix SDK (headless): sync, rooms, E2EE        │ ~2.8MB
//   │  Crypto: vodozemac (Olm/Megolm)                  │ ~0.9MB
//   │  Transport: reqwest (rustls)                     │ ~0.6MB
//   │  State: sled (embedded key-value)                │ ~0.5MB
//   │  Minima engine + CLI                             │ ~1.3MB
//   └──────────────────────────────────────────────────┘   ~6.1MB total
//
//   We strip: UI, emoji verification, spaces, push notifications,
//   widget integration, FFI layer, WASM target, room upgrade logic`,
      },
      {
        heading: "Architecture Position",
        body: "Same pattern as XMPP and P2P: `crates/drivers/matrix/` implements `ChatEngine`. The CLI never sees Matrix-specific types. The difference: Matrix has a persistent server, so the sync model is fundamentally different — we poll for updates rather than receiving them in real-time.",
        code: `// Architecture comparison across all three modes:
//
//   XMPP:     CLI ──► Engine ──► XmppEngine ──► xmpp-rs ──► Server
//   P2P:      CLI ──► Engine ──► P2PEngine  ──► libp2p  ──► Peer
//   Matrix:   CLI ──► Engine ──► MatrixEngine──► matrix-sdk──► Homeserver
//
//   All three implement the same ChatEngine trait.
//   The CLI doesn't know or care which mode is active.
//
//   Key difference in message flow:
//   XMPP:   Real-time push from server (long-lived XML stream)
//   P2P:    Real-time push from peers (gossipsub subscriptions)
//   Matrix: Polling via /sync endpoint (HTTP long-poll, ~30s intervals)`,
      },
    ],
  },
  deps: {
    title: "Step 1: Dependency Selection",
    desc: "matrix-rust-sdk is the official Rust SDK for Matrix. We use it with minimal features and the headless (no-UI) configuration.",
    sections: [
      {
        heading: "Cargo.toml for Matrix Driver",
        body: "We enable only the features needed for headless Matrix chat. The critical ones: native-tls (HTTPS to homeservers), sled-state-store (local state persistence), e2e-encryption (Olm/Megolm).",
        code: `# crates/drivers/matrix/Cargo.toml
[package]
name = "minima-matrix"
version.workspace = true
edition.workspace = true

[dependencies]
# Our crates
minima-engine = { path = "../../engine" }

# Matrix SDK — headless configuration
# NO UI crate, NO FFI, NO WASM
matrix-sdk = { workspace = true }

# Matrix crypto (Olm/Megolm) — standalone
# matrix-sdk depends on this, but we pin the version
vodozemac = { workspace = true }

# HTTP client for Matrix API calls
reqwest = { version = "0.12", default-features = false, features = [
    "rustls-tls",   # Use rustls, NOT OpenSSL
    "json",          # JSON serde for Matrix API
    "gzip",          # Compress /sync responses
] }

# Matrix types (events, room IDs, user IDs, etc.)
# This is pulled in by matrix-sdk, but we pin for stability
ruma = { version = "0.10", features = [
    "client-api-c",
    "compat-user-id",
] }

# Async runtime
tokio = { workspace = true }

# State store (sled — embedded key-value DB)
# Alternative: sqlite via rusqlite (already in workspace)
sled = "0.34"

# Serialization
serde = { workspace = true }
serde_json = "1"

# Error handling
thiserror = { workspace = true }
tracing = { workspace = true }

# Time handling
chrono = "0.4"

# For Matrix well-known discovery
url = "2"`,
      },
      {
        heading: "Dependency Size Justification",
        body: "matrix-rust-sdk is the largest dependency. Here's what each component costs and why we need it:",
        code: `// Matrix mode dependency audit:
//
// INCLUDED:
// matrix-sdk          ~2.8MB  Core SDK (sync, rooms, state)
//   └─ matrix-sdk-base         Room state management
//   └─ matrix-sdk-crypto       E2EE integration
//   └─ matrix-sdk-store        State store abstraction
//
// vodozemac           ~0.9MB  Olm/Megolm implementation
//   └─ olm-sys                 libolm Rust bindings (or pure Rust)
//   └─ Megolm                  Group ratchet
//
// reqwest             ~0.6MB  HTTP client (rustls backend)
//   └─ hyper                   HTTP/1.1 + HTTP/2
//   └─ rustls                  TLS (no OpenSSL!)
//
// sled                ~0.5MB  Embedded key-value store
//                              Persists sync state, room info, keys
//
// ruma                ~0.2MB  Matrix type definitions (auto-included)
//
// Minima code         ~1.1MB  Engine + driver + CLI
//
// TOTAL:              ~6.1MB  (under 10MB budget)
//
// EXCLUDED:
// matrix-sdk-ui       ~2MB    Full UI widgets — NOT included
// matrix-sdk-ffi      ~3MB    FFI bindings — NOT included
// matrix-sdk-wasm     ~4MB    WASM target — NOT included
// OpenSSL             ~2MB    Replaced by rustls
// Full emoji verify   ~0.2MB  Simplified key verification instead`,
      },
    ],
  },
  sync: {
    title: "Step 2: The /sync Loop",
    desc: "Matrix clients work by polling the homeserver's /sync endpoint. This returns all new events (messages, state changes, presence) since the last sync. It's the heartbeat of a Matrix client.",
    sections: [
      {
        heading: "How /sync Works",
        body: "The /sync endpoint is a long-poll HTTP endpoint. The client sends: 'give me everything since token X'. The server holds the connection open until there's new data (up to 30s), then responds with a batch of events. The client processes the events, stores the new sync token, and repeats. This is how Matrix achieves 'real-time' over HTTP.",
        code: `// /sync response structure (simplified):
//
// {
//   "next_batch": "s1234",           // Token for next sync
//   "rooms": {
//     "join": {
//       "!roomid:server": {           // Joined rooms
//         "state": {                  // State changes since last sync
//           "events": [...]           // Room name, topic, members
//         },
//         "timeline": {               // New messages
//           "events": [...],          // Message events
//           "prev_batch": "t1233"     // For fetching more history
//         },
//         "ephemeral": {              // Typing, read receipts
//           "events": [...]
//         }
//       }
//     },
//     "invite": { ... },             // Invited rooms
//     "leave": { ... }               // Left rooms
//   },
//   "to_device": {                   // Device-to-device messages
//     "events": [...]                // Key exchange, verification
//   },
//   "device_lists": {                // E2EE device changes
//     "changed": ["@user:server"]    // Need to fetch new keys
//   },
//   "presence": {                    // Online/offline status
//     "events": [...]
//   }
// }
//
// Our sync loop processes only what we need:
// - timeline events (messages)
// - state events (room metadata)
// - to_device events (E2EE key exchange)
// We IGNORE: ephemeral (typing indicators), presence (we don't show status)`,
      },
      {
        heading: "SyncEngine — Background Sync Task",
        body: "The sync engine runs as a background tokio task. It processes events and forwards relevant messages to the main engine via a channel.",
        code: `// crates/drivers/matrix/src/sync.rs
use matrix_sdk::{
    Client, Room,
    config::SyncSettings,
    event_handler::Ctx,
    ruma::{
        events::room::message::{
            MessageType, OriginalSyncRoomMessageEvent,
            RoomMessageEventContent,
        },
        OwnedRoomId, OwnedUserId,
    },
};
use tokio::sync::mpsc;
use tracing::{info, warn, debug, error};

/// Background sync task.
/// Polls /sync and forwards messages to the engine.
pub struct SyncEngine {
    client: Client,
    msg_tx: mpsc::Sender<IncomingMessage>,
    sync_token: Option<String>,
}

/// Internal message type for sync → engine communication.
pub struct IncomingMessage {
    pub room_id: OwnedRoomId,
    pub sender: OwnedUserId,
    pub body: String,
    pub timestamp: u64,
    pub event_id: String,
    pub is_encrypted: bool,
}

impl SyncEngine {
    pub fn new(client: Client, msg_tx: mpsc::Sender<IncomingMessage>) -> Self {
        Self {
            client,
            msg_tx,
            sync_token: None,
        }
    }

    /// Run the sync loop. This blocks forever (runs as a spawned task).
    pub async fn run(&mut self) {
        info!("Starting Matrix sync loop");

        // Register event handlers BEFORE starting sync
        let msg_tx = self.msg_tx.clone();
        self.client.add_event_handler(
            move |ev: OriginalSyncRoomMessageEvent, room: Room| {
                let tx = msg_tx.clone();
                async move {
                    Self::handle_room_message(ev, room, tx).await;
                }
            },
        );

        // Also handle encrypted events
        let msg_tx_enc = self.msg_tx.clone();
        self.client.add_event_handler(
            move |ev: matrix_sdk::ruma::events::room::EncryptedMessageEvent,
                  room: Room| {
                let tx = msg_tx_enc.clone();
                async move {
                    Self::handle_encrypted_message(ev, room, tx).await;
                }
            },
        );

        // Start the sync loop
        let sync_settings = SyncSettings::default()
            .timeout(std::time::Duration::from_secs(30));

        // If we have a saved token, use it (resume from where we left off)
        let sync_settings = if let Some(token) = &self.sync_token {
            sync_settings.token(token.clone())
        } else {
            sync_settings
        };

        // This loops forever, calling /sync repeatedly
        match self.client.sync(sync_settings).await {
            Ok(_) => info!("Sync loop ended normally"),
            Err(e) => error!("Sync loop error: {}", e),
        }
    }

    /// Handle a plaintext room message event.
    async fn handle_room_message(
        ev: OriginalSyncRoomMessageEvent,
        room: Room,
        tx: mpsc::Sender<IncomingMessage>,
    ) {
        // Only process text messages (ignore images, files, etc. for now)
        let body = match &ev.content.msgtype {
            MessageType::Text(text) => text.body.clone(),
            _ => return,
        };

        // Skip our own messages
        let own_user_id = room.own_user_id().to_owned();
        if ev.sender == own_user_id {
            return;
        }

        debug!(
            "Message in {}: {} (from {})",
            room.room_id(),
            body.chars().take(50).collect::<String>(),
            ev.sender
        );

        let msg = IncomingMessage {
            room_id: room.room_id().to_owned(),
            sender: ev.sender,
            body,
            timestamp: ev.origin_server_ts.0.into(),
            event_id: ev.event_id.to_string(),
            is_encrypted: false,
        };

        if tx.send(msg).await.is_err() {
            warn!("Message channel closed, dropping message");
        }
    }

    /// Handle an encrypted room message event.
    /// matrix-sdk decrypts these automatically if we have the keys.
    async fn handle_encrypted_message(
        ev: matrix_sdk::ruma::events::room::EncryptedMessageEvent,
        room: Room,
        tx: mpsc::Sender<IncomingMessage>,
    ) {
        // matrix-sdk automatically decrypts messages if we have the session keys
        // The decrypted content is available via the room's timeline
        // For now, we log that we received an encrypted event
        debug!(
            "Encrypted message in {} from {}",
            room.room_id(),
            ev.sender
        );

        // The SDK's timeline will handle decryption.
        // We'll pick up the decrypted content through the normal
        // room message handler once decryption succeeds.
    }
}`,
      },
      {
        heading: "Sync Optimization — Incremental Sync",
        body: "The first sync can be slow (fetching full room state). After that, we use incremental sync (only new events since last token).",
        code: `// Sync performance considerations:
//
//   Initial /sync (first login):
//   - Fetches ALL room state, member lists, etc.
//   - Can be 10-100MB of JSON for accounts with many rooms
//   - Takes 5-30 seconds depending on server and room count
//   - We store the sync token and state in sled for next time
//
//   Incremental /sync (subsequent calls):
//   - Only returns events since last sync token
//   - Typically 1-100KB per sync cycle
//   - Completes in 100-500ms
//   - Long-poll: server holds connection until new data arrives
//
//   Our approach:
//   1. First run: do initial sync, store token + state in sled
//   2. Subsequent runs: load token from sled, do incremental sync
//   3. Background task: sync loop runs continuously
//   4. On shutdown: save current sync token
//
//   This means:
//   - First startup: slow (full sync)
//   - Every subsequent startup: fast (incremental)
//   - Message delivery latency: ~30s worst case (sync interval)
//   - No messages are lost (server stores them until we sync)`,
      },
    ],
  },
  rooms: {
    title: "Step 3: Room Management",
    desc: "Matrix rooms are persistent, federated spaces where messages happen. Unlike XMPP MUCs, Matrix rooms survive server restarts and can span multiple homeservers.",
    sections: [
      {
        heading: "Room Model",
        body: "A Matrix room is a persistent, federated space identified by a room ID (e.g., !abc123:server.org). Rooms have: members (any number), state events (name, topic, encryption, power levels), a timeline of messages, and optionally E2EE enabled. The room persists on the homeserver even when all members are offline.",
        code: `// Room lifecycle:
//
//   1. Created:    !roomid:server.org
//   2. Joined:     Members receive events via /sync
//   3. Federated:  Room exists on multiple homeservers simultaneously
//   4. Encrypted:  E2EE enabled via m.room.encryption state event
//   5. Persistent: Server stores history (unless retention policy)
//
//   Room aliases (human-readable):
//     #minima-chat:matrix.org  →  resolves to  !abc123:matrix.org
//
//   In Minima, we work with room IDs directly (no alias resolution).
//   The CLI accepts room IDs or aliases as "contact" identifiers.
//
//   Key difference from XMPP:
//   - XMPP MUC: room exists on ONE server, dies if server goes down
//   - Matrix room: federated across ALL participating servers
//   - Matrix room: persistent history, XMPP MUC: typically not`,
      },
      {
        heading: "Room Manager",
        body: "Handles room operations: listing joined rooms, joining new rooms, leaving rooms, fetching room info.",
        code: `// crates/drivers/matrix/src/rooms.rs
use matrix_sdk::{
    Client, Room, RoomState,
    ruma::{
        OwnedRoomId, RoomId,
        events::room::{
            message::RoomMessageEventContent,
            topic::RoomTopicEventContent,
        },
    },
};
use tracing::{info, debug};

/// Room management operations.
pub struct RoomManager {
    client: Client,
}

impl RoomManager {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    /// List all joined rooms with metadata.
    pub fn list_rooms(&self) -> Vec<RoomInfo> {
        self.client.rooms()
            .into_iter()
            .filter(|r| r.state() == RoomState::Joined)
            .map(|room| RoomInfo {
                room_id: room.room_id().to_owned(),
                display_name: room.cached_display_name()
                    .map(|n| n.to_string())
                    .unwrap_or_default(),
                topic: room.topic(),
                member_count: room.joined_members_count(),
                is_encrypted: room.is_encrypted(),
                last_message_at: None, // Would need timeline to populate
            })
            .collect()
    }

    /// Get info about a specific room.
    pub fn get_room_info(&self, room_id: &RoomId) -> Option<RoomInfo> {
        self.client.get_room(room_id).map(|room| RoomInfo {
            room_id: room.room_id().to_owned(),
            display_name: room.cached_display_name()
                .map(|n| n.to_string())
                .unwrap_or_default(),
            topic: room.topic(),
            member_count: room.joined_members_count(),
            is_encrypted: room.is_encrypted(),
            last_message_at: None,
        })
    }

    /// Join a room by ID or alias.
    pub async fn join_room(&self, room_id_or_alias: &str) -> Result<OwnedRoomId, RoomError> {
        info!("Joining room: {}", room_id_or_alias);

        let room_id = if room_id_or_alias.starts_with('!') {
            // Direct room ID
            let room_id: OwnedRoomId = room_id_or_alias.try_into()
                .map_err(|_| RoomError::InvalidRoomId(room_id_or_alias.to_string()))?;

            self.client.join_room_by_id(&room_id).await
                .map_err(|e| RoomError::Join(e.to_string()))?;

            room_id
        } else if room_id_or_alias.starts_with('#') {
            // Room alias — resolve to room ID
            let response = self.client.join_room_by_id_or_alias(
                room_id_or_alias,
                &[],
            ).await
                .map_err(|e| RoomError::Join(e.to_string()))?;

            response.room_id().to_owned()
        } else {
            return Err(RoomError::InvalidRoomId(room_id_or_alias.to_string()));
        };

        info!("Joined room: {}", room_id);
        Ok(room_id)
    }

    /// Leave a room.
    pub async fn leave_room(&self, room_id: &RoomId) -> Result<(), RoomError> {
        let room = self.client.get_room(room_id)
            .ok_or(RoomError::NotFound(room_id.to_string()))?;

        room.leave().await
            .map_err(|e| RoomError::Leave(e.to_string()))?;

        info!("Left room: {}", room_id);
        Ok(())
    }

    /// Enable E2EE in a room (if we have permission).
    pub async fn enable_encryption(&self, room_id: &RoomId) -> Result<(), RoomError> {
        let room = self.client.get_room(room_id)
            .ok_or(RoomError::NotFound(room_id.to_string()))?;

        room.enable_encryption().await
            .map_err(|e| RoomError::Encryption(e.to_string()))?;

        info!("Enabled encryption in room: {}", room_id);
        Ok(())
    }

    /// Fetch recent message history for a room.
    pub async fn get_messages(
        &self,
        room_id: &RoomId,
        limit: u32,
    ) -> Result<Vec<RoomMessage>, RoomError> {
        let room = self.client.get_room(room_id)
            .ok_or(RoomError::NotFound(room_id.to_string()))?;

        // Use the room's timeline to get recent messages
        let timeline = room.timeline().await
            .map_err(|e| RoomError::Timeline(e.to_string()))?;

        // The timeline gives us the most recent messages
        // (SDK handles pagination internally)
        let messages: Vec<RoomMessage> = timeline.messages()
            .iter()
            .take(limit as usize)
            .filter_map(|event| {
                // Extract text content from timeline events
                if let Ok(Some(msg)) = event.msgtype() {
                    if let Some(text) = msg.text() {
                        return Some(RoomMessage {
                            sender: event.sender().to_string(),
                            body: text.to_string(),
                            timestamp: event.timestamp().unwrap_or(0),
                            event_id: event.event_id().map(|id| id.to_string()).unwrap_or_default(),
                            is_encrypted: event.is_encrypted(),
                        });
                    }
                }
                None
            })
            .collect();

        Ok(messages)
    }
}

#[derive(Debug)]
pub struct RoomInfo {
    pub room_id: OwnedRoomId,
    pub display_name: String,
    pub topic: Option<String>,
    pub member_count: u64,
    pub is_encrypted: bool,
    pub last_message_at: Option<u64>,
}

#[derive(Debug)]
pub struct RoomMessage {
    pub sender: String,
    pub body: String,
    pub timestamp: u64,
    pub event_id: String,
    pub is_encrypted: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum RoomError {
    #[error("invalid room ID: {0}")]
    InvalidRoomId(String),
    #[error("room not found: {0}")]
    NotFound(String),
    #[error("failed to join room: {0}")]
    Join(String),
    #[error("failed to leave room: {0}")]
    Leave(String),
    #[error("encryption error: {0}")]
    Encryption(String),
    #[error("timeline error: {0}")]
    Timeline(String),
}`,
      },
      {
        heading: "Room ID vs Alias — What to Use",
        body: "Matrix has two ways to identify rooms. Room IDs are canonical but ugly. Aliases are human-readable but can change. For Minima, we use room IDs internally and accept aliases from the user.",
        code: `// Room identifiers:
//
//   Room ID (canonical):
//     !abc123def456:matrix.org
//     ^            ^
//     |            └── homeserver that created the room
//     └── random unique ID
//
//   Room alias (human-readable):
//     #minima-chat:matrix.org
//     ^             ^
//     |             └── homeserver hosting the alias
//     └── human-chosen name
//
//   In Minima CLI:
//     minima --mode matrix send --to "!abc123:matrix.org" --message "hello"
//     minima --mode matrix send --to "#minima-chat:matrix.org" --message "hello"
//     minima --mode matrix list-rooms    # Shows room IDs and names
//     minima --mode matrix join "#minima-chat:matrix.org"
//
//   We prefer room IDs for reliability (aliases can be deleted/moved).`,
      },
    ],
  },
  messaging: {
    title: "Step 4: Messaging (Send & Receive)",
    desc: "Sending messages in Matrix is straightforward HTTP: POST to /rooms/{id}/send/{type}/{txnId}. Receiving is through the /sync loop. The complexity is in E2EE.",
    sections: [
      {
        heading: "MatrixEngine — ChatEngine Implementation",
        body: "The complete ChatEngine implementation for Matrix mode. Wires together the SDK client, sync engine, room manager, and E2EE into the unified interface.",
        code: `// crates/drivers/matrix/src/engine.rs
use minima_engine::{ChatEngine, Message, Contact, EngineError};
use async_trait::async_trait;
use matrix_sdk::{
    Client, Room,
    config::SyncSettings,
    ruma::{
        OwnedRoomId, RoomId, UserId,
        events::room::message::RoomMessageEventContent,
        OwnedTransactionId,
    },
};
use tokio::sync::mpsc;
use tracing::{info, warn, error};

use crate::config::MatrixConfig;
use crate::sync::{SyncEngine, IncomingMessage};
use crate::rooms::RoomManager;

/// Matrix protocol driver.
/// Connects to a homeserver, syncs room state, sends/receives messages.
pub struct MatrixEngine {
    /// The Matrix SDK client
    client: Client,
    /// Room management operations
    rooms: RoomManager,
    /// Channel for receiving messages from the sync loop
    msg_rx: mpsc::Receiver<IncomingMessage>,
    /// Handle for the background sync task
    sync_handle: Option<tokio::task::JoinHandle<()>>,
    /// Our user ID
    user_id: OwnedUserId,
}

#[async_trait]
impl ChatEngine for MatrixEngine {
    type Config = MatrixConfig;

    async fn connect(config: MatrixConfig) -> Result<Self, EngineError> {
        info!("Connecting to Matrix homeserver: {}", config.homeserver);

        // Step 1: Build the Matrix client
        // Using sled for persistent state storage
        let state_store = matrix_sdk::store::make_config(
            &config.state_dir,
            None,
        ).map_err(|e| EngineError::Connection(e.to_string()))?;

        let client = Client::builder()
            .homeserver_url(&config.homeserver)
            .store_config(state_store)
            .build()
            .await
            .map_err(|e| EngineError::Connection(e.to_string()))?;

        // Step 2: Login
        info!("Logging in as {}...", config.user_id);
        client.login_username(&config.user_id, &config.password)
            .initial_device_display_name("minima")
            .send()
            .await
            .map_err(|e| EngineError::Auth(e.to_string()))?;

        info!("Logged in successfully");

        // Step 3: Enable E2EE
        // matrix-sdk handles key upload and session management automatically
        client.encryption()
            .enable_cross_process_store_lock()
            .await
            .map_err(|e| EngineError::Crypto(e.to_string()))?;

        // Step 4: Do initial sync (required before sending messages)
        info!("Performing initial sync...");
        let response = client.sync_once(SyncSettings::default()).await
            .map_err(|e| EngineError::Connection(e.to_string()))?;

        info!("Initial sync complete. Next batch: {}", response.next_batch);

        // Step 5: Start background sync task
        let (msg_tx, msg_rx) = mpsc::channel(512);
        let mut sync_engine = SyncEngine::new(client.clone(), msg_tx);
        let sync_handle = tokio::spawn(async move {
            sync_engine.run().await;
        });

        // Step 6: Initialize room manager
        let rooms = RoomManager::new(client.clone());

        let user_id: OwnedUserId = config.user_id.parse()
            .map_err(|_| EngineError::Auth("Invalid user ID".to_string()))?;

        info!("Matrix engine ready");

        Ok(Self {
            client,
            rooms,
            msg_rx,
            sync_handle: Some(sync_handle),
            user_id,
        })
    }

    async fn send(&mut self, to: &str, plaintext: &[u8]) -> Result<(), EngineError> {
        // Parse the target as a room ID
        let room_id: OwnedRoomId = if to.starts_with('!') {
            to.try_into()
                .map_err(|_| EngineError::InvalidRecipient(to.to_string()))?
        } else {
            // Try to resolve alias to room ID
            return Err(EngineError::InvalidRecipient(
                format!("Use room ID (!abc:server), not alias. Got: {}", to)
            ));
        };

        // Get the room
        let room = self.client.get_room(&room_id)
            .ok_or(EngineError::RoomNotFound(to.to_string()))?;

        // Convert plaintext to string
        let text = String::from_utf8(plaintext.to_vec())
            .map_err(|_| EngineError::InvalidPayload)?;

        info!("Sending message to room {}", room_id);

        // Build the message content
        let content = RoomMessageEventContent::text_plain(text);

        // Generate a unique transaction ID for idempotency
        let txn_id = uuid::Uuid::new_v4().to_string();

        // Send the message
        // If the room is encrypted, the SDK encrypts automatically
        room.send(content)
            .with_transaction_id(&txn_id.into())
            .await
            .map_err(|e| EngineError::Send(e.to_string()))?;

        info!("Message sent to room {}", room_id);
        Ok(())
    }

    async fn receive(&mut self) -> Result<Message, EngineError> {
        // Wait for the next message from the sync engine
        let incoming = self.msg_rx.recv().await
            .ok_or(EngineError::ChannelClosed)?;

        Ok(Message {
            sender: incoming.sender.to_string(),
            recipient: self.user_id.to_string(),
            plaintext: incoming.body.into_bytes(),
            timestamp: incoming.timestamp,
            id: incoming.event_id,
            verified: incoming.is_encrypted,
        })
    }

    async fn list_contacts(&self) -> Result<Vec<Contact>, EngineError> {
        // In Matrix, "contacts" are joined rooms
        let room_infos = self.rooms.list_rooms();

        Ok(room_infos.into_iter().map(|info| Contact {
            id: info.room_id.to_string(),
            name: if info.display_name.is_empty() {
                info.room_id.to_string()
            } else {
                format!("{} ({} members)", info.display_name, info.member_count)
            },
            has_session: info.is_encrypted,
            fingerprint: None,
        }).collect())
    }

    async fn get_session(&self, contact: &str) -> Result<Option<Session>, EngineError> {
        let room_id: OwnedRoomId = contact.try_into()
            .map_err(|_| EngineError::InvalidRecipient(contact.to_string()))?;

        if let Some(info) = self.rooms.get_room_info(&room_id) {
            Ok(Some(Session {
                peer_id: contact.to_string(),
                fingerprint: None,
                message_count: 0, // Would need timeline pagination
            }))
        } else {
            Ok(None)
        }
    }

    async fn disconnect(&mut self) -> Result<(), EngineError> {
        info!("Disconnecting from Matrix");

        // Stop the sync loop
        if let Some(handle) = self.sync_handle.take() {
            handle.abort();
        }

        // Logout (invalidates the access token)
        self.client.logout().await
            .map_err(|e| EngineError::Disconnect(e.to_string()))?;

        info!("Disconnected from Matrix");
        Ok(())
    }
}

impl MatrixEngine {
    /// Join a room by ID or alias.
    pub async fn join_room(&mut self, room_id_or_alias: &str) -> Result<(), EngineError> {
        self.rooms.join_room(room_id_or_alias).await
            .map_err(|e| EngineError::Connection(e.to_string()))?;
        Ok(())
    }

    /// Leave a room.
    pub async fn leave_room(&self, room_id: &str) -> Result<(), EngineError> {
        let room_id: OwnedRoomId = room_id.try_into()
            .map_err(|_| EngineError::InvalidRecipient(room_id.to_string()))?;
        self.rooms.leave_room(&room_id).await
            .map_err(|e| EngineError::Connection(e.to_string()))?;
        Ok(())
    }

    /// Get the sync token for resuming.
    pub async fn sync_token(&self) -> Option<String> {
        self.client.sync_token().await
    }

    /// Our user ID.
    pub fn user_id(&self) -> &UserId {
        &self.user_id
    }

    /// List joined rooms with details.
    pub fn list_rooms(&self) -> Vec<crate::rooms::RoomInfo> {
        self.rooms.list_rooms()
    }

    /// Fetch recent messages from a room.
    pub async fn room_messages(
        &self,
        room_id: &str,
        limit: u32,
    ) -> Result<Vec<crate::rooms::RoomMessage>, EngineError> {
        let room_id: OwnedRoomId = room_id.try_into()
            .map_err(|_| EngineError::InvalidRecipient(room_id.to_string()))?;

        self.rooms.get_messages(&room_id, limit).await
            .map_err(|e| EngineError::Receive(e.to_string()))
    }
}`,
      },
      {
        heading: "Config for Matrix Mode",
        body: "The [matrix] section of minima.toml.",
        code: `// crates/drivers/matrix/src/config.rs
use std::path::PathBuf;

pub struct MatrixConfig {
    /// Homeserver URL (e.g., "https://matrix.org")
    pub homeserver: String,
    /// Matrix user ID (e.g., "@alice:matrix.org")
    pub user_id: String,
    /// Password for login
    pub password: String,
    /// Directory for state store (sync state, room info)
    pub state_dir: PathBuf,
}

impl MatrixConfig {
    pub fn validate(&self) -> Result<(), ConfigError> {
        if self.homeserver.is_empty() {
            return Err(ConfigError::MissingField("homeserver"));
        }
        if !self.user_id.starts_with('@') || !self.user_id.contains(':') {
            return Err(ConfigError::InvalidUserId(self.user_id.clone()));
        }
        if self.password.is_empty() {
            return Err(ConfigError::MissingField("password"));
        }
        // Ensure state directory exists
        std::fs::create_dir_all(&self.state_dir)?;
        Ok(())
    }
}

// Corresponding minima.toml config:
//
// [matrix]
// homeserver = "https://matrix.org"
// user_id = "@alice:matrix.org"
// password = "CHANGEME"
// state_dir = "~/.minima/state/matrix"`,
      },
    ],
  },
  encryption: {
    title: "Step 5: End-to-End Encryption (Olm/Megolm)",
    desc: "Matrix uses two encryption algorithms: Olm for 1:1 key exchange (like Signal's X3DH) and Megolm for group encryption (a ratchet shared among room members).",
    sections: [
      {
        heading: "E2EE Architecture",
        body: "Matrix E2EE is handled transparently by matrix-sdk. When you send a message to an encrypted room, the SDK: (1) checks if we have a Megolm session for the room, (2) if not, establishes Olm sessions with each room member, (3) shares the Megolm session key via Olm, (4) encrypts the message with Megolm, (5) sends the encrypted event. On receive, the SDK reverses this automatically.",
        code: `// Matrix E2EE flow:
//
//   Sending:
//   ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌─────────┐
//   │Plaintext│───►│  Megolm  │───►│  Olm     │───►│Matrix   │
//   │  Message│    │ Encrypt  │    │ Key Share│    │ API     │
//   └─────────┘    └──────────┘    └──────────┘    └─────────┘
//
//   1. Megolm encrypts the message (group ratchet)
//   2. If new session needed, Olm shares the Megolm key with each member
//   3. The encrypted event is sent via the Matrix API
//
//   Receiving:
//   ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌─────────┐
//   │Matrix   │───►│  Olm     │───►│  Megolm  │───►│Plaintext│
//   │ /sync   │    │ Key      │    │ Decrypt  │    │  Message│
//   └─────────┘    └──────────┘    └──────────┘    └─────────┘
//
//   1. We receive an encrypted event via /sync
//   2. If we don't have the Megolm session, we request it via Olm
//   3. Megolm decrypts the message
//   4. We get the plaintext
//
//   matrix-sdk handles ALL of this automatically.
//   We just need to enable encryption and manage device keys.`,
      },
      {
        heading: "Key Verification",
        body: "Before trusting a device's keys, you should verify them. Matrix supports several verification methods. For Minima, we implement SAS (Short Authentication String) verification — compare a short string out-of-band.",
        code: `// crates/drivers/matrix/src/verification.rs
use matrix_sdk::{
    Client,
    encryption::verification::{
        SasVerification, VerificationRequest,
    },
    ruma::events::key::verification::{
        KeyVerificationRequestEvent,
        KeyVerificationStartEvent,
    },
};
use tracing::{info, warn};

/// Handles device verification.
pub struct VerificationManager {
    client: Client,
}

impl VerificationManager {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    /// Register event handlers for verification events.
    pub fn register_handlers(&self) {
        let client = self.client.clone();

        // Handle incoming verification requests
        self.client.add_event_handler(
            move |event: KeyVerificationRequestEvent| {
                let client = client.clone();
                async move {
                    info!("Received verification request from {}", event.sender);
                    // Auto-accept verification requests
                    // In production, this should prompt the user
                    if let Some(verification) = client.encryption()
                        .get_verification(&event.sender, &event.content.transaction_id)
                        .await
                    {
                        if let Some(sas) = verification.sas() {
                            sas.accept().await.ok();
                        }
                    }
                }
            },
        );

        // Handle SAS verification start
        self.client.add_event_handler(
            move |event: KeyVerificationStartEvent| {
                async move {
                    info!("SAS verification started");
                    // The SDK will present the SAS emoji/number
                    // The user compares these out-of-band
                }
            },
        );
    }

    /// Start verification with a specific user.
    pub async fn request_verification(
        &self,
        user_id: &str,
    ) -> Result<VerificationRequest, VerificationError> {
        let user: OwnedUserId = user_id.parse()
            .map_err(|_| VerificationError::InvalidUser(user_id.to_string()))?;

        let devices = self.client.encryption()
            .get_user_devices(&user)
            .await
            .map_err(|e| VerificationError::DeviceFetch(e.to_string()))?;

        // Request verification for all of the user's devices
        let device = devices.devices().next()
            .ok_or(VerificationError::NoDevices(user_id.to_string()))?;

        let request = device.request_verification().await
            .map_err(|e| VerificationError::Request(e.to_string()))?;

        info!("Verification request sent to {}", user_id);
        Ok(request)
    }

    /// Get the SAS (Short Authentication String) for an active verification.
    pub async fn get_sas_emoji(
        &self,
        verification: &SasVerification,
    ) -> Option<Vec<String>> {
        verification.emoji().map(|emojis| {
            emojis.iter().map(|(emoji, _)| emoji.to_string()).collect()
        })
    }

    /// Confirm that the SAS matches what the other party sees.
    pub async fn confirm_sas(
        &self,
        sas: &SasVerification,
    ) -> Result<(), VerificationError> {
        sas.confirm().await
            .map_err(|e| VerificationError::Confirm(e.to_string()))?;

        info!("SAS verification confirmed");
        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum VerificationError {
    #[error("invalid user ID: {0}")]
    InvalidUser(String),
    #[error("no devices found for user: {0}")]
    NoDevices(String),
    #[error("failed to fetch devices: {0}")]
    DeviceFetch(String),
    #[error("verification request failed: {0}")]
    Request(String),
    #[error("confirmation failed: {0}")]
    Confirm(String),
}`,
      },
      {
        heading: "Encryption Gotchas",
        body: "Matrix E2EE has specific challenges we handle in Minima:",
        code: `// E2EE gotchas and how we handle them:
//
// 1. "Unable to decrypt" (UTD) errors
//    Cause: We don't have the Megolm session key.
//    When: First message in a room after joining, or key was rotated.
//    Fix: matrix-sdk automatically requests keys from other devices.
//    In Minima: we retry decryption after key request, show "decrypting..."
//
// 2. Device key backup
//    Cause: If we lose our device keys, we can't decrypt old messages.
//    When: Reinstalling Minima on a new device.
//    Fix: We don't implement key backup (saves complexity).
//    In Minima: messages are ephemeral on the client; history is on the server.
//    Trade-off: We can read new messages but not old encrypted ones.
//
// 3. Cross-signing
//    Cause: Multiple devices need to trust each other.
//    When: User runs Minima on multiple machines.
//    Fix: We implement basic SAS verification (see above).
//    In Minima: verify once per device, trust persists.
//
// 4. Key rotation
//    Cause: Megolm sessions are rotated periodically for forward secrecy.
//    When: After N messages or time period.
//    Fix: Transparent — matrix-sdk handles this.
//
// 5. Room encryption state
//    Cause: Not all rooms are encrypted.
//    When: Room admin hasn't enabled encryption.
//    In Minima: we display encryption status in list_contacts().
//    We can optionally require encryption and refuse to send to unencrypted rooms.`,
      },
    ],
  },
  testing: {
    title: "Step 6: Integration Testing",
    desc: "Testing Matrix requires a homeserver. We use a local Synapse instance in Docker for integration tests.",
    sections: [
      {
        heading: "Test Server Setup",
        body: "Run a local Synapse homeserver in Docker for testing. This gives us full Matrix federation capability without depending on matrix.org.",
        code: `# tests/docker-compose-matrix.yml
# Local Matrix homeserver for integration testing.
version: "3.8"
services:
  synapse:
    image: matrixdotorg/synapse:latest
    ports:
      - "8008:8008"
    volumes:
      - ./synapse-data:/data
    environment:
      - SYNAPSE_SERVER_NAME=localhost
      - SYNAPSE_REPORT_STATS=no
      - SYNAPSE_LOG_LEVEL=DEBUG

# Generate config first:
# docker run --rm -v ./synapse-data:/data \\
#   matrixdotorg/synapse:latest generate \\
#   --server-name localhost \\
#   --report-stats no

# Register test users:
# docker exec synapse register_new_matrix_user \\
#   http://localhost:8008 \\
#   -c /data/homeserver.yaml \\
#   -u alice -p testpass --no-admin
# docker exec synapse register_new_matrix_user \\
#   http://localhost:8008 \\
#   -c /data/homeserver.yaml \\
#   -u bob -p testpass --no-admin`,
      },
      {
        heading: "Integration Tests",
        body: "Full roundtrip tests: login, join room, send message, receive message, E2EE.",
        code: `// tests/matrix_integration_test.rs
//! Integration tests for Matrix mode.
//! Requires a local Synapse instance (see docker-compose-matrix.yml).

use minima_matrix::{MatrixEngine, MatrixConfig};
use minima_engine::ChatEngine;
use tempfile::TempDir;
use std::time::Duration;

#[tokio::test]
async fn test_matrix_login() {
    let config = MatrixConfig {
        homeserver: "http://localhost:8008".to_string(),
        user_id: "@alice:localhost".to_string(),
        password: "testpass".to_string(),
        state_dir: TempDir::new().unwrap().path().to_path_buf(),
    };

    let engine = MatrixEngine::connect(config).await.unwrap();
    assert_eq!(engine.user_id().as_str(), "@alice:localhost");

    engine.disconnect().await.unwrap();
}

#[tokio::test]
async fn test_matrix_join_room_and_send() {
    let config_alice = MatrixConfig {
        homeserver: "http://localhost:8008".to_string(),
        user_id: "@alice:localhost".to_string(),
        password: "testpass".to_string(),
        state_dir: TempDir::new().unwrap().path().to_path_buf(),
    };

    let config_bob = MatrixConfig {
        homeserver: "http://localhost:8008".to_string(),
        user_id: "@bob:localhost".to_string(),
        password: "testpass".to_string(),
        state_dir: TempDir::new().unwrap().path().to_path_buf(),
    };

    let mut alice = MatrixEngine::connect(config_alice).await.unwrap();
    let mut bob = MatrixEngine::connect(config_bob).await.unwrap();

    // Alice creates a room
    let room_id = alice.create_room("test-room", true).await.unwrap();

    // Bob joins the room
    bob.join_room(&room_id).await.unwrap();

    // Wait for Bob's sync to pick up the room
    tokio::time::sleep(Duration::from_secs(2)).await;

    // Alice sends a message
    let msg = b"Hello from Alice via Matrix!";
    alice.send(&room_id, msg).await.unwrap();

    // Bob receives the message
    let received = tokio::time::timeout(
        Duration::from_secs(30),  // Matrix sync can be slow
        bob.receive()
    ).await.expect("timeout").unwrap();

    assert_eq!(received.plaintext, msg);
    assert_eq!(received.sender, "@alice:localhost");
    // If room is encrypted, message should be verified
    assert!(received.verified);

    // Bob replies
    let reply = b"Hello from Bob via Matrix!";
    bob.send(&room_id, reply).await.unwrap();

    let received_reply = tokio::time::timeout(
        Duration::from_secs(30),
        alice.receive()
    ).await.expect("timeout").unwrap();

    assert_eq!(received_reply.plaintext, reply);

    alice.disconnect().await.unwrap();
    bob.disconnect().await.unwrap();
}

#[tokio::test]
async fn test_matrix_encrypted_room() {
    let config = MatrixConfig {
        homeserver: "http://localhost:8008".to_string(),
        user_id: "@alice:localhost".to_string(),
        password: "testpass".to_string(),
        state_dir: TempDir::new().unwrap().path().to_path_buf(),
    };

    let engine = MatrixEngine::connect(config).await.unwrap();

    // Create an encrypted room
    let room_id = engine.create_room("encrypted-test", true).await.unwrap();

    // Verify encryption is enabled
    let rooms = engine.list_rooms();
    let room = rooms.iter().find(|r| r.room_id.as_str() == room_id).unwrap();
    assert!(room.is_encrypted, "Room should have encryption enabled");

    engine.disconnect().await.unwrap();
}

#[tokio::test]
async fn test_matrix_list_contacts() {
    let config = MatrixConfig {
        homeserver: "http://localhost:8008".to_string(),
        user_id: "@alice:localhost".to_string(),
        password: "testpass".to_string(),
        state_dir: TempDir::new().unwrap().path().to_path_buf(),
    };

    let engine = MatrixEngine::connect(config).await.unwrap();
    let contacts = engine.list_contacts().await.unwrap();

    // Should have at least the rooms we created
    println!("Joined {} rooms", contacts.len());
    for contact in &contacts {
        println!("  {} (encrypted: {})", contact.name, contact.has_session);
    }

    engine.disconnect().await.unwrap();
}`,
      },
      {
        heading: "CLI Wiring",
        body: "The CLI dispatches to Matrix mode. Same pattern as XMPP and P2P.",
        code: `// crates/cli/src/commands/matrix.rs
use minima_matrix::{MatrixEngine, MatrixConfig};
use minima_engine::ChatEngine;
use crate::config::MinimaConfig;

pub async fn connect(config: &MinimaConfig) -> Result<MatrixEngine, anyhow::Error> {
    let matrix_config = config.matrix.as_ref()
        .ok_or_else(|| anyhow::anyhow!("No [matrix] section in config"))?;

    let matrix_config = MatrixConfig {
        homeserver: matrix_config.homeserver.clone(),
        user_id: matrix_config.user_id.clone(),
        password: matrix_config.password.clone(),
        state_dir: matrix_config.state_dir.clone(),
    };

    matrix_config.validate()?;

    println!("Connecting to {}...", matrix_config.homeserver);

    let engine = MatrixEngine::connect(matrix_config).await?;

    println!("Logged in as {}", engine.user_id());
    println!("Joined {} rooms", engine.list_rooms().len());
    println!("Matrix mode active (E2EE enabled)");

    Ok(engine)
}

pub async fn list_rooms(config: &MinimaConfig) -> Result<(), anyhow::Error> {
    let engine = connect(config).await?;
    let rooms = engine.list_rooms();

    println!("Joined rooms:");
    for room in &rooms {
        let enc = if room.is_encrypted { "encrypted" } else { "unencrypted" };
        println!(
            "  {} — {} members ({})",
            room.display_name,
            room.member_count,
            enc
        );
        println!("    Room ID: {}", room.room_id);
    }

    Ok(())
}

pub async fn join_room(
    config: &MinimaConfig,
    room_id_or_alias: &str,
) -> Result<(), anyhow::Error> {
    let mut engine = connect(config).await?;
    engine.join_room(room_id_or_alias).await?;
    println!("Joined room: {}", room_id_or_alias);
    Ok(())
}`,
      },
    ],
  },
};

export function Phase3Matrix() {
  const [activeStep, setActiveStep] = useState<Step>("overview");
  const current = stepContent[activeStep];

  return (
    <section className="phase1-section">
      <div className="phase1-header">
        <div className="phase1-badge" style={{ background: "#10b981" }}>Phase 3</div>
        <div>
          <h2>Matrix-Lite Implementation</h2>
          <p className="phase1-tagline">
            The "Community Mode" — federated rooms, server-side history, E2EE via Olm/Megolm, bridges to other platforms
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
        <h4>Phase 3 Deliverables Checklist</h4>
        <div className="checklist-grid">
          {[
            { done: false, text: "MatrixConfig: homeserver, user_id, password, state_dir validation" },
            { done: false, text: "Client setup: login, E2EE enable, initial sync" },
            { done: false, text: "SyncEngine: background /sync loop with message forwarding" },
            { done: false, text: "RoomManager: list, join, leave, encryption status" },
            { done: false, text: "MatrixEngine: ChatEngine trait implementation" },
            { done: false, text: "Incremental sync: sled-persisted sync token across restarts" },
            { done: false, text: "E2EE: Olm/Megolm transparent encryption for encrypted rooms" },
            { done: false, text: "VerificationManager: SAS verification for device trust" },
            { done: false, text: "Docker test server: local Synapse with test users" },
            { done: false, text: "Integration test: login, join, send, receive (encrypted room)" },
            { done: false, text: "Contacts test: list_rooms shows encryption status" },
            { done: false, text: "Size verification: build < 7MB with matrix feature only" },
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
