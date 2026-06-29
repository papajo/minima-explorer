import { useState } from "react";
import { ArchDiagram } from "./components/ArchDiagram";
import { FileTree } from "./components/FileTree";
import { ModeExplorer } from "./components/ModeExplorer";
import { Roadmap } from "./components/Roadmap";
import { SizeBudget } from "./components/SizeBudget";
import { CodePreview } from "./components/CodePreview";
import { Phase1Xmpp } from "./components/Phase1Xmpp";
import { Phase2P2P } from "./components/Phase2P2P";
import { Phase3Matrix } from "./components/Phase3Matrix";
import { Phase4Optimize } from "./components/Phase4Optimize";

type Tab = "architecture" | "scaffold" | "modes" | "roadmap" | "size" | "phase1" | "phase2" | "phase3" | "phase4";

const tabs: { id: Tab; label: string }[] = [
  { id: "architecture", label: "Architecture" },
  { id: "scaffold", label: "Scaffold" },
  { id: "modes", label: "Modes" },
  { id: "roadmap", label: "Roadmap" },
  { id: "size", label: "Size Budget" },
  { id: "phase1", label: "Phase 1: XMPP" },
  { id: "phase2", label: "Phase 2: P2P" },
  { id: "phase3", label: "Phase 3: Matrix" },
  { id: "phase4", label: "Phase 4: Optimize" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("architecture");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect width="28" height="28" rx="6" fill="#3b82f6" />
                <path d="M8 20L14 8L20 20H8Z" fill="#0a0a0a" stroke="#0a0a0a" strokeWidth="1.5" strokeLinejoin="round" />
                <circle cx="14" cy="16" r="2" fill="#3b82f6" />
              </svg>
              <div>
                <h1>Minima</h1>
                <span className="tagline">High-assurance privacy for constrained environments</span>
              </div>
            </div>
            <div className="badges">
              <span className="badge badge-rust">Rust</span>
              <span className="badge badge-size">&lt;10MB</span>
              <span className="badge badge-e2ee">E2EE</span>
            </div>
          </div>
          <nav className="tabs">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={`tab ${activeTab === t.id ? "active" : ""}`}
                onClick={() => {
                  setActiveTab(t.id);
                  setSelectedFile(null);
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main">
        {activeTab === "architecture" && <ArchDiagram />}
        {activeTab === "scaffold" && (
          <div className="scaffold-layout">
            <FileTree onSelect={setSelectedFile} selected={selectedFile} />
            <CodePreview filePath={selectedFile} />
          </div>
        )}
        {activeTab === "modes" && <ModeExplorer />}
        {activeTab === "roadmap" && <Roadmap />}
        {activeTab === "size" && <SizeBudget />}
        {activeTab === "phase1" && <Phase1Xmpp />}
        {activeTab === "phase2" && <Phase2P2P />}
        {activeTab === "phase3" && <Phase3Matrix />}
        {activeTab === "phase4" && <Phase4Optimize />}
      </main>
    </div>
  );
}
