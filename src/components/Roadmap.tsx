const phases = [
  {
    phase: 1,
    name: "Foundation — The Engine",
    status: "active",
    color: "#3b82f6",
    goal: "Core communication module with a unified base and basic CLI commands.",
    milestones: [
      { done: true, text: "Cargo workspace setup with modular crate layout" },
      { done: false, text: "ChatEngine trait definition with async methods" },
      { done: false, text: "SQLite-backed KeyStore for identity/session keys" },
      { done: false, text: "Double Ratchet implementation (AES-256-GCM + HKDF)" },
      { done: false, text: "CLI skeleton: login, send, receive, list-contacts" },
      { done: false, text: "Local loopback test: encrypt → transmit → decrypt between two instances" },
    ],
    successMetric: "A single binary under 5MB that exchanges an encrypted string between two local machines.",
    estimatedSize: "< 3MB",
  },
  {
    phase: 2,
    name: "The Switch — Multi-Protocol",
    status: "planned",
    color: "#8b5cf6",
    goal: "Integrate all three protocols as selectable drivers behind the unified ChatEngine interface.",
    milestones: [
      { done: false, text: "Cargo feature flags: --features xmpp, --features p2p, --features matrix" },
      { done: false, text: "XMPP driver: connect to real server, OMEMO key exchange, send/receive" },
      { done: false, text: "P2P driver: libp2p swarm, gossipsub topics, NAT relay fallback" },
      { done: false, text: "Matrix driver: headless SDK integration, /sync loop, room join" },
      { done: false, text: "Unified config: ~/.minima/config.toml with per-mode sections" },
      { done: false, text: "Mode switching: --mode xmpp|p2p|matrix CLI flag" },
    ],
    successMetric: "Switch modes without changing the binary. Each mode connects to real endpoints.",
    estimatedSize: "< 7MB (single mode), < 10MB (all modes)",
  },
  {
    phase: 3,
    name: "Polish & Distribution",
    status: "future",
    color: "#10b981",
    goal: "Cross-platform builds, installation tooling, and security hardening.",
    milestones: [
      { done: false, text: "Cross-compile: x86_64, ARMv7 (RPi), RISC-V, aarch64" },
      { done: false, text: "Static builds with musl (no glibc dependency)" },
      { done: false, text: "Install script: cert generation, key storage init" },
      { done: false, text: "Security audit of key exchange and ratchet logic" },
      { done: false, text: "CI pipeline: build + test on all target architectures" },
      { done: false, text: "Release packaging: tarball + checksum + man page" },
    ],
    successMetric: "Full distribution package. All three modes function in under 10MB total.",
    estimatedSize: "< 8MB average across platforms",
  },
];

export function Roadmap() {
  return (
    <section className="roadmap-section">
      <div className="section-header">
        <h2>Roadmap</h2>
        <p>Three phases from single-binary prototype to full multi-protocol distribution.</p>
      </div>

      <div className="timeline">
        {phases.map((p, i) => (
          <div key={p.phase} className="phase-card" style={{ "--phase-color": p.color } as React.CSSProperties}>
            <div className="phase-header">
              <div className="phase-badge" style={{ background: p.color }}>
                {p.phase}
              </div>
              <div>
                <h3>{p.name}</h3>
                <span className="phase-status">{p.status}</span>
              </div>
              <span className="phase-size">{p.estimatedSize}</span>
            </div>
            <p className="phase-goal">{p.goal}</p>
            <ul className="milestones">
              {p.milestones.map((m) => (
                <li key={m.text} className={m.done ? "done" : ""}>
                  <span className="check">{m.done ? "\u2713" : "\u25CB"}</span>
                  {m.text}
                </li>
              ))}
            </ul>
            <div className="success-metric">
              <span className="metric-label">Success Metric</span>
              <span className="metric-text">{p.successMetric}</span>
            </div>
            {i < phases.length - 1 && (
              <div className="phase-connector" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
