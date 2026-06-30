import { useState } from "react";

type Mode = "xmpp-only" | "p2p-only" | "matrix-only" | "all";

const budgets: Record<
  Mode,
  {
    label: string;
    total: number;
    items: { name: string; size: number; color: string }[];
  }
> = {
  "xmpp-only": {
    label: "XMPP-only build",
    total: 4.2,
    items: [
      { name: "minima-cli", size: 0.3, color: "#3b82f6" },
      { name: "minima-engine", size: 0.5, color: "#8b5cf6" },
      { name: "minima-crypto", size: 0.8, color: "#f59e0b" },
      { name: "xmpp-rs", size: 1.1, color: "#10b981" },
      { name: "libsignal-protocol", size: 0.9, color: "#ef4444" },
      { name: "rusqlite", size: 0.4, color: "#6366f1" },
      { name: "rustls + ring", size: 0.2, color: "#ec4899" },
    ],
  },
  "p2p-only": {
    label: "P2P-only build",
    total: 5.8,
    items: [
      { name: "minima-cli", size: 0.3, color: "#3b82f6" },
      { name: "minima-engine", size: 0.5, color: "#8b5cf6" },
      { name: "minima-crypto", size: 0.8, color: "#f59e0b" },
      { name: "libp2p", size: 2.4, color: "#10b981" },
      { name: "noise protocol", size: 0.6, color: "#ef4444" },
      { name: "rusqlite", size: 0.4, color: "#6366f1" },
      { name: "tokio (rt)", size: 0.8, color: "#ec4899" },
    ],
  },
  "matrix-only": {
    label: "Matrix-only build",
    total: 6.1,
    items: [
      { name: "minima-cli", size: 0.3, color: "#3b82f6" },
      { name: "minima-engine", size: 0.5, color: "#8b5cf6" },
      { name: "minima-crypto", size: 0.4, color: "#f59e0b" },
      { name: "matrix-sdk (headless)", size: 2.8, color: "#10b981" },
      { name: "vodozemac", size: 0.9, color: "#ef4444" },
      { name: "reqwest", size: 0.6, color: "#6366f1" },
      { name: "rusqlite", size: 0.4, color: "#ec4899" },
      { name: "serde + ruma types", size: 0.2, color: "#f97316" },
    ],
  },
  all: {
    label: "All modes (unified binary)",
    total: 9.4,
    items: [
      { name: "minima-cli", size: 0.3, color: "#3b82f6" },
      { name: "minima-engine", size: 0.5, color: "#8b5cf6" },
      { name: "minima-crypto", size: 0.8, color: "#f59e0b" },
      { name: "xmpp driver", size: 2.0, color: "#10b981" },
      { name: "p2p driver", size: 3.0, color: "#ef4444" },
      { name: "matrix driver", size: 2.4, color: "#6366f1" },
      { name: "shared (sql, tls, tokio)", size: 0.4, color: "#ec4899" },
    ],
  },
};

const buildCommands: Record<Mode, string> = {
  "xmpp-only":
    "cargo build --release --no-default-features --features xmpp --target x86_64-unknown-linux-musl",
  "p2p-only":
    "cargo build --release --no-default-features --features p2p --target x86_64-unknown-linux-musl",
  "matrix-only":
    "cargo build --release --no-default-features --features matrix --target x86_64-unknown-linux-musl",
  all: "cargo build --release --features xmpp,p2p,matrix --target x86_64-unknown-linux-musl",
};

export function SizeBudget() {
  const [mode, setMode] = useState<Mode>("xmpp-only");
  const b = budgets[mode];
  const maxSize = 10;

  return (
    <section className="size-section">
      <div className="section-header">
        <h2>Binary Size Budget</h2>
        <p>
          Every byte is accounted for. Feature flags let you build only what you
          need to stay under the 10MB ceiling.
        </p>
      </div>

      <div className="size-mode-tabs">
        {(Object.keys(budgets) as Mode[]).map((key) => (
          <button
            key={key}
            className={`size-tab ${mode === key ? "active" : ""}`}
            onClick={() => setMode(key)}
          >
            {budgets[key].label}
          </button>
        ))}
      </div>

      <div className="size-overview">
        <div className="size-ring-container">
          <SizeRing used={b.total} max={maxSize} color={b.items[0].color} />
          <div className="size-ring-label">
            <span className="size-number">{b.total.toFixed(1)}</span>
            <span className="size-unit">MB</span>
            <span className="size-of">of {maxSize}MB</span>
          </div>
        </div>

        <div className="size-bar-chart">
          {b.items.map((item) => (
            <div key={item.name} className="bar-row">
              <span className="bar-label">{item.name}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${(item.size / maxSize) * 100}%`,
                    background: item.color,
                  }}
                />
              </div>
              <span className="bar-value">{item.size.toFixed(1)}MB</span>
            </div>
          ))}
          <div className="bar-row bar-remaining">
            <span className="bar-label">Headroom</span>
            <div className="bar-track">
              <div
                className="bar-fill bar-fill-remaining"
                style={{ width: `${((maxSize - b.total) / maxSize) * 100}%` }}
              />
            </div>
            <span className="bar-value">
              {(maxSize - b.total).toFixed(1)}MB
            </span>
          </div>
        </div>
      </div>

      <div className="build-command">
        <span className="cmd-label">Build command</span>
        <code>{buildCommands[mode]}</code>
      </div>

      <div className="size-tips">
        <h4>Size Optimization Techniques</h4>
        <ul>
          <li>
            <code>Cargo.toml</code> — <code>[profile.release]</code> with{" "}
            <code>opt-level = "z"</code> (size) + <code>lto = true</code> +{" "}
            <code>codegen-units = 1</code>
          </li>
          <li>
            <code>strip = true</code> — Remove debug symbols and DWARF info
          </li>
          <li>
            <code>panic = "abort"</code> — No unwinding, saves ~200KB
          </li>
          <li>musl static linking — Single binary, no glibc dependency</li>
          <li>Feature gates — Only compile the protocol drivers you need</li>
          <li>Avoid OpenSSL — rustls + ring is ~300KB vs ~2MB for OpenSSL</li>
        </ul>
      </div>
    </section>
  );
}

function SizeRing({ used, max }: { used: number; max: number; color: string }) {
  const pct = Math.min(used / max, 1);
  const r = 70;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);

  return (
    <svg width="180" height="180" viewBox="0 0 180 180">
      <circle
        cx="90"
        cy="90"
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="12"
      />
      <circle
        cx="90"
        cy="90"
        r={r}
        fill="none"
        stroke={pct > 0.9 ? "#ef4444" : pct > 0.7 ? "#f59e0b" : "#10b981"}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform="rotate(-90 90 90)"
        style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease" }}
      />
    </svg>
  );
}
