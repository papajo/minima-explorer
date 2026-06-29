import { useState } from "react";

const layers = [
  {
    id: "cli",
    name: "CLI Layer",
    subtitle: "minima-cli",
    color: "#3b82f6",
    desc: "Argument parsing, config loading, user I/O. Built with clap. Knows nothing about protocols — only dispatches to the engine via the ChatEngine trait.",
    details: [
      "Config file parsing (~/.minima/config.toml)",
      "Subcommands: login, send, receive, list-contacts, switch-mode",
      "Output formatting (plain text, JSON for scripting)",
      "Signal handling (graceful shutdown)",
    ],
  },
  {
    id: "engine",
    name: "Engine Layer",
    subtitle: "minima-engine",
    color: "#8b5cf6",
    desc: "Defines the ChatEngine trait — the universal interface that all protocol drivers must implement. Handles key management, session state, and message routing.",
    details: [
      "trait ChatEngine { connect, send, receive, ... }",
      "KeyStore abstraction (SQLite-backed)",
      "Message envelope: sender, recipient, ciphertext, timestamp",
      "Session lifecycle management",
      "Double Ratchet state machine (shared across modes)",
    ],
  },
  {
    id: "drivers",
    name: "Protocol Drivers",
    subtitle: "minima-xmpp · minima-p2p · minima-matrix",
    color: "#10b981",
    desc: "Three independent crates, each implementing ChatEngine for their protocol. Linked at compile time via Cargo features to avoid bundling unused code.",
    details: [
      "minima-xmpp: XMPP + OMEMO (xmpp-rs, libsignal-protocol)",
      "minima-p2p: libp2p gossipsub + noise encryption",
      "minima-matrix: matrix-rs-sdk (headless, no UI crate)",
    ],
  },
  {
    id: "transport",
    name: "Transport & Crypto",
    subtitle: "minima-crypto · system TLS",
    color: "#f59e0b",
    desc: "Shared cryptographic primitives and transport wrappers. Uses rustls (no OpenSSL) for TLS 1.3. X3DH + Double Ratchet for E2EE across all modes.",
    details: [
      "X3DH key agreement (x25519-dalek)",
      "Double Ratchet (custom impl over AES-256-GCM + HKDF)",
      "rustls for TLS (ring backend, no OpenSSL dependency)",
      "Ed25519 signatures for identity keys",
    ],
  },
];

export function ArchDiagram() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="arch-section">
      <div className="section-header">
        <h2>Layered Architecture</h2>
        <p>
          Strategy pattern: the CLI never touches protocol code directly. Each
          mode implements the same <code>ChatEngine</code> trait, linked at
          compile time via Cargo features.
        </p>
      </div>

      <div className="arch-stack">
        {layers.map((layer, i) => (
          <div key={layer.id}>
            <button
              className={`arch-layer ${expanded === layer.id ? "expanded" : ""}`}
              style={{ "--layer-color": layer.color } as React.CSSProperties}
              onClick={() => setExpanded(expanded === layer.id ? null : layer.id)}
            >
              <div className="layer-marker">
                <span className="layer-index">{i + 1}</span>
              </div>
              <div className="layer-info">
                <div className="layer-name">{layer.name}</div>
                <div className="layer-subtitle">{layer.subtitle}</div>
              </div>
              <div className="layer-desc">{layer.desc}</div>
              <svg className="chevron" width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M6 8L10 12L14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            {expanded === layer.id && (
              <div className="layer-details" style={{ borderColor: layer.color }}>
                <ul>
                  {layer.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {i < layers.length - 1 && (
              <div className="arch-arrow">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5V19M12 19L6 13M12 19L18 13" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="trait-box">
        <div className="trait-label">The Core Abstraction</div>
        <pre className="trait-code">{`// minima-engine/src/lib.rs
pub trait ChatEngine {
    type Config;
    type Error: std::error::Error;

    async fn connect(config: Self::Config) -> Result<Self, Self::Error>
    where
        Self: Sized;

    async fn send(&mut self, to: &str, plaintext: &[u8]) -> Result<(), Self::Error>;
    async fn receive(&mut self) -> Result<Message, Self::Error>;
    async fn list_contacts(&self) -> Result<Vec<Contact>, Self::Error>;
    async fn disconnect(&mut self) -> Result<(), Self::Error>;
}`}</pre>
      </div>
    </section>
  );
}
