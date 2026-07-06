# Plugin Testing Standard

Every OffKilter plugin should have two test lanes:

1. `test:standard` covers the shared plugin contract that every plugin must satisfy.
2. `test:custom` covers behaviour unique to that plugin.

The root `npm test` command must run both lanes. The root `npm run check` command must build first, then run the full test suite.

## Standard Contract

For file/action plugins, the standard suite must prove:

- invalid config is rejected before any filesystem work
- preview/dry-run returns planned actions without mutating files
- conflicts are surfaced instead of silently overwriting targets
- apply skips non-ready actions and records a run log
- undo refuses to overwrite a recreated original path

For non-file plugins, keep the same intent and adapt the details:

- validate inputs before side effects
- preview or plan before write/execute
- report conflicts or external failures clearly
- log enough state to recover or audit a run
- make destructive or irreversible work impossible by default

## Custom Suite

Each plugin also needs comprehensive tests for its own job.

File Butler currently covers:

- maximum watched-folder validation
- disabled empty folder slots
- source folder scanning and extension filtering
- rename pattern planning
- append-counter conflicts
- needs-review conflicts
- already-clean skipped actions
- apply success
- missing source failure
- overwrite refusal
- undo success
- undo overwrite refusal
- preview read errors
- desktop bridge QA workspace generation with 120 disposable files

## Required Scripts

Each plugin package should expose:

```bash
npm run build
npm run test:standard
npm run test:custom
npm test
npm run check
```

Desktop plugins should also keep a native-shell verification command, such as `cargo check` or the platform equivalent, in their release checklist.

The current local Linux package gate builds `.deb` and `.rpm`. AppImage packaging also requires `xdg-utils` so `/usr/bin/xdg-open` is available on the build host.

## File Butler Manual QA Path

Before testing with real user folders:

1. Run `npm run check`.
2. Run `cargo check` from `apps/desktop/src-tauri`.
3. Run `npm run tauri:build --workspace @offkilter/file-butler-desktop`.
4. Run the desktop app in dev mode.
5. Click `Load QA sample`.
6. Click `Preview` and confirm 120 ready actions.
7. Click `Apply` and confirm the apply result shows renamed files.
8. Click `Undo` and confirm the files are restored.
9. Only then test with a small disposable folder created outside the app.
