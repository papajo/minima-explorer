# minima-explorer

An interactive React + Vite explorer for the **Minima** project concept — a high-assurance, privacy-focused messaging system designed for constrained environments.

This app is a technical walkthrough of the proposed system architecture, protocol modes, implementation phases, and example project scaffold. It is **not** the Rust messaging engine itself; it is the companion frontend for exploring and presenting that design.

## Features

- **Architecture** view for the high-level system design
- **Scaffold** browser with example file tree and code previews
- **Modes** comparison for XMPP, P2P, and Matrix approaches
- **Roadmap** and **Size Budget** planning views
- Detailed implementation tabs for:
  - Phase 1: XMPP
  - Phase 2: P2P
  - Phase 3: Matrix
  - Phase 4: Optimize

## Tech Stack

- React 19
- TypeScript
- Vite 6
- CSS

## Getting Started

### Install dependencies

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

Default local URL:

```text
http://localhost:5174/
```

If port `5174` is already in use, Vite will automatically choose the next available port.

### Create a production build

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

## Available Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — create a production build
- `npm run preview` — preview the production build locally
- `npm run typecheck` — run TypeScript project checks
- `npm run lint` — run ESLint across the repo
- `npm run format` — format the repo with Prettier
- `npm run format:check` — verify formatting without changing files
- `npm run test` — start Vitest in watch mode
- `npm run test:run` — run the test suite once

## Project Structure

```text
src/
  App.tsx
  main.tsx
  index.css
  components/
    ArchDiagram.tsx
    CodePreview.tsx
    FileTree.tsx
    ModeExplorer.tsx
    Roadmap.tsx
    SizeBudget.tsx
    Phase1Xmpp.tsx
    Phase2P2P.tsx
    Phase3Matrix.tsx
    Phase4Optimize.tsx
```

## Quality Standards

Before opening a PR, run:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:run
npm run build
```

A GitHub Actions workflow is included to run the same checks in CI.

## Contributing

- See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for local setup and contribution guidance.
- Bug reports and feature requests can use the GitHub issue templates.
- Pull requests can use the included PR template.

## License

This repository is licensed under the [Apache License 2.0](./LICENSE).

## Notes

- The app name and metadata are aligned to `minima-explorer`.
- Build artifacts and dependencies are ignored via `.gitignore`.
- Additional project overview information lives in [`OKF.md`](./OKF.md).

## Next Improvements

- Add screenshots or a short walkthrough GIF
- Continue moving large static content blocks into dedicated data modules
- Expand test coverage beyond the app shell and tab navigation
- Add a live preview deployment target (for example, GitHub Pages or Vercel)
