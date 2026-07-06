# OffKilter File Butler

File Butler keeps up to three user-selected folders tidy by previewing and applying predefined rename actions.

The product is desktop-first for non-technical users. The core package is intentionally separate so the same runner can be used by:

- the standalone desktop app
- internal CLI/dev tooling
- future OffKilter Core plugin hosting

## MVP Boundaries

- Maximum three watched folders.
- Each watched folder has one predefined rename action.
- Dry-run planning before any write.
- Never delete originals.
- Conflicts are handled explicitly.
- Every applied run must be logged so it can be undone.

## Current State

This repo currently contains the first core and desktop slice:

- config validation
- source folder scanning
- rename pattern rendering
- safe action planning
- UI-ready preview orchestration
- safe apply execution
- per-run action logs
- undo support for applied runs
- plugin manifest draft
- Tauri + React desktop shell
- Node bridge that lets the Tauri shell call the TypeScript core without duplicating file logic
- tests for the max-folder, rename-planning, apply, conflict, and undo rules

## Development Commands

```bash
npm install
npm run check
npm run tauri:dev --workspace @offkilter/file-butler-desktop
```

Native Tauri builds on Linux need Rust plus system packages:

```bash
sudo apt-get install -y build-essential pkg-config libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev
```

In WSL, the system package install may need to be run manually because sudo requires an interactive password.
