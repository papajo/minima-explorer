# Contributing to minima-explorer

Thanks for your interest in improving `minima-explorer`.

## Local setup

```bash
npm install
npm run dev
```

Default local URL:

```text
http://localhost:5174/
```

## Quality checks

Before opening a pull request, run:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

## Development guidelines

- Keep the UI accessible and keyboard-friendly.
- Prefer small, focused components where possible.
- When adding static educational content, keep rendering logic separate from large data blocks when practical.
- Update `README.md` when setup steps, scripts, or major project structure changes.

## Branches and pull requests

- Create a branch for your work instead of committing directly to `main`.
- Use clear commit messages (for example: `docs: ...`, `feat: ...`, `fix: ...`, `chore: ...`).
- Include a concise summary of what changed and how it was validated.

## Reporting issues

Please use the issue templates when reporting bugs or requesting features.
