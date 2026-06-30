import { useState } from "react";

type Step =
  | "overview"
  | "cargo-bloat"
  | "profile"
  | "stripping"
  | "config"
  | "cross-compile"
  | "audit";

const steps: { id: Step; label: string; num: number }[] = [
  { id: "overview", label: "Overview", num: 0 },
  { id: "cargo-bloat", label: "Bloat Analysis", num: 1 },
  { id: "profile", label: "Release Profile", num: 2 },
  { id: "stripping", label: "Binary Stripping", num: 3 },
  { id: "config", label: "Config & Paths", num: 4 },
  { id: "cross-compile", label: "Cross-Compile", num: 5 },
  { id: "audit", label: "Final Audit", num: 6 },
];

const stepContent: Record<
  Step,
  {
    title: string;
    desc: string;
    sections: { heading: string; body: string; code?: string }[];
  }
> = {
  overview: {
    title: "Phase 4: Optimization & Final Polish",
    desc: "The final pass to guarantee every build ships under 10MB. This covers release profile tuning, dependency auditing with cargo-bloat, binary stripping, cross-compilation for all target architectures, and configuration path handling across Linux and macOS.",
    sections: [
      {
        heading: "Optimization Strategy",
        body: "Size optimization is a layered approach. Each layer saves different amounts. You apply them in order from largest impact to smallest. The goal: get from 'debug build' (~50MB) to 'release stripped' (<10MB).",
        code: `// Optimization layers (apply in order):
//
// Layer 1: Release profile          ~60% reduction
//   opt-level="z", lto, codegen-units=1, panic=abort
//
// Layer 2: Dependency pruning       ~20% reduction
//   Remove unused features, replace heavy crates
//
// Layer 3: Binary stripping         ~15% reduction
//   strip=true, remove debug symbols, DWARF info
//
// Layer 4: Linker optimization      ~5% reduction
//   gc-sections, link-arg=-s
//
// Layer 5: UPX compression          ~30% reduction (optional)
//   Compress the final binary (runtime decompression)
//
// Debug build:         ~50MB
// After Layer 1:       ~12MB
// After Layer 2:       ~8MB
// After Layer 3:       ~6.5MB
// After Layer 4:       ~6.2MB
// After Layer 5:       ~4MB (optional, adds startup latency)
//
// Target: <10MB — achievable after Layer 3 for all modes.`,
      },
      {
        heading: "Toolchain Requirements",
        body: "We need specific tools for optimization. These are development dependencies only — they don't ship in the binary.",
        code: `# Install optimization tools (dev dependencies only)
cargo install cargo-bloat        # Analyze what's in the binary
cargo install cargo-tree         # Dependency tree visualization
cargo install cargo-audit        # Security vulnerability scanning
cargo install cargo-udeps        # Find unused dependencies
cargo install cargo-expand       # See macro expansions
cargo install cross              # Cross-compilation made easy

# For UPX compression (optional):
# Linux: apt install upx-ucl
# macOS: brew install upx

# Target architectures:
rustup target add x86_64-unknown-linux-musl
rustup target add aarch64-unknown-linux-musl
rustup target add armv7-unknown-linux-musleabihf
rustup target add riscv64gc-unknown-linux-gnu`,
      },
    ],
  },
  "cargo-bloat": {
    title: "Step 1: Dependency Bloat Analysis",
    desc: "cargo-bloat shows exactly which functions and crates are consuming binary space. This is the single most important tool for size optimization.",
    sections: [
      {
        heading: "Running cargo-bloat",
        body: "Run cargo-bloat on each feature configuration to see where the bytes go. The output shows per-crate and per-function size breakdowns.",
        code: `# Analyze XMPP-only build
cargo bloat --release \\
  --no-default-features --features xmpp \\
  --target x86_64-unknown-linux-musl \\
  -n 30

# Analyze P2P-only build
cargo bloat --release \\
  --no-default-features --features p2p \\
  --target x86_64-unknown-linux-musl \\
  -n 30

# Analyze Matrix-only build
cargo bloat --release \\
  --no-default-features --features matrix \\
  --target x86_64-unknown-linux-musl \\
  -n 30

# Analyze all-modes build
cargo bloat --release \\
  --features xmpp,p2p,matrix \\
  --target x86_64-unknown-linux-musl \\
  -n 30`,
      },
      {
        heading: "Expected cargo-bloat Output",
        body: "The output shows the largest contributors. Here's what you'd expect for each mode and what to do about each one.",
        code: `# Typical cargo-bloat output for XMPP-only build:
#
# File  .text    Size   Crate
# 10.0%  22.1%  842K   ring              <- crypto backend (required)
#  8.2%  18.1%  690K   xmpp_rs           <- XMPP parser (required)
#  6.4%  14.1%  538K   libsignal_crypto  <- Signal Protocol (required)
#  5.8%  12.8%  488K   rusqlite          <- SQLite (required)
#  4.2%   9.3%  354K   rustls            <- TLS (required)
#  3.1%   6.8%  260K   tokio             <- async runtime (required)
#  2.8%   6.2%  236K   minima_xmpp       <- our code
#  1.9%   4.2%  160K   minima_crypto     <- our code
#  1.2%   2.6%  100K   minima_engine     <- our code
#  0.8%   1.8%   68K   minima_cli        <- our code
#  0.6%   1.3%   50K   serde             <- serialization
#  0.3%   0.7%   26K   [other]           <- misc
# ─────────────────────────────────────
# Total .text: ~4.2MB (stripped)
#
# ACTION ITEMS:
# ring (842K):          Required. No lighter alternative for AES-GCM.
# xmpp_rs (690K):      Required. Check if we can disable XML validation.
# libsignal (538K):    Required. Core OMEMO encryption.
# rusqlite (488K):     Required. Check if we can use rusqlite without "bundled" and link system SQLite.
# rustls (354K):       Required. Already using ring backend (lightest).
# tokio (260K):        Check if we can use tokio with fewer features.
#
# SUSPICIOUS ENTRIES TO INVESTIGATE:
# If you see > 100K from: serde, serde_json, regex, unicode, anyerror
# These are signs of pulling in too much.`,
      },
      {
        heading: "Common Bloat Sources & Fixes",
        body: "The usual suspects for unexpected binary bloat and how to eliminate each one.",
        code: `// Common bloat sources and their fixes:
//
// 1. serde with ALL features
//    Problem: serde_derive pulls in the entire serde machinery
//    Fix: Use #[derive(Serialize, Deserialize)] only on types that need it.
//         Avoid serde_json::from_value — use serde_json::from_str instead.
//         In Cargo.toml: serde = { version = "1", features = ["derive"] }
//         NOT: serde = { version = "1", features = ["derive", "rc", "alloc"] }
//
// 2. regex crate
//    Problem: regex compiles a full regex engine (~300KB)
//    Fix: Don't use regex. Use simple string matching (.contains(), .starts_with()).
//         If you must: use regex-lite crate (~50KB) instead.
//
// 3. chrono with all features
//    Problem: chrono pulls in time zone database (~200KB)
//    Fix: Use chrono = { version = "0.4", default-features = false, features = ["clock"] }
//         Or: use time crate (lighter) or just SystemTime directly.
//
// 4. tracing with all features
//    Problem: Full tracing subscriber pulls in regex, chrono, etc.
//    Fix: tracing = "0.1" (just the facade, no subscriber).
//         For output: use tracing-subscriber with "fmt" feature only.
//         In release: disable tracing entirely with a feature flag.
//
// 5. anyhow
//    Problem: anyhow is great for apps but adds ~50KB
//    Fix: In libraries, use thiserror instead. anyhow only in the CLI crate.
//
// 6. reqwest with default features
//    Problem: reqwest defaults pull in HTTP/2, brotli, cookies, etc.
//    Fix: reqwest = { default-features = false, features = ["rustls-tls", "json"] }
//
// 7. OpenSSL (transitive dependency)
//    Problem: OpenSSL adds ~2MB. Often pulled in accidentally.
//    Fix: Audit with \`cargo tree -i openssl\`. Replace with rustls.
//         Set environment: OPENSSL_NO_VENDOR=1 to force failure if OpenSSL is pulled.`,
      },
    ],
  },
  profile: {
    title: "Step 2: Release Profile Configuration",
    desc: "The Cargo.toml release profile is the single biggest lever for binary size. Every setting here has a measurable impact.",
    sections: [
      {
        heading: "Optimal release-profile.toml",
        body: "Every field is annotated with its impact. This is the complete release profile for Minima.",
        code: `# Cargo.toml — release profile
# Every setting here is measured and justified.

[profile.release]
# opt-level: Optimization level for speed vs size
# "z" = optimize aggressively for SIZE (slower at runtime)
# "s" = optimize for size (less aggressive)
# "3" = optimize for speed (largest binary)
# We use "z" because binary size is our primary constraint.
opt-level = "z"

# lto: Link-Time Optimization
# true = full LTO across all crates (slowest compile, smallest binary)
# "fat" = same as true
# "thin" = faster compile, slightly larger binary
# false = no LTO (largest binary)
# Full LTO typically saves 10-20% binary size.
lto = true

# codegen-units: Parallel code generation units
# 1 = single unit (slowest compile, best optimization)
# 16 = default (fast compile, worse optimization)
# Single unit allows the compiler to optimize across the entire program.
codegen-units = 1

# panic: Panic strategy
# "abort" = immediate process exit on panic (no unwinding)
# "unwind" = stack unwinding on panic (larger binary)
# "abort" saves ~200KB by removing unwinding tables and landing pads.
# Trade-off: no catch_unwind(), no Drop on panic. Acceptable for a CLI.
panic = "abort"

# strip: Remove debug symbols
# true = strip all symbols (smallest binary)
# "debuginfo" = strip only debug info, keep symbol names
# false = keep everything
# Stripping saves 15-30% of binary size.
strip = true

# incremental: Incremental compilation
# false = no incremental (required for full LTO)
# true = incremental (faster dev builds, but incompatible with LTO)
incremental = false

# overflow-checks: Integer overflow checking
# false = no overflow checks (slightly smaller, slightly faster)
# true = overflow checks (default in debug)
# We keep true for safety in crypto code.
overflow-checks = true`,
      },
      {
        heading: "Feature Flag Gating",
        body: "Use Cargo features to exclude protocol drivers you don't need. Each excluded driver saves 1-3MB.",
        code: `# Root Cargo.toml features section
[features]
# Default: XMPP only (smallest build)
default = ["xmpp"]

# Individual protocol drivers
xmpp = ["dep:xmpp-rs", "dep:libsignal-protocol", "minima-xmpp"]
p2p = ["dep:libp2p", "minima-p2p"]
matrix = ["dep:matrix-sdk", "dep:vodozemac", "minima-matrix"]

# Convenience: all protocols in one binary
all-modes = ["xmpp", "p2p", "matrix"]

# Development features (NOT for release)
dev-logging = ["tracing-subscriber/fmt"]
dev-metrics = ["dep:metrics"]

# Build commands:
#
# Smallest (XMPP only, ~4.2MB):
# cargo build --release --no-default-features --features xmpp
#
# P2P only (~5.8MB):
# cargo build --release --no-default-features --features p2p
#
# Matrix only (~6.1MB):
# cargo build --release --no-default-features --features matrix
#
# Everything (~9.4MB):
# cargo build --release --features all-modes
#
# With debug logging (development only):
# cargo build --release --features xmpp,dev-logging`,
      },
      {
        heading: "Cargo.toml Workspace Configuration",
        body: "Ensure all workspace crates inherit the release profile. The profile is defined once at the workspace root.",
        code: `# Workspace root Cargo.toml
[workspace]
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

# Shared dependencies — pin versions here
# Individual crates use workspace = true
[workspace.dependencies]
tokio = { version = "1", features = ["rt", "macros"] }
serde = { version = "1", features = ["derive"] }
thiserror = "2"
tracing = "0.1"
rusqlite = { version = "0.31", features = ["bundled"] }

# IMPORTANT: The [profile.release] section is inherited
# by ALL workspace members automatically.
# You only define it ONCE at the workspace root.

# Individual crate Cargo.toml files just reference workspace deps:
# [dependencies]
# tokio = { workspace = true }
# serde = { workspace = true }`,
      },
    ],
  },
  stripping: {
    title: "Step 3: Binary Stripping & Linker Optimization",
    desc: "After the compiler produces the binary, the linker can still remove dead code and strip symbols. This is the final size reduction pass.",
    sections: [
      {
        heading: "Linker Flags for Size",
        body: "Pass additional flags to the linker to remove unused sections and strip symbol tables.",
        code: `# .cargo/config.toml — linker flags for size optimization
# Place this in the project root.

# For Linux (GNU ld / lld)
[target.x86_64-unknown-linux-musl]
rustflags = [
    "-C", "link-arg=-s",         # Strip symbol table
    "-C", "link-arg=-Wl,--gc-sections",  # Remove unused sections
    "-C", "link-arg=-Wl,--as-needed",    # Only link needed libraries
]

# For macOS
[target.x86_64-apple-darwin]
rustflags = [
    "-C", "link-arg=-s",         # Strip symbol table
    "-C", "link-arg=-Wl,-dead_strip",  # Remove dead code
]

# For ARM (Raspberry Pi)
[target.armv7-unknown-linux-musleabihf]
rustflags = [
    "-C", "link-arg=-s",
    "-C", "link-arg=-Wl,--gc-sections",
    "-C", "link-arg=-Wl,--as-needed",
]

# For aarch64 (Apple Silicon, ARM64 Linux)
[target.aarch64-unknown-linux-musl]
rustflags = [
    "-C", "link-arg=-s",
    "-C", "link-arg=-Wl,--gc-sections",
    "-C", "link-arg=-Wl,--as-needed",
]

# For RISC-V
[target.riscv64gc-unknown-linux-gnu]
rustflags = [
    "-C", "link-arg=-s",
    "-C", "link-arg=-Wl,--gc-sections",
]

# Note: cargo-strip (strip = true in profile) handles most of this,
# but the linker flags provide additional gc-sections optimization
# that strip alone doesn't do.`,
      },
      {
        heading: "Manual Stripping (if needed)",
        body: "If the automated strip=true doesn't fully strip (some toolchains have bugs), do it manually.",
        code: `#!/bin/bash
# scripts/strip-binary.sh
# Manual binary stripping for maximum size reduction.

set -euo pipefail

BINARY="$1"
OUTPUT="$2"

echo "Original size: $(du -h "$BINARY" | cut -f1)"

# Copy the binary first (strip modifies in-place)
cp "$BINARY" "$OUTPUT"

# Strip all symbols
strip --strip-all "$OUTPUT"
echo "After strip: $(du -h "$OUTPUT" | cut -f1)"

# Remove ELF sections that strip doesn't catch
# (comment section, debug sections, etc.)
if command -v sstrip &> /dev/null; then
    sstrip "$OUTPUT"
    echo "After sstrip: $(du -h "$OUTPUT" | cut -f1)"
fi

# Optional: UPX compression
# Adds ~100ms startup latency but saves 30-40% size
if command -v upx &> /dev/null; then
    upx --best --lzma "$OUTPUT"
    echo "After UPX: $(du -h "$OUTPUT" | cut -f1)"
fi

echo "Final size: $(du -h "$OUTPUT" | cut -f1)"
echo "Size budget remaining: $(echo "10 - $(du -m "$OUTPUT" | cut -f1)" | bc)MB"`,
      },
      {
        heading: "Size Measurement Script",
        body: "Automated script to measure binary size across all configurations and verify the <10MB constraint.",
        code: `#!/bin/bash
# scripts/measure-sizes.sh
# Measure binary size for all Minima build configurations.
# Run this in CI to verify the <10MB constraint.

set -euo pipefail

TARGET="x86_64-unknown-linux-musl"
BUDGET_MB=10

echo "=== Minima Binary Size Report ==="
echo "Target: $TARGET"
echo "Budget: $BUDGET_MB MB"
echo ""

PASS=true

for MODE in xmpp p2p matrix all-modes; do
    echo "Building $MODE..."

    if [ "$MODE" = "all-modes" ]; then
        FEATURES="xmpp,p2p,matrix"
    else
        FEATURES="$MODE"
    fi

    cargo build --release \\
        --no-default-features \\
        --features "$FEATURES" \\
        --target "$TARGET" \\
        --bin minima 2>/dev/null

    BINARY="target/$TARGET/release/minima"
    SIZE_BYTES=$(stat -f%z "$BINARY" 2>/dev/null || stat -c%s "$BINARY")
    SIZE_MB=$(echo "scale=1; $SIZE_BYTES / 1048576" | bc)

    if (( $(echo "$SIZE_MB > $BUDGET_MB" | bc -l) )); then
        echo "  $MODE: $SIZE_MB MB  OVER BUDGET"
        PASS=false
    else
        echo "  $MODE: $SIZE_MB MB  OK"
    fi
done

echo ""

if [ "$PASS" = "false" ]; then
    echo "FAIL: One or more modes exceed $BUDGET_MB MB budget"
    exit 1
fi

echo "PASS: All modes under $BUDGET_MB MB budget"`,
      },
    ],
  },
  config: {
    title: "Step 4: Configuration & Path Handling",
    desc: "Cross-platform configuration: paths that work on Linux and macOS, proper XDG compliance, and clean config file management.",
    sections: [
      {
        heading: "Platform-Aware Path Resolution",
        body: "Minima must work on Linux (XDG Base Directory spec) and macOS (same spec, different defaults). The config, keys, and state directories must resolve correctly on both.",
        code: `// crates/cli/src/paths.rs
use std::path::PathBuf;
use tracing::debug;

/// Resolves Minima's data directories following platform conventions.
///
/// Linux:  ~/.config/minima/  (XDG_CONFIG_HOME)
///         ~/.local/share/minima/ (XDG_DATA_HOME)
///         ~/.cache/minima/ (XDG_CACHE_HOME)
///
/// macOS:  ~/Library/Application Support/minima/
///         ~/Library/Caches/minima/
///
/// Both:   $MINIMA_HOME overrides everything (useful for containers)
pub struct MinimaPaths {
    pub config_dir: PathBuf,
    pub data_dir: PathBuf,
    pub cache_dir: PathBuf,
}

impl MinimaPaths {
    /// Resolve Minima's directories using platform conventions.
    pub fn resolve() -> Result<Self, PathError> {
        // Allow override via environment variable
        if let Ok(home) = std::env::var("MINIMA_HOME") {
            let base = PathBuf::from(home);
            return Ok(Self {
                config_dir: base.join("config"),
                data_dir: base.join("data"),
                cache_dir: base.join("cache"),
            });
        }

        let dirs = Self::platform_dirs()?;

        // Ensure all directories exist
        std::fs::create_dir_all(&dirs.config_dir)?;
        std::fs::create_dir_all(&dirs.data_dir)?;
        std::fs::create_dir_all(&dirs.cache_dir)?;

        debug!("Config dir: {}", dirs.config_dir.display());
        debug!("Data dir:   {}", dirs.data_dir.display());
        debug!("Cache dir:  {}", dirs.cache_dir.display());

        Ok(dirs)
    }

    fn platform_dirs() -> Result<Self, PathError> {
        let home = dirs::home_dir()
            .ok_or(PathError::NoHomeDir)?;

        #[cfg(target_os = "macos")]
        {
            Ok(Self {
                config_dir: home.join("Library/Application Support/minima"),
                data_dir: home.join("Library/Application Support/minima"),
                cache_dir: home.join("Library/Caches/minima"),
            })
        }

        #[cfg(target_os = "linux")]
        {
            let config_base = std::env::var("XDG_CONFIG_HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|_| home.join(".config"));
            let data_base = std::env::var("XDG_DATA_HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|_| home.join(".local/share"));
            let cache_base = std::env::var("XDG_CACHE_HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|_| home.join(".cache"));

            Ok(Self {
                config_dir: config_base.join("minima"),
                data_dir: data_base.join("minima"),
                cache_dir: cache_base.join("minima"),
            })
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            Ok(Self {
                config_dir: home.join(".minima/config"),
                data_dir: home.join(".minima/data"),
                cache_dir: home.join(".minima/cache"),
            })
        }
    }

    /// Path to the main config file.
    pub fn config_file(&self) -> PathBuf {
        self.config_dir.join("config.toml")
    }

    /// Path to the XMPP key store.
    pub fn xmpp_keystore(&self) -> PathBuf {
        self.data_dir.join("keys").join("xmpp.db")
    }

    /// Path to the P2P identity key.
    pub fn p2p_identity(&self) -> PathBuf {
        self.data_dir.join("keys").join("p2p-identity.key")
    }

    /// Path to the P2P peer database.
    pub fn p2p_peerdb(&self) -> PathBuf {
        self.data_dir.join("keys").join("p2p-peers.db")
    }

    /// Path to the Matrix state store.
    pub fn matrix_state(&self) -> PathBuf {
        self.data_dir.join("state").join("matrix")
    }

    /// Path to the log file.
    pub fn log_file(&self) -> PathBuf {
        self.cache_dir.join("minima.log")
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PathError {
    #[error("could not determine home directory")]
    NoHomeDir,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}`,
      },
      {
        heading: "Config File Schema (Cross-Platform)",
        body: "The minima.toml config file uses platform-agnostic paths. The path resolver expands ~ and handles platform differences.",
        code: `# ~/.config/minima/config.toml (Linux)
# ~/Library/Application Support/minima/config.toml (macOS)
# $MINIMA_HOME/config/config.toml (override)

# Default protocol mode
default_mode = "xmpp"

# ── XMPP Configuration ─────────────────────────────────────
[xmpp]
server = "xmpp.example.com"
port = 5223                     # 5223 = direct TLS, 5222 = STARTTLS
jid = "user@xmpp.example.com"
# Password: use environment variable for security
# export MINIMA_XMPP_PASSWORD="secret"
password_env = "MINIMA_XMPP_PASSWORD"
# Key store: auto-resolved to data directory
# Actual path: ~/.local/share/minima/keys/xmpp.db (Linux)
#              ~/Library/Application Support/minima/keys/xmpp.db (macOS)
key_store_path = "keys/xmpp.db"  # Relative to data dir

# ── P2P Configuration ──────────────────────────────────────
[p2p]
# Identity key: auto-resolved to data directory
identity_key_path = "keys/p2p-identity.key"
# Peer database: auto-resolved to data directory
peer_db_path = "keys/p2p-peers.db"
listen_port = 4001
# Bootstrap/relay peers for NAT traversal
bootstrap_peers = [
    "/dns4/relay1.minima.dev/tcp/4001/p2p/12D3KooWABC...",
    "/dns4/relay2.minima.dev/tcp/4001/p2p/12D3KooWDEF...",
]

# ── Matrix Configuration ───────────────────────────────────
[matrix]
homeserver = "https://matrix.org"
user_id = "@user:matrix.org"
# Password: use environment variable
password_env = "MINIMA_MATRIX_PASSWORD"
# State store: auto-resolved to data directory
state_dir = "state/matrix"

# ── Logging (optional) ─────────────────────────────────────
[logging]
level = "info"                  # trace, debug, info, warn, error
file = true                     # Log to file (in cache dir)
console = true                  # Log to stderr

# ── Security (optional) ────────────────────────────────────
[security]
# Require E2EE for all messages (refuse to send to unencrypted rooms)
require_encryption = true
# Auto-accept key verification requests (for automation)
auto_verify = false`,
      },
      {
        heading: "Config Loader with Path Resolution",
        body: "Loads the config file and resolves all relative paths to absolute paths.",
        code: `// crates/cli/src/config.rs
use serde::Deserialize;
use std::path::PathBuf;
use crate::paths::MinimaPaths;

#[derive(Debug, Deserialize)]
pub struct MinimaConfig {
    pub default_mode: Option<String>,
    pub xmpp: Option<XmppConfig>,
    pub p2p: Option<P2PConfig>,
    pub matrix: Option<MatrixConfig>,
    pub logging: Option<LoggingConfig>,
    pub security: Option<SecurityConfig>,
}

#[derive(Debug, Deserialize)]
pub struct XmppConfig {
    pub server: String,
    pub port: u16,
    pub jid: String,
    pub password_env: String,  // Environment variable name
    pub key_store_path: String, // Relative path, resolved below
}

#[derive(Debug, Deserialize)]
pub struct P2PConfig {
    pub identity_key_path: String,
    pub peer_db_path: String,
    pub listen_port: u16,
    pub bootstrap_peers: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct MatrixConfig {
    pub homeserver: String,
    pub user_id: String,
    pub password_env: String,
    pub state_dir: String,
}

#[derive(Debug, Deserialize)]
pub struct LoggingConfig {
    pub level: Option<String>,
    pub file: Option<bool>,
    pub console: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct SecurityConfig {
    pub require_encryption: Option<bool>,
    pub auto_verify: Option<bool>,
}

impl MinimaConfig {
    /// Load config from file, resolve all paths.
    pub fn load() -> Result<Self, ConfigError> {
        let paths = MinimaPaths::resolve()?;
        let config_path = paths.config_file();

        if !config_path.exists() {
            return Err(ConfigError::NotFound(config_path));
        }

        let content = std::fs::read_to_string(&config_path)?;
        let mut config: Self = toml::from_str(&content)?;

        // Resolve relative paths to absolute
        config.resolve_paths(&paths);

        // Validate
        config.validate()?;

        Ok(config)
    }

    /// Resolve all relative paths in the config.
    fn resolve_paths(&mut self, paths: &MinimaPaths) {
        if let Some(xmpp) = &mut self.xmpp {
            if !xmpp.key_store_path.starts_with('/') {
                xmpp.key_store_path = paths.data_dir.join(&xmpp.key_store_path)
                    .to_string_lossy().to_string();
            }
        }

        if let Some(p2p) = &mut self.p2p {
            if !p2p.identity_key_path.starts_with('/') {
                p2p.identity_key_path = paths.data_dir.join(&p2p.identity_key_path)
                    .to_string_lossy().to_string();
            }
            if !p2p.peer_db_path.starts_with('/') {
                p2p.peer_db_path = paths.data_dir.join(&p2p.peer_db_path)
                    .to_string_lossy().to_string();
            }
        }

        if let Some(matrix) = &mut self.matrix {
            if !matrix.state_dir.starts_with('/') {
                matrix.state_dir = paths.data_dir.join(&matrix.state_dir)
                    .to_string_lossy().to_string();
            }
        }
    }

    /// Get password from environment variable.
    pub fn xmpp_password(&self) -> Result<String, ConfigError> {
        let env_name = self.xmpp.as_ref()
            .ok_or(ConfigError::MissingSection("xmpp"))?
            .password_env.clone();

        std::env::var(&env_name)
            .map_err(|_| ConfigError::MissingEnv(env_name))
    }

    pub fn matrix_password(&self) -> Result<String, ConfigError> {
        let env_name = self.matrix.as_ref()
            .ok_or(ConfigError::MissingSection("matrix"))?
            .password_env.clone();

        std::env::var(&env_name)
            .map_err(|_| ConfigError::MissingEnv(env_name))
    }

    fn validate(&self) -> Result<(), ConfigError> {
        // Validate the active mode has its config section
        match self.default_mode.as_deref() {
            Some("xmpp") => {
                self.xmpp.as_ref().ok_or(ConfigError::MissingSection("xmpp"))?;
            }
            Some("p2p") => {
                self.p2p.as_ref().ok_or(ConfigError::MissingSection("p2p"))?;
            }
            Some("matrix") => {
                self.matrix.as_ref().ok_or(ConfigError::MissingSection("matrix"))?;
            }
            Some(other) => return Err(ConfigError::InvalidMode(other.to_string())),
            None => return Err(ConfigError::MissingSection("default_mode")),
        }
        Ok(())
    }
}`,
      },
    ],
  },
  "cross-compile": {
    title: "Step 5: Cross-Compilation",
    desc: "Building for all target architectures: x86_64 (servers), ARMv7 (Raspberry Pi), aarch64 (ARM64), and RISC-V (embedded).",
    sections: [
      {
        heading: "Target Architectures",
        body: "Minima targets four architectures. Each uses musl for static linking (no glibc dependency). The binary runs on any Linux system with that architecture.",
        code: `# Target architectures and their use cases:
#
# x86_64-unknown-linux-musl
#   Servers, desktops, most cloud instances
#   Size: ~6MB (baseline)
#
# aarch64-unknown-linux-musl
#   ARM64 servers (AWS Graviton), Apple Silicon (via Rosetta),
#   Raspberry Pi 4/5 (64-bit OS), Jetson Nano
#   Size: ~5.5MB (ARM code is slightly denser)
#
# armv7-unknown-linux-musleabihf
#   Raspberry Pi 2/3/4 (32-bit OS), industrial controllers,
#   IoT gateways, embedded systems
#   Size: ~4.5MB (32-bit ARM is very compact)
#
# riscv64gc-unknown-linux-gnu
#   RISC-V development boards (SiFive, StarFive),
#   next-gen embedded platforms
#   Size: ~5.8MB (RISC-V code density is good)
#
# All targets use musl (except RISC-V which uses glibc
# due to limited musl support) for static linking.`,
      },
      {
        heading: "Cross-Compilation Setup",
        body: "Using cross (a Docker-based cross-compilation tool) simplifies building for all targets from a single machine.",
        code: `# Install cross (if not already installed)
cargo install cross

# Build for all targets:
#
# x86_64 (native — fastest)
cargo build --release \\
  --target x86_64-unknown-linux-musl \\
  --no-default-features --features xmpp

# aarch64 (cross-compile via cross)
cross build --release \\
  --target aarch64-unknown-linux-musl \\
  --no-default-features --features xmpp

# ARMv7 (cross-compile via cross)
cross build --release \\
  --target armv7-unknown-linux-musleabihf \\
  --no-default-features --features xmpp

# RISC-V (cross-compile via cross)
cross build --release \\
  --target riscv64gc-unknown-linux-gnu \\
  --no-default-features --features xmpp

# Build all modes for x86_64:
cargo build --release \\
  --target x86_64-unknown-linux-musl \\
  --features xmpp,p2p,matrix`,
      },
      {
        heading: "CI Pipeline for All Targets",
        body: "GitHub Actions workflow that builds, strips, and packages Minima for all target architectures.",
        code: `# .github/workflows/release.yml
name: Build Release Binaries

on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - target: x86_64-unknown-linux-musl
            os: ubuntu-latest
            features: xmpp,p2p,matrix
          - target: aarch64-unknown-linux-musl
            os: ubuntu-latest
            features: xmpp,p2p,matrix
          - target: armv7-unknown-linux-musleabihf
            os: ubuntu-latest
            features: xmpp,p2p,matrix
          - target: riscv64gc-unknown-linux-gnu
            os: ubuntu-latest
            features: xmpp
          # macOS builds (XMPP only for size)
          - target: x86_64-apple-darwin
            os: macos-latest
            features: xmpp
          - target: aarch64-apple-darwin
            os: macos-latest
            features: xmpp

    runs-on: ubuntu-latest  # matrix.os from strategy

    steps:
      - uses: actions/checkout@v4

      - name: Install cross
        run: cargo install cross

      - name: Build
        run: |
          # Uses: matrix.target, matrix.features
          cross build --release \\
            --target "$TARGET" \\
            --features "$FEATURES"

      - name: Strip binary
        run: |
          strip "target/$TARGET/release/minima" || true

      - name: Measure size
        run: |
          SIZE=$(stat -c%s "target/$TARGET/release/minima")
          SIZE_MB=$(echo "scale=1; $SIZE / 1048576" | bc)
          echo "Binary size: $TARGET: $SIZE_MB MB"
          if (( $(echo "$SIZE_MB > 10" | bc -l) )); then
            echo "ERROR: Binary exceeds 10MB budget"
            exit 1
          fi

      - name: Package
        run: |
          tar -czf "minima-$TARGET.tar.gz" \\
            -C "target/$TARGET/release/" \\
            minima

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: minima-$TARGET
          path: minima-$TARGET.tar.gz`,
      },
    ],
  },
  audit: {
    title: "Step 6: Final Security & Size Audit",
    desc: "The final check before release: security vulnerability scan, dependency audit, binary analysis, and the go/no-go checklist.",
    sections: [
      {
        heading: "Security Audit Pipeline",
        body: "Run these checks before every release. They catch known vulnerabilities and supply chain issues.",
        code: `#!/bin/bash
# scripts/audit.sh
# Final security and size audit before release.

set -euo pipefail

echo "=== Minima Pre-Release Audit ==="
echo ""

# 1. Dependency vulnerability scan
echo "[1/6] Checking for known vulnerabilities..."
cargo audit
echo ""

# 2. Check for unused dependencies
echo "[2/6] Checking for unused dependencies..."
cargo +nightly udeps --all-features --all-targets 2>/dev/null || \\
  echo "  (install cargo-udeps: cargo install cargo-udeps)"
echo ""

# 3. License compliance
echo "[3/6] Checking dependency licenses..."
cargo deny check licenses 2>/dev/null || \\
  echo "  (install cargo-deny: cargo install cargo-deny)"
echo ""

# 4. Binary size check for all modes
echo "[4/6] Checking binary sizes..."
./scripts/measure-sizes.sh
echo ""

# 5. Binary analysis
echo "[5/6] Analyzing binary composition..."
cargo bloat --release \\
  --no-default-features --features xmpp \\
  --target x86_64-unknown-linux-musl \\
  -n 20
echo ""

# 6. Symbol check (verify no debug symbols remain)
echo "[6/6] Verifying binary is stripped..."
BINARY="target/x86_64-unknown-linux-musl/release/minima"
if file "$BINARY" | grep -q "not stripped"; then
  echo "  WARNING: Binary is not stripped!"
  echo "  Run: strip $BINARY"
else
  echo "  Binary is stripped."
fi

echo ""
echo "=== Audit Complete ==="`,
      },
      {
        heading: "Release Checklist",
        body: "The final go/no-go checklist for a Minima release. Every item must pass.",
        code: `# Pre-Release Checklist
# Every item must be CHECKED before tagging a release.

## Build Verification
- [ ] cargo build --release --features xmpp,p2p,matrix succeeds
- [ ] cargo test --all-features passes all tests
- [ ] cargo clippy --all-features -- -D warnings passes
- [ ] cargo fmt --check passes

## Size Verification
- [ ] XMPP-only binary: < 5MB
- [ ] P2P-only binary: < 7MB
- [ ] Matrix-only binary: < 7MB
- [ ] All-modes binary: < 10MB
- [ ] All binaries are stripped (no debug symbols)

## Security Verification
- [ ] cargo audit: zero known vulnerabilities
- [ ] No OpenSSL dependency (cargo tree -i openssl shows nothing)
- [ ] All passwords read from environment variables (not config file)
- [ ] Key files created with 0600 permissions
- [ ] TLS certificate verification is NOT disabled

## Cross-Platform Verification
- [ ] Builds on x86_64-unknown-linux-musl
- [ ] Builds on aarch64-unknown-linux-musl
- [ ] Builds on armv7-unknown-linux-musleabihf
- [ ] Builds on x86_64-apple-darwin
- [ ] Builds on aarch64-apple-darwin
- [ ] Config paths resolve correctly on Linux
- [ ] Config paths resolve correctly on macOS

## Protocol Verification
- [ ] XMPP: connect, send, receive, list_contacts work
- [ ] XMPP: OMEMO encryption/decryption verified
- [ ] P2P: peer discovery via mDNS works
- [ ] P2P: message exchange via gossipsub works
- [ ] P2P: identity persistence across restarts
- [ ] Matrix: login, sync, join room, send, receive work
- [ ] Matrix: E2EE in encrypted rooms works
- [ ] Matrix: incremental sync (resume from token) works

## Documentation
- [ ] README.md: installation instructions for all platforms
- [ ] README.md: quick start guide (connect + send first message)
- [ ] man page: minima(1) with all subcommands
- [ ] CHANGELOG.md: all changes since last release

## Packaging
- [ ] .tar.gz for each target architecture
- [ ] SHA256 checksums for all archives
- [ ] GPG signatures for all archives
- [ ] Installation script (install.sh) tested`,
      },
      {
        heading: "Post-Release: Monitoring",
        body: "After release, monitor for issues and plan the next iteration.",
        code: `# Post-release monitoring plan:
#
# 1. Binary size regression
#    CI runs measure-sizes.sh on every PR.
#    If any mode exceeds budget, the PR is blocked.
#
# 2. Dependency updates
#    Dependabot/Renovate opens PRs for dependency updates.
#    Each PR must pass size checks AND security audit.
#    cargo-audit runs on a weekly schedule.
#
# 3. User-reported issues
#    Priority matrix:
#    - Security issue: hotfix within 24h
#    - Connectivity issue (can't connect): patch within 1 week
#    - UX issue: next minor release
#    - Feature request: next major release
#
# 4. Platform support
#    As new architectures gain traction (e.g., RISC-V),
#    add them to the CI matrix.
#    Monitor musl compatibility for each target.
#
# 5. Protocol updates
#    XMPP: watch for XEP updates (OMEMO v2, etc.)
#    libp2p: watch for breaking changes in rust-libp2p
#    Matrix: watch for spec changes (Matrix v2, etc.)`,
      },
    ],
  },
};

