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

This repo currently contains the first core slice:

- config validation
- source folder scanning
- rename pattern rendering
- safe action planning
- UI-ready preview orchestration
- safe apply execution
- per-run action logs
- undo support for applied runs
- plugin manifest draft
- tests for the max-folder, rename-planning, apply, conflict, and undo rules

Desktop UI and installers come after the core runner is stable.
