import { useState } from "react";

type Mode = "xmpp" | "p2p" | "matrix";

const modes: Record<Mode, {
  name: string;
  tagline: string;
  icon: string;
  color: string;
  protocol: string;
  encryption: string;
  transport: string;
  deps: string[];
  binarySize: string;
  useCase: string;
  tradeoffs: { pros: string[]; cons: string[] };
  snippet: string;
}> = {
  xmpp: {
    name: "XMPP + OMEMO",
    tagline: "The Stability Mode",
    icon: "S",
    color: "#3b82f6",
    protocol: "XMPP (RFC 6120/6121)",
    encryption: "OMEMO (X3DH + Double Ratchet via libsignal)",
    transport: "TCP/TLS 1.3 to XMPP server",
    deps: ["xmpp-rs (xml parser)", "libsignal-protocol-rs", "rusqlite (key store)", "rustls"],
    binarySize: "~4.2 MB estimated",
    useCase: "Reliable, standards-based chat. Works with any XMPP server (ejabberd, Prosody). Best for teams already using XMPP infrastructure.",
    tradeoffs: {
      pros: [
        "Server ecosystem is mature and battle-tested",
        "Easy to swap servers — no vendor lock-in",
        "OMEMO is well-audited encryption",
        "Group chat via MUC (Multi-User Chat)",
        "Offline message delivery (server-stored)",
      ],
      cons: [
        "Requires a running XMPP server",
        "Metadata visible to server operator",
        "OMEMO key verification is manual",
        "XML parsing adds some overhead",
      ],
    },
    snippet: `// drivers/xmpp/src/lib.rs
use minima_engine::{ChatEngine, Message, Contact};
use xmpp_rs::Client as XmppClient;
use libsignal_protocol::SessionCipher;

pub struct XmppEngine {
    client: XmppClient,
    session_cipher: SessionCipher,
    store: SqliteKeyStore,
}

impl ChatEngine for XmppEngine {
    type Config = XmppConfig;
    type Error = XmppError;

    async fn connect(config: XmppConfig) -> Result<Self, XmppError> {
        let client = XmppClient::connect(
            &config.server,
            config.port,
            &config.jid,
            &config.password,
        ).await?;

        // Load or establish OMEMO sessions
        let store = SqliteKeyStore::open(&config.key_store_path)?;
        let session_cipher = SessionCipher::new(store.clone());

        Ok(Self { client, session_cipher, store })
    }

    async fn send(&mut self, to: &str, plaintext: &[u8]) -> Result<(), XmppError> {
        let encrypted = self.session_cipher
            .encrypt(to, plaintext)
            .await?;
        self.client.send_message(to, encrypted.to_wire_format()).await
    }
}`,
  },
  p2p: {
    name: "libp2p P2P",
    tagline: "The Privacy Mode",
    icon: "P",
    color: "#8b5cf6",
    protocol: "libp2p (gossipsub + noise + identify)",
    encryption: "Noise Protocol (XX handshake) + Double Ratchet on top",
    transport: "Direct TCP/WebSocket between peers, relay for NAT traversal",
    deps: ["libp2p (gossipsub, noise, identify, relay, mdns)", "x25519-dalek", "aes-gcm", "rusqlite"],
    binarySize: "~5.8 MB estimated",
    useCase: "Simplex-like metadata resistance. No server holds your contacts or message history. Direct device-to-device communication.",
    tradeoffs: {
      pros: [
        "No central server — true metadata resistance",
        "NAT traversal via libp2p relay circuits",
        "Local peer discovery via mDNS",
        "No registration or account needed",
        "Censorship resistant",
      ],
      cons: [
        "Both peers must be online for delivery",
        "NAT traversal can fail in restrictive networks",
        "Larger binary due to libp2p stack",
        "No offline message queuing",
      ],
    },
    snippet: `// drivers/p2p/src/lib.rs
use minima_engine::{ChatEngine, Message, Contact};
use libp2p::{
    gossipsub, noise, identify,
    Swarm, swarm::SwarmEvent,
    Multiaddr, PeerId,
};
use tokio::sync::mpsc;

pub struct P2PEngine {
    swarm: Swarm<P2PBehaviour>,
    msg_rx: mpsc::Receiver<Message>,
    msg_tx: mpsc::Sender<Message>,
    ratchet: DoubleRatchet,
}

impl ChatEngine for P2PEngine {
    type Config = P2PConfig;
    type Error = P2PError;

    async fn connect(config: P2PConfig) -> Result<Self, P2PError> {
        let keypair = noise::Keypair::new()
            .into_authentic(&config.identity_key)?;

        let swarm = libp2p::Builder::new()
            .with_tcp(Default::default(), keypair.clone())?
            .with_noise(keypair)?
            .with_behaviour(|key| P2PBehaviour::new(key))?
            .build();

        // Bootstrap: connect to known relay nodes
        for addr in &config.bootstrap_peers {
            swarm.dial(addr.parse::<Multiaddr>()?)?;
        }

        let (msg_tx, msg_rx) = mpsc::channel(256);
        Ok(Self { swarm, msg_rx, msg_tx, ratchet })
    }

    async fn send(&mut self, to: &str, plaintext: &[u8]) -> Result<(), P2PError> {
        let peer_id: PeerId = to.parse()?;
        let encrypted = self.ratchet.encrypt(plaintext)?;
        self.swarm.behaviour_mut().gossipsub
            .publish(topic_for(&peer_id), encrypted)?;
        Ok(())
    }
}`,
  },
  matrix: {
    name: "Matrix-Lite",
    tagline: "The Scale Mode",
    icon: "M",
    color: "#10b981",
    protocol: "Matrix Client-Server API v1.x",
    encryption: "Megolm (group ratchet) + Olm (1:1 X3DH/DR)",
    transport: "HTTPS to Matrix homeserver (sync via /sync endpoint)",
    deps: ["matrix-sdk (headless, no-ui feature)", "vodozemac (olm/megolm)", "reqwest (rustls-tls)", "rusqlite"],
    binarySize: "~6.1 MB estimated",
    useCase: "Join federated communities and large rooms. Best for users who need group persistence, bridging to other platforms, and server-side history.",
    tradeoffs: {
      pros: [
        "Federation: join any Matrix homeserver",
        "Large group rooms with server-side history",
        "Bridges to Slack, Discord, IRC, etc.",
        "Well-specified E2EE (Olm/Megolm)",
        "Push notifications via /sync",
      ],
      cons: [
        "Largest binary of the three modes",
        "Metadata visible to homeserver",
        "Initial /sync can be slow for large accounts",
        "Key verification UX is complex",
      ],
    },
    snippet: `// drivers/matrix/src/lib.rs
use minima_engine::{ChatEngine, Message, Contact};
use matrix_sdk::{
    Client, Room,
    ruma::{
        events::room::message::RoomMessageEventContent,
        UserId,
    },
    config::SyncSettings,
};
use vodozemac::olm::Account;

pub struct MatrixEngine {
    client: Client,
    olm_account: Account,
    sync_token: Option<String>,
}

impl ChatEngine for MatrixEngine {
    type Config = MatrixConfig;
    type Error = MatrixError;

    async fn connect(config: MatrixConfig) -> Result<Self, MatrixError> {
        let client = Client::builder()
            .homeserver_url(&config.homeserver)
            .sled_store(&config.state_dir)?
            .build()
            .await?;

        client
            .login_username(&config.user_id, &config.password)
            .send()
            .await?;

        // Initial sync to populate room state
        client.sync_once(SyncSettings::default()).await?;

        Ok(Self {
            client,
            olm_account: Account::new(),
            sync_token: None,
        })
    }

    async fn send(&mut self, to: &str, plaintext: &[u8]) -> Result<(), MatrixError> {
        let room = self.client.get_room(
            &to.try_into()?
        ).ok_or(MatrixError::RoomNotFound)?;

        let content = RoomMessageEventContent::text_plain(
            String::from_utf8(plaintext.to_vec())?
        );
        room.send(content).await?;
        Ok(())
    }
}`,
  },
};

