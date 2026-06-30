# minima-explorer

## Overview

`minima-explorer` is a Vite + React + TypeScript frontend that presents the architecture, roadmap, protocol modes, and implementation phases for **Minima**, a high-assurance privacy-focused messaging system designed for constrained environments. The app acts as an interactive explorer rather than the Rust implementation itself.

## Objectives

- Provide a clear, interactive walkthrough of the Minima architecture and protocol tradeoffs.
- Make the proposed Rust project scaffold and example source layout easy to inspect.
- Explain the phased implementation plan for XMPP, P2P, Matrix, and optimization work.
- Keep the developer experience lightweight and easy to run locally.

## Key Results

- Local development runs successfully with `npm run dev` on port `5174` by default.
- Production build completes successfully with `npm run build`.
- The UI exposes dedicated sections for architecture, scaffold, modes, roadmap, size budget, and four implementation phases.
- Project metadata and naming are aligned to `minima-explorer`.

## Architecture

- **Type**: Single-page frontend application / interactive technical explorer
- **Language**: TypeScript
- **Framework**: React 19
- **Build Tool**: Vite 6
- **Styling**: Project-local CSS (`src/index.css`)
- **Entry Point**: `src/main.tsx`
- **Root App**: `src/App.tsx`

## Dependencies

Top critical dependencies:

- **react** — UI rendering
- **react-dom** — browser mounting for the React app
- **vite** — dev server and production bundling
- **typescript** — static typing and project compilation
- **@vitejs/plugin-react** — Vite integration for React

## Project Structure

- `src/App.tsx` — tabbed shell and top-level navigation
- `src/components/ArchDiagram.tsx` — architecture visualization
- `src/components/FileTree.tsx` — scaffold browser
- `src/components/CodePreview.tsx` — embedded source/config previews
- `src/components/ModeExplorer.tsx` — XMPP/P2P/Matrix comparison
- `src/components/Roadmap.tsx` — implementation roadmap
- `src/components/SizeBudget.tsx` — binary size budget view
- `src/components/Phase1Xmpp.tsx` — XMPP phase details
- `src/components/Phase2P2P.tsx` — P2P phase details
- `src/components/Phase3Matrix.tsx` — Matrix phase details
- `src/components/Phase4Optimize.tsx` — optimization phase details

## Current State

- npm dependencies installed
- dev server verified working
- production build verified working
- `.gitignore` updated for Node/Vite artifacts
- legacy `gitlawb` naming removed from source metadata

## Next Steps

- Add a `README.md` with setup, purpose, and screenshots.
- Add linting and formatting scripts for repeatable local checks.
- Add lightweight component tests for critical explorer views.
- Consider extracting shared data objects from large component files into dedicated data modules.
