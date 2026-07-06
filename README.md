# OffKilter File Butler

<p align="center">
  <img src="assets/brand/offkilter-logo-primary.svg" alt="OffKilter" width="380">
</p>

File Butler is an OffKilter plugin and desktop app for tidying file-heavy folders without writing scripts. It lets a user choose up to three folders, configure a safe rename/move rule for each one, preview the planned changes, apply only reviewed changes, and undo the last applied run from the recorded action log.

The product is desktop-first for non-technical users. The core package is intentionally separate so the same runner can be used by:

- the standalone desktop app
- command-line and development tooling
- future OffKilter Core plugin hosting

## About OffKilter

OffKilter is a practical tool ecosystem for small operators who need useful software without heavy setup or technical ceremony. File Butler is the first public plugin slice: it proves the plugin structure, the desktop delivery path, the logging model, and the safety rules that future OffKilter plugins should follow.

This repository includes OffKilter brand assets in `assets/brand/` so installers, releases, and documentation can carry the correct source attribution. The plugin and code are MIT licensed, but the OffKilter name and logos should be used to identify the original source of this project and not to imply endorsement of unrelated forks or products.

## Download

Stable builds are published through GitHub Releases.

1. Open the latest release.
2. Download the Windows installer asset.
3. Run the installer.
4. Open File Butler.
5. Choose a small test folder first, preview changes, then apply.

Release builds are produced by the GitHub Actions workflow in `.github/workflows/build.yml`. Tagged versions like `v0.1.0` create a draft release with downloadable desktop artifacts.

## Safety Model

File Butler is deliberately conservative:

- Preview before writes.
- No silent overwrites.
- No deleting source files.
- Conflicts are shown as skipped or needs review.
- Applied runs are written to JSON action logs.
- Undo uses the action log and refuses unsafe overwrites.
- Folder access is limited to user-selected folders.

## MVP Boundaries

- Maximum three watched folders.
- Each watched folder has one predefined rename action.
- Dry-run planning before any write.
- Never delete originals.
- Conflicts are handled explicitly.
- Every applied run must be logged so it can be undone.

## What Is Included

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
- split standard/custom plugin test suites documented in `docs/TESTING.md`
- desktop bridge QA sample test for larger disposable file sets

## Repository Layout

```text
.offkilter/                  Plugin manifest and config schema
.github/workflows/           Build, test, and release automation
assets/brand/                OffKilter and File Butler logo assets
apps/desktop/                Tauri + React desktop app
packages/core/               File planning, preview, apply, log, and undo logic
docs/                        Product, UI, and testing notes
```

## Plugin Manifest

The plugin metadata lives in `.offkilter/plugin.json`.

Current capabilities:

- `file.plan`
- `file.rename`
- `file.move`
- `file.undo`

Filesystem permissions are scoped to folders selected by the user.

## Development Commands

```bash
npm install
npm run check
npm run test:standard
npm run test:custom
npm test --workspace @offkilter/file-butler-desktop
npm run tauri:dev --workspace @offkilter/file-butler-desktop
```

Native Tauri builds on Linux need Rust plus system packages:

```bash
sudo apt-get install -y build-essential pkg-config libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev
```

In WSL, the system package install may need to be run manually because sudo requires an interactive password.

## Release Process

1. Make sure the working tree is clean.
2. Run `npm run check`.
3. Run `cargo check` from `apps/desktop/src-tauri`.
4. Tag the release, for example `git tag v0.1.0`.
5. Push the tag.
6. Let GitHub Actions build the Windows installer and create a draft release.
7. Review the release assets, then publish the release.

## Logs

Every apply run writes a JSON action log. The log captures the planned action, final status, source path, target path, and error message where relevant. Undo reads this log and moves files back only when doing so is safe.

Application state and run logs are stored in the app data directory for the current user. The exact location depends on the operating system and the Tauri runtime path for `app.offkilter.file-butler`.

## Brand Assets

Included assets:

- `assets/brand/offkilter-logo-primary.svg`
- `assets/brand/offkilter-logo-compact.svg`
- `assets/brand/offkilter-mark.svg`
- `assets/brand/offkilter-wordmark.svg`
- `assets/brand/offkilter-icon-512.png`
- `assets/brand/file-butler-icon.png`

Use these assets when presenting File Butler as an OffKilter plugin. For forks, keep source attribution clear and avoid using OffKilter branding in a way that suggests the fork is the official release.

## License

MIT. See `LICENSE`.
