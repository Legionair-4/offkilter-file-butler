# File Butler MVP Spec

## Product Promise

Download, install, choose up to three folders, choose what each folder should do, preview the changes, then turn it on.

## Target User

Small-business operators or admin staff who receive messy downloads, invoices, receipts, scans, and PDFs but are not comfortable using a terminal.

## Hard Scope

- The app watches no more than three folders.
- Each folder has one rename action.
- The app previews changes before applying them.
- The app keeps an action log.
- The app supports undo for applied runs.
- The app never deletes originals as part of MVP behaviour.

## Folder Rule

Each watched folder has:

- name
- source folder
- optional destination folder
- rename pattern
- conflict behaviour
- enabled/disabled state

## Rename Pattern Tokens

Initial supported tokens:

- `{originalName}`
- `{originalBase}`
- `{ext}`
- `{date}`

Later document-specific tokens can be added after extraction logic exists:

- `{vendor}`
- `{amount}`
- `{invoiceNumber}`

## First Useful Actions

1. Preview a folder using one configured rename pattern.
2. Apply safe renames/moves.
3. Log every action.
4. Undo an applied run.
5. Watch folders in the background after setup.

## Preview Flow

The desktop app should call the core preview runner before any apply action:

1. Validate config.
2. Scan enabled source folders.
3. Build a dry-run plan.
4. Show ready, skipped, conflict, and needs-review rows.
5. Enable Apply only when the user has reviewed the plan.

## Plugin Compatibility

All business logic lives in `packages/core`.

The future desktop app and future OffKilter Core plugin host both import the same core runner. The desktop app must not contain rename planning, conflict handling, or undo logic directly.

## UI Direction

The desktop UI must stay simple, clean, and visually consistent with the OffKilter website theme. Use the existing OffKilter CSS/design tokens as the reference and keep the first version to one setup/preview/apply flow.
