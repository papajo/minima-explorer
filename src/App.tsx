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

const getTabId = (id: Tab) => `tab-${id}`;
const getPanelId = (id: Tab) => `panel-${id}`;

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
          <nav className="tabs" role="tablist" aria-label="Explorer sections">
            {tabs.map((t) => (
              <button
                key={t.id}
                id={getTabId(t.id)}
                role="tab"
                type="button"
                aria-selected={activeTab === t.id}
                aria-controls={getPanelId(t.id)}
                tabIndex={activeTab === t.id ? 0 : -1}
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
        {activeTab === "architecture" && (
          <section role="tabpanel" id={getPanelId("architecture")} aria-labelledby={getTabId("architecture")}>
            <ArchDiagram />
          </section>
        )}
        {activeTab === "scaffold" && (
          <section role="tabpanel" id={getPanelId("scaffold")} aria-labelledby={getTabId("scaffold")}>
            <div className="scaffold-layout">
              <FileTree onSelect={setSelectedFile} selected={selectedFile} />
              <CodePreview filePath={selectedFile} />
            </div>
          </section>
        )}
        {activeTab === "modes" && (
          <section role="tabpanel" id={getPanelId("modes")} aria-labelledby={getTabId("modes")}>
            <ModeExplorer />
          </section>
        )}
        {activeTab === "roadmap" && (
          <section role="tabpanel" id={getPanelId("roadmap")} aria-labelledby={getTabId("roadmap")}>
            <Roadmap />
          </section>
        )}
        {activeTab === "size" && (
          <section role="tabpanel" id={getPanelId("size")} aria-labelledby={getTabId("size")}>
            <SizeBudget />
          </section>
        )}
        {activeTab === "phase1" && (
          <section role="tabpanel" id={getPanelId("phase1")} aria-labelledby={getTabId("phase1")}>
            <Phase1Xmpp />
          </section>
        )}
        {activeTab === "phase2" && (
          <section role="tabpanel" id={getPanelId("phase2")} aria-labelledby={getTabId("phase2")}>
            <Phase2P2P />
          </section>
        )}
        {activeTab === "phase3" && (
          <section role="tabpanel" id={getPanelId("phase3")} aria-labelledby={getTabId("phase3")}>
            <Phase3Matrix />
          </section>
        )}
        {activeTab === "phase4" && (
          <section role="tabpanel" id={getPanelId("phase4")} aria-labelledby={getTabId("phase4")}>
            <Phase4Optimize />
          </section>
        )}
      </main>
    </div>
  );
}