export function Phase4Optimize() {
  const [activeStep, setActiveStep] = useState<Step>("overview");
  const current = stepContent[activeStep];

  return (
    <section className="phase1-section">
      <div className="phase1-header">
        <div className="phase1-badge" style={{ background: "#f59e0b" }}>
          Phase 4
        </div>
        <div>
          <h2>Optimization & Final Polish</h2>
          <p className="phase1-tagline">
            Binary size analysis, release profiling, cross-compilation, security
            audit, and the go/no-go release checklist
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
                <pre className="code-block">
                  <code>{section.code}</code>
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="phase1-checklist">
        <h4>Phase 4 Deliverables Checklist</h4>
        <div className="checklist-grid">
          {[
            { done: false, text: "cargo-bloat: analyze all three build modes" },
            {
              done: false,
              text: "Release profile: opt-level=z, lto, codegen-units=1, panic=abort, strip=true",
            },
            {
              done: false,
              text: "Dependency pruning: remove unused features from all crates",
            },
            {
              done: false,
              text: "Linker flags: gc-sections, dead_strip, as-needed",
            },
            {
              done: false,
              text: "Platform paths: XDG on Linux, ~/Library on macOS, MINIMA_HOME override",
            },
            {
              done: false,
              text: "Config loader: resolve relative paths, read passwords from env vars",
            },
            {
              done: false,
              text: "Cross-compile: x86_64, aarch64, armv7, riscv64 with musl",
            },
            {
              done: false,
              text: "CI pipeline: build + strip + size-check + package for all targets",
            },
            {
              done: false,
              text: "Security audit: cargo-audit, no OpenSSL, key permissions",
            },
            { done: false, text: "Size verification: all modes under 10MB" },
            { done: false, text: "Release checklist: all items checked" },
            {
              done: false,
              text: "Installation script: tested on clean Linux and macOS",
            },
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