export function ModeExplorer() {
  const [active, setActive] = useState<Mode>("xmpp");
  const m = modes[active];

  return (
    <section className="modes-section">
      <div className="section-header">
        <h2>Protocol Modes</h2>
        <p>
          Three compile-time-selectable drivers. Build with{" "}
          <code>cargo build --features xmpp</code> to include only what you
          need.
        </p>
      </div>

      <div className="mode-switcher">
        {(Object.keys(modes) as Mode[]).map((key) => (
          <button
            key={key}
            className={`mode-btn ${active === key ? "active" : ""}`}
            style={{ "--mode-color": modes[key].color } as React.CSSProperties}
            onClick={() => setActive(key)}
          >
            <span className="mode-icon" style={{ background: modes[key].color }}>
              {modes[key].icon}
            </span>
            <span className="mode-label">{modes[key].name}</span>
          </button>
        ))}
      </div>

      <div className="mode-detail" style={{ borderColor: m.color }}>
        <div className="mode-header">
          <h3 style={{ color: m.color }}>{m.name}</h3>
          <span className="mode-tagline">{m.tagline}</span>
        </div>

        <div className="mode-grid">
          <div className="mode-specs">
            <div className="spec-row">
              <span className="spec-label">Protocol</span>
              <span className="spec-value">{m.protocol}</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Encryption</span>
              <span className="spec-value">{m.encryption}</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Transport</span>
              <span className="spec-value">{m.transport}</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Est. Binary</span>
              <span className="spec-value">{m.binarySize}</span>
            </div>
          </div>

          <div className="mode-deps">
            <span className="spec-label">Dependencies</span>
            <div className="dep-list">
              {m.deps.map((d) => (
                <span key={d} className="dep-chip">{d}</span>
              ))}
            </div>
          </div>
        </div>

        <p className="mode-usecase">{m.useCase}</p>

        <div className="tradeoffs">
          <div className="tradeoff-col">
            <h4>Strengths</h4>
            <ul>
              {m.tradeoffs.pros.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <div className="tradeoff-col">
            <h4>Trade-offs</h4>
            <ul>
              {m.tradeoffs.cons.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="snippet-block">
          <h4>Implementation Preview</h4>
          <pre className="code-block">{m.snippet}</pre>
        </div>
      </div>
    </section>
  );
}
